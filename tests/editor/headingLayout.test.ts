import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseDocx } from '../../src/docx/DocxParser';
import { parseNumberedHeading } from '../../src/editor/headingLayout';
import type { DocParagraph } from '../../src/types';

function makeHeading(text: string, headingLevel = 1): DocParagraph {
  return {
    index: 0,
    headingLevel,
    styleId: headingLevel === 1 ? 'Rubrik1' : 'Rubrik2',
    runs: [{ id: 'r1', text }],
  };
}

describe('headingLayout', () => {
  it('ignores missing paragraphs defensively', () => {
    expect(parseNumberedHeading(undefined)).toBeNull();
  });

  it('parses a Word-style tabbed numbered heading into marker and title', () => {
    expect(parseNumberedHeading(makeHeading('\t5\tPlanförslag och motiv till detaljplanens regleringar'))).toEqual({
      marker: '5',
      title: 'Planförslag och motiv till detaljplanens regleringar',
      level: 0,
      leadingText: '\t',
      separatorText: '\t',
    });
  });

  it('parses numbered headings even when Word omitted explicit tab runs', () => {
    expect(parseNumberedHeading(makeHeading('4.1 Kommunala planeringsunderlag ', 2))).toEqual({
      marker: '4.1',
      title: 'Kommunala planeringsunderlag',
      level: 1,
      leadingText: '',
      separatorText: ' ',
    });
  });

  it('identifies numbered headings from the Grönklitt Word fixture', async () => {
    const filePath = path.join(
      __dirname,
      '../docx_example_file/KOPIA Planbeskrivning Grönklitt omr 1 antagande.docx'
    );
    expect(fs.existsSync(filePath)).toBe(true);

    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );

    const result = await parseDocx(arrayBuffer);
    const headings = result.docModel.paragraphs
      .map((paragraph) => parseNumberedHeading(paragraph))
      .filter(Boolean);

    expect(headings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          marker: '5',
          title: 'Planförslag och motiv till detaljplanens regleringar',
          level: 0,
        }),
        expect.objectContaining({
          marker: '4.7',
          title: 'Natur och miljö',
          level: 1,
        }),
        expect.objectContaining({
          marker: '6.1',
          title: 'Fastighetsrättsliga frågor',
          level: 1,
        }),
      ])
    );
  });
});
