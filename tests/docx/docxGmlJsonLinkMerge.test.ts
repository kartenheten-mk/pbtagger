import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseDocx } from '../../src/docx/DocxParser';

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
});
