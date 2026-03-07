/**
 * DocxParser.ts
 *
 * Opens a .docx file (as ArrayBuffer) using PizZip and parses
 * word/document.xml into a DocModel for the read-only TipTap editor.
 *
 * IMPORTANT: We only *read* the XML here. The original ZIP is kept intact
 * in memory and passed back alongside the model so the exporter can perform
 * a lossless round-trip.
 */

import PizZip from 'pizzip';
import type { DocModel, DocParagraph, DocRun } from '../types';
import {
  parseXml,
  wChildren,
  wChild,
  wAttr,
  getHeadingLevel,
  getParagraphAlignment,
  getListLevel,
  NS,
} from './XmlHelpers';

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ParseResult {
  zip: PizZip;
  docModel: DocModel;
}

/**
 * Parse a .docx ArrayBuffer into a DocModel + keep the ZIP object for export.
 */
export async function parseDocx(buffer: ArrayBuffer): Promise<ParseResult> {
  const zip = new PizZip(buffer);

  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('Invalid .docx: word/document.xml not found');
  }

  const docXmlString = docXmlFile.asText();
  const docDom = parseXml(docXmlString);

  const bodyElements = docDom.getElementsByTagNameNS(NS.w, 'body');
  if (!bodyElements || bodyElements.length === 0) {
    throw new Error('Invalid .docx: <w:body> not found in document.xml');
  }
  const body = bodyElements[0] as Element;

  const paragraphs = extractParagraphs(body);

  return {
    zip,
    docModel: { paragraphs },
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Walk all top-level <w:p> elements in the body, including those inside
 * tables (<w:tbl> → <w:tr> → <w:tc> → <w:p>).
 */
function extractParagraphs(body: Element): DocParagraph[] {
  const result: DocParagraph[] = [];
  let index = 0;

  function walkNode(node: Element) {
    if (node.namespaceURI === NS.w && node.localName === 'p') {
      const para = parseParagraph(node, index);
      result.push(para);
      index++;
      return;
    }

    // Recurse into child elements (handles w:tbl, w:tr, w:tc, w:sdt, etc.)
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 1) {
        walkNode(child as Element);
      }
    }
  }

  // Walk direct children of body
  const bodyChildren = body.childNodes;
  for (let i = 0; i < bodyChildren.length; i++) {
    const child = bodyChildren[i];
    if (child.nodeType === 1) {
      walkNode(child as Element);
    }
  }

  return result;
}

function parseParagraph(para: Element, index: number): DocParagraph {
  const headingLevel = getHeadingLevel(para);
  const alignment = getParagraphAlignment(para);
  const listLevel = getListLevel(para);

  const runs = extractRuns(para, index);

  return { index, runs, headingLevel, alignment, listLevel };
}

/**
 * Extract <w:r> runs from a paragraph.
 * Also handles <w:hyperlink> and <w:sdt> (content controls already in the doc).
 */
function extractRuns(para: Element, paraIndex: number): DocRun[] {
  const runs: DocRun[] = [];
  let runIndex = 0;

  function visitNode(node: Element) {
    const localName = node.localName;
    const nsURI = node.namespaceURI;

    if (nsURI === NS.w && localName === 'r') {
      const run = parseRun(node, paraIndex, runIndex);
      if (run !== null) {
        runs.push(run);
        runIndex++;
      }
      return;
    }

    // Recurse into hyperlinks, sdt content, content controls, etc.
    if (
      nsURI === NS.w &&
      (localName === 'hyperlink' ||
        localName === 'sdt' ||
        localName === 'sdtContent' ||
        localName === 'ins' ||
        localName === 'del')
    ) {
      const children = node.childNodes;
      for (let i = 0; i < children.length; i++) {
        if (children[i].nodeType === 1) {
          visitNode(children[i] as Element);
        }
      }
      return;
    }

    // For other direct children of the paragraph
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 1) {
        const childEl = child as Element;
        if (childEl.namespaceURI === NS.w && childEl.localName === 'r') {
          const run = parseRun(childEl, paraIndex, runIndex);
          if (run !== null) {
            runs.push(run);
            runIndex++;
          }
        }
      }
    }
  }

  // Walk direct children of paragraph (skip pPr)
  const children = para.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    if (el.namespaceURI === NS.w && el.localName === 'pPr') continue;
    visitNode(el);
  }

  return runs;
}

/**
 * Parse a single <w:r> run element into a DocRun.
 * Returns null if the run contains no text (e.g. image runs).
 */
function parseRun(runEl: Element, paraIndex: number, runIndex: number): DocRun | null {
  // Get all w:t nodes
  const tNodes = runEl.getElementsByTagNameNS(NS.w, 't');
  if (tNodes.length === 0) return null;

  let text = '';
  for (let i = 0; i < tNodes.length; i++) {
    text += tNodes[i].textContent ?? '';
  }

  if (text === '') return null;

  // Parse run properties
  const rPr = wChild(runEl, 'rPr');
  const bold = rPr ? !!wChild(rPr, 'b') : false;
  const italic = rPr ? !!wChild(rPr, 'i') : false;
  const underline = rPr ? !!wChild(rPr, 'u') : false;
  const strike = rPr
    ? !!(wChild(rPr, 'strike') || wChild(rPr, 'dstrike'))
    : false;

  let fontSize: number | undefined;
  let color: string | undefined;
  let fontFamily: string | undefined;

  if (rPr) {
    const sz = wChild(rPr, 'sz');
    if (sz) {
      const szVal = wAttr(sz, 'val');
      fontSize = szVal ? parseInt(szVal, 10) : undefined;
    }

    const colorEl = wChild(rPr, 'color');
    if (colorEl) {
      const colorVal = wAttr(colorEl, 'val');
      color = colorVal !== 'auto' && colorVal ? colorVal : undefined;
    }

    const fonts = wChild(rPr, 'rFonts');
    if (fonts) {
      fontFamily =
        wAttr(fonts, 'ascii') ||
        wAttr(fonts, 'hAnsi') ||
        undefined;
    }
  }

  return {
    id: `p${paraIndex}_r${runIndex}`,
    text,
    bold: bold || undefined,
    italic: italic || undefined,
    underline: underline || undefined,
    strike: strike || undefined,
    fontSize,
    color,
    fontFamily,
  };
}

// ─── Paragraph text helpers (used by exporter for offset mapping) ─────────────

/**
 * Get the full concatenated text of a DocParagraph.
 */
export function getParagraphText(para: DocParagraph): string {
  return para.runs.map((r) => r.text).join('');
}

/**
 * Given a character offset range within a paragraph's text, return the list
 * of { runIndex, startInRun, endInRun } slices needed to inject SDTs.
 */
export interface RunSlice {
  runIndex: number;
  startInRun: number;
  endInRun: number;
}

export function getRunSlicesForRange(
  para: DocParagraph,
  startOffset: number,
  endOffset: number
): RunSlice[] {
  const slices: RunSlice[] = [];
  let cursor = 0;

  for (let i = 0; i < para.runs.length; i++) {
    const run = para.runs[i];
    const runStart = cursor;
    const runEnd = cursor + run.text.length;

    if (runEnd <= startOffset) {
      cursor = runEnd;
      continue;
    }
    if (runStart >= endOffset) break;

    const sliceStart = Math.max(startOffset, runStart) - runStart;
    const sliceEnd = Math.min(endOffset, runEnd) - runStart;

    slices.push({ runIndex: i, startInRun: sliceStart, endInRun: sliceEnd });
    cursor = runEnd;
  }

  return slices;
}
