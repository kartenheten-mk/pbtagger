import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import { parseDocx } from '../../src/docx/DocxParser';
import { parseDetaljplanJson } from '../../src/geometry/detaljplanParser';
import { buildMirroredDisplayLinks } from '../../src/geometry/tagLinkMirror';
import { generateBookmarkName } from '../../src/docx/bookmarkUtils';
import type { Tag } from '../../src/types';

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

const PLANBESKRIVNING_NS =
  'http://namespace.lantmateriet.se/distribution/geodatakatalog/planbeskrivning/v2';
const LMG_NS = 'http://namespace.lantmateriet.se/distribution/geometri/v2';
const GML_NS = 'http://www.opengis.net/gml/3.2';

function buildBookmarkOnlyDocx(bookmarkName: string): ArrayBuffer {
  const zip = new PizZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Intro </w:t></w:r>
      <w:bookmarkStart w:id="1" w:name="${bookmarkName}"/>
      <w:r><w:t>Linked text</w:t></w:r>
      <w:bookmarkEnd w:id="1"/>
      <w:r><w:t> outro</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`
  );
  zip.file(
    'customXml/item1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Planbeskrivning xmlns="${PLANBESKRIVNING_NS}"
                 xmlns:lmg="${LMG_NS}"
                 xmlns:gml="${GML_NS}">
  <objektidentitet>12345678-1234-1234-1234-123456789012</objektidentitet>
  <objektversion>1</objektversion>
  <versionGiltigFran>2022-11-17T14:24:34.123+01:00</versionGiltigFran>
  <detaljplansreferens>12345678-cafe-cafe-cafe-123456789012</detaljplansreferens>
  <Objektmetadata>
    <programvara>Test</programvara>
    <programvaruversion>1.0</programvaruversion>
  </Objektmetadata>
  <Omfattning>
    <identitet>${bookmarkName}</identitet>
    <Lage>
      <lmg:Yta>
        <gml:Polygon srsName="urn:ogc:def:crs:EPSG::3006">
          <gml:exterior>
            <gml:LinearRing>
              <gml:posList>6762838 474162 6762860 474137 6762872 474120 6762838 474162</gml:posList>
            </gml:LinearRing>
          </gml:exterior>
        </gml:Polygon>
      </lmg:Yta>
    </Lage>
    <Indelning>
      <tema>syfte</tema>
      <grupp>syfte</grupp>
    </Indelning>
  </Omfattning>
</Planbeskrivning>`
  );

  return zip.generate({ type: 'arraybuffer' });
}

describe('DOCX import keeps JSON geometry links without duplicating GML links', () => {
  it('restores bookmark-only DOCX GML links without a JSON file', async () => {
    const seedTag: Tag = {
      uuid: '11111111-2222-3333-4444-555555555555',
      categoryId: 'detaljplanens-syfte--syfte',
      targetType: 'text',
      text: 'Linked text',
      paragraphIndex: 0,
      startOffset: 6,
      endOffset: 17,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const bookmarkName = generateBookmarkName(seedTag);

    const parsedDocx = await parseDocx(buildBookmarkOnlyDocx(bookmarkName));
    const importedGeometryUuid = parsedDocx.planbeskrivning?.geometries[0]?.uuid;

    expect(importedGeometryUuid).toBeTruthy();
    expect(parsedDocx.tags).toHaveLength(1);
    expect(parsedDocx.tags[0]).toMatchObject({
      categoryId: seedTag.categoryId,
      targetType: 'text',
      text: 'Linked text',
      paragraphIndex: 0,
      startOffset: 6,
      endOffset: 17,
      geometryIds: [importedGeometryUuid],
    });
  });

  it('does not append imported GML UUIDs when tags already have JSON geometryIds', async () => {
    const docxPath = path.join(
      __dirname,
      '../docx_example_file/2_old_gml_tag_2_new.docx'
    );

    const docxBuffer = fs.readFileSync(docxPath);
    const parsedDocx = await parseDocx(toArrayBuffer(docxBuffer));
    const importedGmlUuidSet = new Set(
      (parsedDocx.planbeskrivning?.geometries ?? []).map((g) => g.uuid)
    );
    expect(importedGmlUuidSet.size).toBeGreaterThan(0);

    const tagsWithLinks = parsedDocx.tags.filter(
      (tag) => (tag.geometryIds?.length ?? 0) > 0
    );
    expect(tagsWithLinks.length).toBeGreaterThan(0);

    // No tag should end up with mixed links (both imported GML UUIDs and
    // non-GML UUIDs) after parsing this round-trip file.
    // Mixed sets are what create duplicate links in the UI.
    for (const tag of tagsWithLinks) {
      const ids = tag.geometryIds ?? [];
      const gmlCount = ids.filter((id) => importedGmlUuidSet.has(id)).length;
      const nonGmlCount = ids.length - gmlCount;
      expect(gmlCount > 0 && nonGmlCount > 0).toBe(false);
    }
  });

  it('resolves DOCX GML links for stale JSON-linked tags when no JSON file is loaded', async () => {
    const docxPath = path.join(
      __dirname,
      '../docx_example_file/document_with_gml_tags.docx'
    );

    const parsedDocx = await parseDocx(toArrayBuffer(fs.readFileSync(docxPath)));
    const docxGmlGeometries = parsedDocx.planbeskrivning?.geometries ?? [];
    expect(docxGmlGeometries.length).toBeGreaterThan(0);

    const mirrored = buildMirroredDisplayLinks(
      parsedDocx.tags,
      new Set(),
      docxGmlGeometries
    );

    const tagsWithDocxGmlMatches = parsedDocx.tags.filter((tag) => {
      const explicitIds = new Set(tag.geometryIds ?? []);
      const mirroredIds = mirrored.get(tag.uuid) ?? new Set<string>();
      return Array.from(mirroredIds).some(
        (id) => !explicitIds.has(id) && docxGmlGeometries.some((geo) => geo.uuid === id)
      );
    });

    expect(tagsWithDocxGmlMatches.length).toBeGreaterThan(0);
  });

  it('can still resolve imported DOCX GML links for JSON-linked tags at display time', async () => {
    const docxPath = path.join(
      __dirname,
      '../docx_example_file/2_old_gml_tag_2_new.docx'
    );
    const jsonPath = path.join(
      __dirname,
      '../geometry_json_file/dp225.json'
    );

    const parsedDocx = await parseDocx(toArrayBuffer(fs.readFileSync(docxPath)));
    const parsedJson = parseDetaljplanJson(
      JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Record<string, unknown>,
      'dp225.json'
    );

    const mirrored = buildMirroredDisplayLinks(
      parsedDocx.tags,
      new Set(parsedJson.geometries.map((geometry) => geometry.uuid)),
      parsedDocx.planbeskrivning?.geometries ?? []
    );

    const tagsWithImportedDocxMatches = parsedDocx.tags.filter((tag) => {
      const mirroredIds = mirrored.get(tag.uuid) ?? new Set<string>();
      const explicitIds = new Set(tag.geometryIds ?? []);
      return Array.from(mirroredIds).some((geometryId) => !explicitIds.has(geometryId));
    });

    expect(tagsWithImportedDocxMatches.length).toBeGreaterThan(0);
  });
});
