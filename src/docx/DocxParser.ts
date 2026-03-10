import { getBookmarkSuffix, guessCategoryIdFromBookmarkName } from './bookmarkUtils';
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
import type { DocModel, DocParagraph, DocRun, Tag, TagTargetType } from '../types';
import { CUSTOM_XML_NS } from './ContentControlBuilder';
import {
  parseXml,
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
  tags: Tag[];
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

  // Parse relationships to map embed IDs to target paths
  const relsMap: Record<string, string> = {};
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (relsFile) {
    const relsDoc = parseXml(relsFile.asText());
    const rels = relsDoc.getElementsByTagName('*');
    for (let i = 0; i < rels.length; i++) {
      const el = rels[i] as Element;
      if (el.localName === 'Relationship') {
        const id = el.getAttribute('Id');
        const target = el.getAttribute('Target');
        if (id && target) {
          relsMap[id] = target;
        }
      }
    }
  }

  const bodyElements = docDom.getElementsByTagNameNS(NS.w, 'body');
  if (!bodyElements || bodyElements.length === 0) {
    throw new Error('Invalid .docx: <w:body> not found in document.xml');
  }
  const body = bodyElements[0] as Element;

  const extractedBookmarks: ExtractedBookmark[] = [];
  const activeBookmarks: Record<string, Partial<ExtractedBookmark>> = {};

  const paragraphs = extractParagraphs(body, zip, relsMap, extractedBookmarks, activeBookmarks);

  // Extract any embedded tags from a previously exported file
  let tags = extractTagsFromCustomXml(zip);

  // Reconcile tags using extracted bookmarks
  tags = reconcileTagsWithBookmarks(tags, extractedBookmarks, paragraphs);

  return {
    zip,
    docModel: { paragraphs },
    tags,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface TableContext {
  tableId: string;
  tableIndex: number;
  firstParagraphSeen: boolean;
}

export interface ExtractedBookmark {
  id: string;
  name: string;
  paragraphIndex: number;
  startOffset?: number;
  endOffset?: number;
  runId?: string; // used for object bookmarks
}

/**
 * Walk all top-level <w:p> elements in the body, including those inside
 * tables (<w:tbl> → <w:tr> → <w:tc> → <w:p>).
 */
function extractParagraphs(body: Element, zip: PizZip, relsMap: Record<string, string>, extractedBookmarks: ExtractedBookmark[], activeBookmarks: Record<string, Partial<ExtractedBookmark>>): DocParagraph[] {
  const result: DocParagraph[] = [];
  let index = 0;
  let tableCounter = 0;

  function walkNode(node: Element, tableCtx?: TableContext) {
    if (node.namespaceURI === NS.w && node.localName === 'p') {
      const para = parseParagraph(node, index, zip, relsMap, tableCtx, extractedBookmarks, activeBookmarks);
      result.push(para);
      index++;
      if (tableCtx) {
        tableCtx.firstParagraphSeen = true;
      }
      return;
    }

    // Each table gets a stable document-order table id/index.
    if (node.namespaceURI === NS.w && node.localName === 'tbl') {
      tableCounter++;
      const nestedTableCtx: TableContext = {
        tableId: `table_${tableCounter}`,
        tableIndex: tableCounter,
        firstParagraphSeen: false,
      };

      const tblChildren = node.childNodes;
      for (let i = 0; i < tblChildren.length; i++) {
        const child = tblChildren[i];
        if (child.nodeType === 1) {
          walkNode(child as Element, nestedTableCtx);
        }
      }
      return;
    }

    // Recurse into child elements (handles w:tr, w:tc, w:sdt, etc.)
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 1) {
        walkNode(child as Element, tableCtx);
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

function parseParagraph(
  para: Element,
  index: number,
  zip: PizZip,
  relsMap: Record<string, string>,
  tableCtx?: TableContext,
  extractedBookmarks?: ExtractedBookmark[],
  activeBookmarks?: Record<string, Partial<ExtractedBookmark>>
): DocParagraph {
  const headingLevel = getHeadingLevel(para);
  const alignment = getParagraphAlignment(para);
  const listLevel = getListLevel(para);
  const runs = extractRuns(para, index, zip, relsMap, extractedBookmarks, activeBookmarks);

  const paragraph: DocParagraph = {
    index,
    runs,
    headingLevel,
    alignment,
    listLevel,
  };

  if (tableCtx) {
    paragraph.tableId = tableCtx.tableId;
    paragraph.tableIndex = tableCtx.tableIndex;
    paragraph.isTableStart = !tableCtx.firstParagraphSeen;
  }

  return paragraph;
}

/**
 * Extract <w:r> runs from a paragraph.
 * Also handles <w:hyperlink> and <w:sdt> (content controls already in the doc).
 */
function extractRuns(para: Element, paraIndex: number, zip: PizZip, relsMap: Record<string, string>, extractedBookmarks?: ExtractedBookmark[], activeBookmarks?: Record<string, Partial<ExtractedBookmark>>): DocRun[] {
  const runs: DocRun[] = [];
  let runIndex = 0;
  let textOffset = 0;

  function visitNode(node: Element) {
    const localName = node.localName;
    const nsURI = node.namespaceURI;

    if (nsURI === NS.w && localName === 'bookmarkStart' && activeBookmarks) {
      const id = node.getAttributeNS(NS.w, 'id') || node.getAttribute('w:id');
      const name = node.getAttributeNS(NS.w, 'name') || node.getAttribute('w:name');
      if (id && name && name.includes('_')) { // Only care about tags with suffix
        activeBookmarks[id] = { id, name, paragraphIndex: paraIndex, startOffset: textOffset, runId: `p${paraIndex}_r${runIndex}` };
      }
      return;
    }

    if (nsURI === NS.w && localName === 'bookmarkEnd' && activeBookmarks && extractedBookmarks) {
      const id = node.getAttributeNS(NS.w, 'id') || node.getAttribute('w:id');
      if (id && activeBookmarks[id]) {
        const bm = activeBookmarks[id];
        if (bm.name && bm.paragraphIndex !== undefined && bm.startOffset !== undefined) {
          // If the bookmark ends in a different paragraph than it started, cap the endOffset
          // to the end of the starting paragraph (or rather, the textOffset we reached at the end of the start para).
          // But since we are processing Para B now, we don't know the exact length of Para A.
          // Wait, if it's a different paragraph, we can just say endOffset = undefined and handle it later,
          // or we can set a flag.
          // Let's just store the endParagraphIndex too.
          let finalEndOffset = textOffset;
          if (bm.paragraphIndex !== paraIndex) {
              // Spans multiple paragraphs. Tag model doesn't support this well.
              // Just use the start paragraph and set endOffset to something large, or leave it.
              // Actually, if it spans, the text inside it might be huge.
              // We'll mark it as a multi-paragraph bookmark. For simplicity, we can set endOffset to the text length of the start paragraph later.
              finalEndOffset = 999999; // We will clamp this in reconcileTagsWithBookmarks
          }

          extractedBookmarks.push({
            id: bm.id as string,
            name: bm.name,
            paragraphIndex: bm.paragraphIndex,
            startOffset: bm.startOffset,
            endOffset: finalEndOffset,
            runId: bm.runId,
          });
        }
        delete activeBookmarks[id];
      }
      return;
    }

    if (nsURI === NS.w && localName === 'r') {
      const run = parseRun(node, paraIndex, runIndex, zip, relsMap);
      if (run !== null) {
        runs.push(run);
        textOffset += run.text.length;
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
        visitNode(child as Element);
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
 * Returns null if the run contains no text or supported object.
 */
function parseRun(runEl: Element, paraIndex: number, runIndex: number, zip: PizZip, relsMap: Record<string, string>): DocRun | null {
  const runId = `p${paraIndex}_r${runIndex}`;

  // Check for images and charts in drawings
  const drawings = runEl.getElementsByTagNameNS(NS.w, 'drawing');
  const objects = runEl.getElementsByTagNameNS(NS.w, 'object');
  let embedId: string | null = null;
  let chartRelId: string | null = null;

  if (drawings.length > 0) {
    const drawing = drawings[0];
    const blips = drawing.getElementsByTagNameNS(NS.a, 'blip');
    if (blips.length > 0) {
      embedId = blips[0].getAttributeNS(NS.r, 'embed') || blips[0].getAttribute('r:embed');
    }

    if (!embedId) {
      const chartEls = drawing.getElementsByTagNameNS(NS.c, 'chart');
      if (chartEls.length > 0) {
        chartRelId = chartEls[0].getAttributeNS(NS.r, 'id') || chartEls[0].getAttribute('r:id');
      }
    }
  }

  if (!embedId && objects.length > 0) {
    const imagedata = objects[0].getElementsByTagName('*');
    for (let i = 0; i < imagedata.length; i++) {
      if (imagedata[i].localName === 'imagedata') {
        embedId = imagedata[i].getAttributeNS(NS.r, 'id') || imagedata[i].getAttribute('r:id');
        break;
      }
    }
  }

  if (embedId && relsMap[embedId]) {
    let target = relsMap[embedId];
    if (target.startsWith('/')) target = target.slice(1);
    else target = 'word/' + target;

    const mediaFile = zip.file(target);
    if (mediaFile) {
      const data = mediaFile.asUint8Array();
      const ext = target.split('.').pop()?.toLowerCase();
      let mime = 'image/jpeg';
      if (ext === 'png') mime = 'image/png';
      else if (ext === 'gif') mime = 'image/gif';
      else if (ext === 'svg') mime = 'image/svg+xml';

      let binary = '';
      const len = data.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(data[i]);
      }
      const base64 = typeof window !== 'undefined' ? window.btoa(binary) : btoa(binary);

      return {
        id: runId,
        text: '',
        isImage: true,
        imageUrl: `data:${mime};base64,${base64}`
      };
    }
  }

  if (chartRelId) {
    return {
      id: runId,
      text: '',
      isGraph: true,
      graphRelId: chartRelId,
    };
  }

  // Collect visible run content (plain text + tab characters)
  const text = extractRunTextWithTabs(runEl);
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
    id: runId,
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

function extractRunTextWithTabs(runEl: Element): string {
  const chunks: string[] = [];

  const visit = (node: Node): void => {
    if (node.nodeType !== 1) return;

    const el = node as Element;
    if (el.namespaceURI !== NS.w) {
      const children = el.childNodes;
      for (let i = 0; i < children.length; i++) {
        visit(children[i]);
      }
      return;
    }

    if (el.localName === 't') {
      chunks.push(el.textContent ?? '');
      return;
    }

    if (el.localName === 'tab') {
      chunks.push('\t');
      return;
    }

    // Skip binary/object content while parsing text runs.
    if (el.localName === 'drawing' || el.localName === 'object') {
      return;
    }

    const children = el.childNodes;
    for (let i = 0; i < children.length; i++) {
      visit(children[i]);
    }
  };

  const children = runEl.childNodes;
  for (let i = 0; i < children.length; i++) {
    visit(children[i]);
  }

  return chunks.join('');
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

// ─── Custom XML tag extraction ───────────────────────────────────────────────

/**
 * Read tag metadata from customXml/item1.xml (written by the exporter).
 * Returns an empty array if the file doesn't exist or isn't ours.
 */
function extractTagsFromCustomXml(zip: PizZip): Tag[] {
  const CUSTOM_XML_PATH = 'customXml/item1.xml';
  const xmlFile = zip.file(CUSTOM_XML_PATH);
  if (!xmlFile) return [];

  try {
    const doc = parseXml(xmlFile.asText());

    // Look for <pb:tag> elements under our namespace
    const tagEls = doc.getElementsByTagNameNS(CUSTOM_XML_NS, 'tag');
    if (!tagEls || tagEls.length === 0) return [];

    const tags: Tag[] = [];

    for (let i = 0; i < tagEls.length; i++) {
      const el = tagEls[i] as Element;

      const uuid = el.getAttribute('uuid') ?? '';
      const categoryId = el.getAttribute('categoryId') ?? '';
      const paragraphIndex = parseInt(el.getAttribute('paragraphIndex') ?? '0', 10);
      const startOffset = parseInt(el.getAttribute('startOffset') ?? '0', 10);
      const endOffset = parseInt(el.getAttribute('endOffset') ?? '0', 10);
      const createdAt = el.getAttribute('createdAt') ?? new Date().toISOString();
      const geometryId = el.getAttribute('geometryId') || undefined;
      const note = el.getAttribute('note') || undefined;
      const runId = el.getAttribute('runId') || undefined;
      const tableId = el.getAttribute('tableId') || undefined;
      const targetType = normalizeTagTargetType(el.getAttribute('targetType'));

      // Read <pb:text> child
      const textEls = el.getElementsByTagNameNS(CUSTOM_XML_NS, 'text');
      const text = textEls.length > 0 ? (textEls[0].textContent ?? '') : '';

      if (!uuid || !categoryId) continue;

      tags.push({
        uuid,
        categoryId,
        targetType,
        text,
        paragraphIndex,
        startOffset,
        endOffset,
        runId,
        tableId,
        geometryId,
        note,
        createdAt,
      });
    }

    return tags;
  } catch {
    // If parsing fails, just return no tags
    return [];
  }
}

function normalizeTagTargetType(value: string | null): TagTargetType {
  if (value === 'image' || value === 'graph' || value === 'table') {
    return value;
  }
  return 'text';
}



function reconcileTagsWithBookmarks(
  tags: Tag[],
  extractedBookmarks: ExtractedBookmark[],
  paragraphs: DocParagraph[]
): Tag[] {
  // Create a map from UUID suffix to Tag for easy lookup
  const tagBySuffix = new Map<string, Tag>();
  for (const tag of tags) {
    const suffix = tag.uuid.replace(/-/g, '').slice(0, 8).toLowerCase();
    tagBySuffix.set(suffix, tag);
  }

  const processedSuffixes = new Set<string>();

  // 1. Reconcile existing tags with bookmarks
  for (const bm of extractedBookmarks) {
    const suffix = getBookmarkSuffix(bm.name);
    if (!suffix) continue;

    processedSuffixes.add(suffix);
    const tag = tagBySuffix.get(suffix);

    if (tag) {
      // Update the tag's position based on the bookmark
      tag.paragraphIndex = bm.paragraphIndex;

      if (tag.targetType === 'image' || tag.targetType === 'graph') {
        // Object tags use runId
        if (bm.runId) {
          tag.runId = bm.runId;
        }
      } else {
        // Text tags use offsets
        if (bm.startOffset !== undefined && bm.endOffset !== undefined) {
          tag.startOffset = bm.startOffset;
          tag.endOffset = bm.endOffset;

          // Re-extract the text to ensure it matches the new offsets
          const para = paragraphs[tag.paragraphIndex];
          if (para) {
            const paraText = getParagraphText(para);
            // Clamp endOffset if it was a multi-paragraph bookmark
            if (tag.endOffset > paraText.length) {
                tag.endOffset = paraText.length;
            }
            tag.text = paraText.slice(tag.startOffset, tag.endOffset);
          }
        }
      }
    }
  }

  // 2. Remove tags that were present in customXml but have no corresponding bookmark.
  // This indicates the user deleted the tagged content or the bookmark in Word.
  // Alternatively, maybe we just leave them alone if the text is still there?
  // Usually, bookmarks are the source of truth if the document was edited in Word.
  // Actually, wait, let's keep all tags for now, as maybe the customXml is accurate
  // and bookmarks were just lost for some reason. But actually we want the tags to reflect bookmarks!
  // If the user deleted the bookmark in Word, the tag should be gone.
  // Wait, what if the document *wasn't* exported by us, and just has no bookmarks?
  // Let's filter out tags that have *no* matching bookmark ONLY IF we found at least one of our bookmarks.
  // Because if we found 0 bookmarks, maybe they exported without tags or something, though customXml exists.
  // Actually, if customXml exists, it was exported by us. If a tag is missing its bookmark, it was deleted.

  if (extractedBookmarks.some(bm => getBookmarkSuffix(bm.name) !== null)) {
    tags = tags.filter(tag => {
      const suffix = tag.uuid.replace(/-/g, '').slice(0, 8).toLowerCase();
      return processedSuffixes.has(suffix);
    });
  }

  // 3. Create new tags from unmatched bookmarks
  for (const bm of extractedBookmarks) {
    const suffix = getBookmarkSuffix(bm.name);
    if (!suffix) continue;

    if (!processedSuffixes.has(suffix)) {
      // It's a validly named bookmark but missing from customXml
      const guessedCategoryId = guessCategoryIdFromBookmarkName(bm.name);

      if (guessedCategoryId) {
        // Use a real UUID, starting with the suffix if possible, or just generate new
        // e.g. suffix + '-0000-0000-0000-000000000000'
        const newUuid = suffix + '-0000-0000-0000-000000000000';

        const newTag: Tag = {
          uuid: newUuid,
          categoryId: guessedCategoryId,
          targetType: bm.runId ? 'image' : 'text', // Heuristic: runId presence -> object tag
          paragraphIndex: bm.paragraphIndex,
          startOffset: bm.startOffset || 0,
          endOffset: bm.endOffset || 0,
          runId: bm.runId,
          text: '',
          createdAt: new Date().toISOString(),
        };

        if (newTag.targetType === 'text') {
           const para = paragraphs[newTag.paragraphIndex];
           if (para) {
             const paraText = getParagraphText(para);
             // Clamp endOffset if it was a multi-paragraph bookmark
             if (newTag.endOffset > paraText.length) {
                 newTag.endOffset = paraText.length;
             }
             newTag.text = paraText.slice(newTag.startOffset, newTag.endOffset);
           }
        }

        tags.push(newTag);
      }
    }
  }

  return tags;
}
