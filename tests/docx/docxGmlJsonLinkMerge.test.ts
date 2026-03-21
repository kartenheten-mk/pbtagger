import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseDocx } from '../../src/docx/DocxParser';
import { parseDetaljplanJson } from '../../src/geometry/detaljplanParser';
import { buildMirroredDisplayLinks } from '../../src/geometry/tagLinkMirror';

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

describe('DOCX import keeps JSON geometry links without duplicating GML links', () => {
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
