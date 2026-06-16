import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { parseDocx } from '../../src/docx/DocxParser';

function buildTableDocx(): ArrayBuffer {
  const zip = new PizZip();

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Before table</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:gridSpan w:val="2"/></w:tcPr>
          <w:p><w:r><w:t>A2+B2</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:r><w:t>After table</w:t></w:r></w:p>
  </w:body>
</w:document>`
  );

  return zip.generate({ type: 'arraybuffer' });
}

describe('DocxParser table structure', () => {
  it('preserves DOCX table rows and cells in DocModel.blocks while keeping flat paragraph indices', async () => {
    const result = await parseDocx(buildTableDocx());

    expect(result.docModel.paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join('')))
      .toEqual(['Before table', 'A1', 'B1', 'A2+B2', 'After table']);

    expect(result.docModel.paragraphs[1]).toMatchObject({
      index: 1,
      tableId: 'table_1',
      tableIndex: 1,
      isTableStart: true,
    });
    expect(result.docModel.paragraphs[2]).toMatchObject({
      index: 2,
      tableId: 'table_1',
      tableIndex: 1,
      isTableStart: false,
    });

    expect(result.docModel.blocks).toEqual([
      { type: 'paragraph', paragraphIndex: 0 },
      {
        type: 'table',
        tableId: 'table_1',
        tableIndex: 1,
        rows: [
          {
            cells: [
              { paragraphIndices: [1], colSpan: undefined },
              { paragraphIndices: [2], colSpan: undefined },
            ],
          },
          {
            cells: [
              { paragraphIndices: [3], colSpan: 2 },
            ],
          },
        ],
      },
      { type: 'paragraph', paragraphIndex: 4 },
    ]);
  });
});