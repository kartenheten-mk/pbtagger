import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import { parseDocx } from '../../src/docx/DocxParser';
import { exportDocx } from '../../src/docx/DocxExporter';
import * as fileSaver from 'file-saver';
import { DOMParser } from '@xmldom/xmldom';
import { buildDefaultConfig } from '../../src/docx/PlanbeskrivningXmlBuilder';
import { generateBookmarkName } from '../../src/docx/bookmarkUtils';
import type { Geometry } from '../../src/types';

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

describe('DocxExporter', () => {
  function getSavedBlob(): Blob {
    expect(fileSaver.saveAs).toHaveBeenCalled();
    const saveAsMock = vi.mocked(fileSaver.saveAs);
    return saveAsMock.mock.calls.at(-1)?.[0] as Blob;
  }

  function findCustomXmlByNamespace(zip: PizZip, namespace: string): string {
    const match = Object.keys(zip.files)
      .filter((name) => /^customXml\/item\d+\.xml$/.test(name))
      .find((name) => zip.file(name)?.asText().includes(namespace));
    expect(match).toBeTruthy();
    return match!;
  }

  it('does not create nested w:sdt tags when re-exporting a tagged document', async () => {
    // 1. Read the corrupted document which already has our tags in it
    const filePath = path.join(__dirname, '../docx_example_file/error_when_opening_in_word.docx');
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    // 2. Parse it
    const { zip: originalZip, docModel, tags } = await parseDocx(arrayBuffer);

    // 3. Export it again
    await exportDocx(originalZip, docModel, tags, 'test.docx');

    // 4. Extract the generated blob from the saveAs mock
    expect(fileSaver.saveAs).toHaveBeenCalled();
    const saveAsMock = vi.mocked(fileSaver.saveAs);
    const blob = saveAsMock.mock.calls[0][0] as Blob;

    // We can't easily read Blobs in Node environment during tests using the native Blob API
    // without doing `await blob.arrayBuffer()`, but wait, JS/TS blob.arrayBuffer() works in vitest.
    const exportedBuffer = await blob.arrayBuffer();

    // 5. Unzip and check word/document.xml
    const newZip = new PizZip(exportedBuffer);
    const docXmlFile = newZip.file('word/document.xml');
    expect(docXmlFile).toBeDefined();

    const docXmlString = docXmlFile!.asText();
    const parser = new DOMParser();
    const docDom = parser.parseFromString(docXmlString, 'application/xml');

    // 6. Assert no nested SDTs
    const sdts = Array.from(docDom.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'sdt'));

    // For each sdt, ensure it doesn't have an sdt child inside its sdtContent
    let nestedCount = 0;
    for (const sdt of sdts) {
      const sdtContents = sdt.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'sdtContent');
      if (sdtContents.length > 0) {
        const innerSdts = sdtContents[0].getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'sdt');
        if (innerSdts.length > 0) {
          nestedCount++;
        }
      }
    }

    expect(nestedCount).toBe(0);
  });

  it('keeps app-only tags in pb:tags but excludes them from Planbeskrivning XML', async () => {
    vi.mocked(fileSaver.saveAs).mockClear();

    const filePath = path.join(__dirname, '../docx_example_file/error_when_opening_in_word.docx');
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const { zip: originalZip, docModel, tags } = await parseDocx(arrayBuffer);

    expect(tags.length).toBeGreaterThan(0);
    const appOnlyTags = tags.map((t, i) =>
      i === 0 ? { ...t, categoryId: 'invalid-category-for-test' } : t
    );
    const excludedBookmark = generateBookmarkName(appOnlyTags[0]);

    await expect(
      exportDocx(originalZip, docModel, appOnlyTags, 'excluded-tag.docx', {
        config: buildDefaultConfig(),
        geometries: [],
        enforceCompliance: true,
      })
    ).resolves.toBeUndefined();

    const exportedBuffer = await getSavedBlob().arrayBuffer();
    const newZip = new PizZip(exportedBuffer);

    const pbTagsPath = findCustomXmlByNamespace(newZip, 'https://planbeskrivning/tagging/v1');
    const planbeskrivningPath = findCustomXmlByNamespace(
      newZip,
      'http://namespace.lantmateriet.se/distribution/geodatakatalog/planbeskrivning/v2'
    );

    const pbTagsXml = newZip.file(pbTagsPath)!.asText();
    const planbeskrivningXml = newZip.file(planbeskrivningPath)!.asText();

    expect(pbTagsXml).toContain('invalid-category-for-test');
    expect(planbeskrivningXml).not.toContain(excludedBookmark);
  });

  it('allows export when compliance blocking is disabled for true spec errors', async () => {
    vi.mocked(fileSaver.saveAs).mockClear();

    const filePath = path.join(__dirname, '../docx_example_file/error_when_opening_in_word.docx');
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const { zip: originalZip, docModel, tags } = await parseDocx(arrayBuffer);

    expect(tags.length).toBeGreaterThan(0);
    const invalidTags = tags.map((t, i) =>
      i === 0 ? { ...t, geometryIds: ['temp-id-for-test'] } : t
    );
    const invalidGeometries: Geometry[] = [{
      uuid: 'temp-id-for-test',
      name: 'Temp object',
      type: 'polygon',
      coordinates: [] as unknown as number[][][],
      crs: 'EPSG:3006',
      featureType: 'annat-objekt',
      properties: {},
    }];

    // Strict mode: should still block for real compliance errors.
    await expect(
      exportDocx(originalZip, docModel, invalidTags, 'strict.docx', {
        config: buildDefaultConfig(),
        geometries: invalidGeometries,
        enforceCompliance: true,
      })
    ).rejects.toThrow(/PLANB-007/);

    // Optional mode: should allow export
    await expect(
      exportDocx(originalZip, docModel, invalidTags, 'optional.docx', {
        config: buildDefaultConfig(),
        geometries: invalidGeometries,
        enforceCompliance: false,
      })
    ).resolves.toBeUndefined();

    expect(fileSaver.saveAs).toHaveBeenCalledTimes(1);
  });
});
