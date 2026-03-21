import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import { parseDocx } from '../../src/docx/DocxParser';
import { exportDocx } from '../../src/docx/DocxExporter';
import * as fileSaver from 'file-saver';
import { DOMParser } from '@xmldom/xmldom';
import { buildDefaultConfig } from '../../src/docx/PlanbeskrivningXmlBuilder';

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

describe('DocxExporter', () => {
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

  it('allows export when compliance blocking is disabled', async () => {
    const filePath = path.join(__dirname, '../docx_example_file/error_when_opening_in_word.docx');
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const { zip: originalZip, docModel, tags } = await parseDocx(arrayBuffer);

    expect(tags.length).toBeGreaterThan(0);
    const invalidTags = tags.map((t, i) =>
      i === 0 ? { ...t, categoryId: 'invalid-category-for-test' } : t
    );

    // Strict mode: should block
    await expect(
      exportDocx(originalZip, docModel, invalidTags, 'strict.docx', {
        config: buildDefaultConfig(),
        geometries: [],
        enforceCompliance: true,
      })
    ).rejects.toThrow(/PLANB-004/);

    // Optional mode: should allow export
    await expect(
      exportDocx(originalZip, docModel, invalidTags, 'optional.docx', {
        config: buildDefaultConfig(),
        geometries: [],
        enforceCompliance: false,
      })
    ).resolves.toBeUndefined();

    expect(fileSaver.saveAs).toHaveBeenCalledTimes(1);
  });
});
