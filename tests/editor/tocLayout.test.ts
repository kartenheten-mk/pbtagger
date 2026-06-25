import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseDocx } from '../../src/docx/DocxParser';
import type { DocParagraph } from '../../src/types';
import { buildTocDecorations, parseTocEntry } from '../../src/editor/tocLayout';

const gronklittFixturePath = path.join(
  __dirname,
  '../docx_example_file/KOPIA Planbeskrivning Grönklitt omr 1 antagande.docx'
);

function makeParagraph(text: string, styleId = 'Innehll2'): DocParagraph {
  return {
    index: 0,
    headingLevel: 0,
    styleId,
    runs: [{ id: 'r1', text }],
  };
}

describe('tocLayout', () => {
  it('parses a Word-style tabbed TOC row into marker, title, page, and level', () => {
    const paragraph = makeParagraph('\t\t4.7 \tNatur och miljö\t16');

    expect(parseTocEntry(paragraph, 1)).toEqual({
      marker: '4.7',
      title: 'Natur och miljö',
      page: '16',
      level: 1,
    });
  });

  it.skipIf(!fs.existsSync(gronklittFixturePath))(
    'identifies TOC rows from the Grönklitt Word fixture without exposing PAGEREF instructions',
    async () => {
      const buffer = fs.readFileSync(gronklittFixturePath);
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      );

      const result = await parseDocx(arrayBuffer);
      const text = result.docModel.paragraphs
        .flatMap((paragraph) => paragraph.runs.map((run) => run.text))
        .join('');

      expect(text).not.toContain('PAGEREF');

      const decorations = buildTocDecorations(result.docModel.paragraphs);
      const entries = Array.from(decorations.entries.values());

      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            marker: '4.7',
            title: 'Natur och miljö',
            page: '16',
            level: 1,
          }),
          expect.objectContaining({
            marker: '4.8',
            title: 'Kulturmiljö',
            page: '20',
            level: 1,
          }),
          expect.objectContaining({
            marker: '4.10',
            title: 'Bebyggelsemiljö',
            page: '22',
            level: 1,
          }),
        ])
      );
    }
  );
});
