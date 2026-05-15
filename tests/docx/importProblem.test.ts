/**
 * Integration test: parse the problematic .docx and verify all 6 tags are imported.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseDocx } from '../../src/docx/DocxParser';

describe('Import all tags from Planbeskrivning_all_gml_tags_not_imported.docx', () => {
  it('should import all 6 tags', async () => {
    const filePath = path.join(
      __dirname,
      '../docx_example_file/Planbeskrivning_all_gml_tags_not_imported.docx'
    );
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );

    const result = await parseDocx(arrayBuffer);

    console.log('=== parseDocx result ===');
    console.log(`Tags count: ${result.tags.length}`);
    result.tags.forEach((tag, i) => {
      const suffix = tag.uuid.replace(/-/g, '').slice(0, 8);
      console.log(
        `  ${i + 1}. uuid=${tag.uuid} suffix=${suffix} cat=${tag.categoryId} para=${tag.paragraphIndex} offsets=${tag.startOffset}-${tag.endOffset} endPara=${tag.endParagraphIndex ?? 'none'} text="${tag.text.slice(0, 60)}..."`
      );
    });

    if (result.planbeskrivning) {
      console.log(`\nPlanbeskrivning geometries: ${result.planbeskrivning.geometries.length}`);
      console.log(`identitetToGeometryUuid entries: ${result.planbeskrivning.identitetToGeometryUuid.size}`);
      for (const [k, v] of result.planbeskrivning.identitetToGeometryUuid) {
        console.log(`  ${k} => [${v.join(', ')}]`);
      }
    } else {
      console.log('\nNo planbeskrivning data found');
    }

    // Expect all 6 tags
    expect(result.tags.length).toBe(6);

    // Verify the identitetToGeometryUuid map uses string[] values
    if (result.planbeskrivning) {
      for (const [, uuids] of result.planbeskrivning.identitetToGeometryUuid) {
        expect(Array.isArray(uuids)).toBe(true);
        expect(uuids.length).toBeGreaterThan(0);
      }
    }
  });
});
