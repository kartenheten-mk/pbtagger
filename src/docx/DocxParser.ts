import { getBookmarkSuffix, guessCategoryIdFromBookmarkName, generateBookmarkName } from './bookmarkUtils';
import { findOurCustomXmlPath } from './zipUtils';
import { extractPlanbeskrivningFromZip } from './PlanbeskrivningXmlParser';
import type { PlanbeskrivningImportResult } from './PlanbeskrivningXmlParser';
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
  getParagraphStyleId,
  NS,
} from './XmlHelpers';

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ParseResult {
  zip: PizZip;
  docModel: DocModel;
  tags: Tag[];
  /**
   * Present when the .docx contains a Planbeskrivning v2.0 custom XML part.
   * Contains the restored header config, extracted GML geometries, and a
   * map from <identitet> (= bookmark name) → geometry UUID.
   */
  planbeskrivning?: PlanbeskrivningImportResult;
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

  // ── Planbeskrivning v2.0 XML import ────────────────────────────────────────
  const planbeskrivning = extractPlanbeskrivningFromZip(zip) ?? undefined;

  if (
    planbeskrivning &&
    (planbeskrivning.identitetToGeometryUuid.size > 0 ||
      planbeskrivning.planomradeIdentiteter.size > 0)
  ) {
    const importedGmlUuidSet = new Set(
      planbeskrivning.geometries.map((geo) => geo.uuid)
    );

    // Build a map from bookmark name → tag for fast lookup. Prefer the
    // actual bookmark names found in the DOCX, because those are also used as
    // Planbeskrivning <identitet> values and may outlive category label tweaks.
    const tagByBookmarkName = new Map<string, Tag>();
    const tagBySuffix = new Map<string, Tag>();
    for (const tag of tags) {
      const suffix = tag.uuid.replace(/-/g, '').slice(0, 8).toLowerCase();
      tagBySuffix.set(suffix, tag);

      const bm = generateBookmarkName(tag);
      if (bm) tagByBookmarkName.set(bm, tag);
    }
    for (const bm of extractedBookmarks) {
      const suffix = getBookmarkSuffix(bm.name);
      const tag = suffix ? tagBySuffix.get(suffix) : undefined;
      if (tag) tagByBookmarkName.set(bm.name, tag);
    }

    // Link each tag whose bookmark name matches a Planbeskrivning <identitet>.
    // identitetToGeometryUuid maps the base identitet → ALL geometry UUIDs for
    // that tag (derived _g2/_g3 blocks are already grouped under the base key).
    for (const [identitet, geoUuids] of planbeskrivning.identitetToGeometryUuid) {
      const tag = tagByBookmarkName.get(identitet);
      if (!tag) continue;

      // Merge ALL extracted geometry UUIDs into the tag's geometryIds.
      // Keep existing non-GML links (typically JSON IDs from customXml) as the
      // source of truth and avoid duplicating each link with an imported GML ID.
      // If no non-GML links exist, use extracted GML UUIDs as fallback.
      const existing = tag.geometryIds ?? [];
      const hasNonGmlLinks = existing.some((id) => !importedGmlUuidSet.has(id));
      if (hasNonGmlLinks) {
        continue;
      }

      const toAdd = geoUuids.filter((uuid) => !existing.includes(uuid));
      if (toAdd.length > 0) {
        tag.geometryIds = [...toAdd, ...existing];
      }
    }

    // Mark tags whose Planbeskrivning XML used the whole-plan fallback
    // (<planomrade>Ja</planomrade>) instead of explicit GML/references.  This
    // is important for DOCX-only/read-only imports: old app metadata may still
    // contain stale geometryIds, but the actual imported Planbeskrivning XML has
    // no geometry to restore for this tag.
    for (const identitet of planbeskrivning.planomradeIdentiteter) {
      const tag = tagByBookmarkName.get(identitet);
      if (!tag) continue;

      tag.planbeskrivningImportedPlanomrade = true;
    }
  }

  return {
    zip,
    docModel: { paragraphs },
    tags,
    planbeskrivning,
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
  /** Index of the paragraph where bookmarkStart was found */
  paragraphIndex: number;
  startOffset?: number;
  endOffset?: number;
  /**
   * Set when the bookmarkEnd was found in a different paragraph than
   * bookmarkStart — i.e. a cross-paragraph bookmark. The endOffset then
   * refers to a character offset in this end paragraph.
   */
  endParagraphIndex?: number;
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

  // Walk direct children of body.
  // IMPORTANT: When Word saves cross-paragraph bookmarks, it may hoist the
  // <w:bookmarkStart> to the body level (between <w:p> elements).  We must
  // handle those here so they are captured in `activeBookmarks` before the
  // paragraphs that contain the corresponding <w:bookmarkEnd> are processed.
  const bodyChildren = body.childNodes;
  for (let i = 0; i < bodyChildren.length; i++) {
    const child = bodyChildren[i];
    if (child.nodeType !== 1) continue;
    const el = child as Element;

    // Body-level bookmarkStart: record with paragraphIndex = next paragraph
    if (el.namespaceURI === NS.w && el.localName === 'bookmarkStart') {
      const bmId = el.getAttributeNS(NS.w, 'id') || el.getAttribute('w:id');
      const bmName = el.getAttributeNS(NS.w, 'name') || el.getAttribute('w:name');
      if (bmId && bmName && bmName.includes('_')) {
        activeBookmarks[bmId] = {
          id: bmId,
          name: bmName,
          // The bookmark starts at the very beginning of the next paragraph
          paragraphIndex: index,
          startOffset: 0,
          runId: `p${index}_r0`,
        };
      }
      continue;
    }

    // Body-level bookmarkEnd: completes at the end of the previous paragraph
    if (el.namespaceURI === NS.w && el.localName === 'bookmarkEnd') {
      const bmId = el.getAttributeNS(NS.w, 'id') || el.getAttribute('w:id');
      if (bmId && activeBookmarks[bmId]) {
        const bm = activeBookmarks[bmId];
        if (bm.name && bm.paragraphIndex !== undefined && bm.startOffset !== undefined) {
          const endParaIdx = index - 1;
          if (endParaIdx >= 0) {
            const endPara = result[endParaIdx];
            const endOffset = endPara
              ? endPara.runs.reduce((s, r) => s + r.text.length, 0)
              : 0;
            const isCrossPara = bm.paragraphIndex !== endParaIdx;
            extractedBookmarks.push({
              id: bm.id as string,
              name: bm.name,
              paragraphIndex: bm.paragraphIndex,
              startOffset: bm.startOffset,
              endOffset,
              endParagraphIndex: isCrossPara ? endParaIdx : undefined,
              runId: bm.runId,
            });
          }
        }
        delete activeBookmarks[bmId];
      }
      continue;
    }

    walkNode(el);
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
  const styleId = getParagraphStyleId(para);
  const listLevel = getListLevel(para);
  const runs = extractRuns(para, index, zip, relsMap, extractedBookmarks, activeBookmarks);

  const paragraph: DocParagraph = {
    index,
    runs,
    headingLevel,
    alignment,
    styleId,
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
          const isCrossPara = bm.paragraphIndex !== paraIndex;

          if (isCrossPara) {
            // Cross-paragraph bookmark: record which paragraph the end is in,
            // and the character offset within that end paragraph.
            extractedBookmarks.push({
              id: bm.id as string,
              name: bm.name,
              paragraphIndex: bm.paragraphIndex,
              startOffset: bm.startOffset,
              // endOffset is the offset reached so far in the END paragraph
              endOffset: textOffset,
              endParagraphIndex: paraIndex,
              runId: bm.runId,
            });
          } else {
            // Same-paragraph bookmark
            extractedBookmarks.push({
              id: bm.id as string,
              name: bm.name,
              paragraphIndex: bm.paragraphIndex,
              startOffset: bm.startOffset,
              endOffset: textOffset,
              runId: bm.runId,
            });
          }
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

      return {
        id: runId,
        text: '',
        isImage: true,
        imageData: data,
        imageMime: mime,
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
  // Scan all customXml/item*.xml to find ours by namespace — Word may
  // renumber these items when saving, so we can't rely on item1.xml.
  const itemPath = findOurCustomXmlPath(zip);
  const xmlFile = itemPath ? zip.file(itemPath) : null;
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
      // Parse geometryIds (new: comma-separated list) with backward compat for old geometryId
      const geometryIdsRaw = el.getAttribute('geometryIds') || undefined;
      const legacyGeometryId = el.getAttribute('geometryId') || undefined;
      const geometryIds: string[] | undefined = geometryIdsRaw
        ? geometryIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : legacyGeometryId
          ? [legacyGeometryId]
          : undefined;
      const planbeskrivningImportedPlanomrade =
        el.getAttribute('planbeskrivningImportedPlanomrade') === 'true';
      const note = el.getAttribute('note') || undefined;
      const runId = el.getAttribute('runId') || undefined;
      const tableId = el.getAttribute('tableId') || undefined;
      const targetType = normalizeTagTargetType(el.getAttribute('targetType'));

      // Read <pb:text> child
      const textEls = el.getElementsByTagNameNS(CUSTOM_XML_NS, 'text');
      const text = textEls.length > 0 ? (textEls[0].textContent ?? '') : '';

      if (!uuid || !categoryId) continue;

      // Read optional endParagraphIndex (present for multi-paragraph tags)
      const endParagraphIndexRaw = el.getAttribute('endParagraphIndex');
      const endParagraphIndex =
        endParagraphIndexRaw !== null && endParagraphIndexRaw !== ''
          ? parseInt(endParagraphIndexRaw, 10)
          : undefined;

      tags.push({
        uuid,
        categoryId,
        targetType,
        text,
        paragraphIndex,
        startOffset,
        endOffset,
        endParagraphIndex:
          endParagraphIndex !== undefined && endParagraphIndex !== paragraphIndex
            ? endParagraphIndex
            : undefined,
        runId,
        tableId,
        geometryIds,
        planbeskrivningImportedPlanomrade,
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

/**
 * Build a combined text string from a multi-paragraph range.
 * Paragraphs are joined with '\n\n' (matching how the editor stores them).
 */
function buildMultiParaText(
  paragraphs: DocParagraph[],
  startParaIdx: number,
  startOffset: number,
  endParaIdx: number,
  endOffset: number
): string {
  const parts: string[] = [];

  for (let pi = startParaIdx; pi <= endParaIdx; pi++) {
    const para = paragraphs[pi];
    if (!para) continue;
    const text = getParagraphText(para);

    if (pi === startParaIdx && pi === endParaIdx) {
      parts.push(text.slice(startOffset, Math.min(endOffset, text.length)));
    } else if (pi === startParaIdx) {
      parts.push(text.slice(startOffset));
    } else if (pi === endParaIdx) {
      parts.push(text.slice(0, Math.min(endOffset, text.length)));
    } else {
      parts.push(text);
    }
  }

  return parts.join('\n\n');
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

  const bookmarkSuffixes = new Set<string>();
  const matchedSuffixes = new Set<string>();

  // 1. Reconcile existing tags with bookmarks
  for (const bm of extractedBookmarks) {
    const suffix = getBookmarkSuffix(bm.name);
    if (!suffix) continue;

    bookmarkSuffixes.add(suffix);
    const tag = tagBySuffix.get(suffix);

    if (tag) {
      matchedSuffixes.add(suffix);
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

          if (bm.endParagraphIndex !== undefined) {
            // Cross-paragraph bookmark: set endParagraphIndex and rebuild text
            tag.endParagraphIndex = bm.endParagraphIndex;
            tag.text = buildMultiParaText(
              paragraphs,
              bm.paragraphIndex,
              bm.startOffset,
              bm.endParagraphIndex,
              bm.endOffset
            );
          } else {
            // Single-paragraph bookmark: re-extract text
            tag.endParagraphIndex = undefined;
            const para = paragraphs[tag.paragraphIndex];
            if (para) {
              const paraText = getParagraphText(para);
              tag.endOffset = Math.min(tag.endOffset, paraText.length);
              tag.text = paraText.slice(tag.startOffset, tag.endOffset);
            }
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

  if (bookmarkSuffixes.size > 0) {
    tags = tags.filter(tag => {
      const suffix = tag.uuid.replace(/-/g, '').slice(0, 8).toLowerCase();
      return bookmarkSuffixes.has(suffix);
    });
  }

  // 3. Create new tags from unmatched bookmarks
  const createdSuffixes = new Set<string>();
  for (const bm of extractedBookmarks) {
    const suffix = getBookmarkSuffix(bm.name);
    if (!suffix) continue;

    if (!matchedSuffixes.has(suffix) && !createdSuffixes.has(suffix)) {
      // It's a validly named bookmark but missing from customXml
      const guessedCategoryId = guessCategoryIdFromBookmarkName(bm.name);

      if (guessedCategoryId) {
        // Use a real UUID, starting with the suffix if possible, or just generate new
        // e.g. suffix + '-0000-0000-0000-000000000000'
        const newUuid = suffix + '-0000-0000-0000-000000000000';

        const startOffset = bm.startOffset ?? 0;
        const endOffset = bm.endOffset ?? startOffset;
        const isTextRange =
          bm.endParagraphIndex !== undefined || endOffset > startOffset;

        const newTag: Tag = {
          uuid: newUuid,
          categoryId: guessedCategoryId,
          targetType: isTextRange ? 'text' : 'image',
          paragraphIndex: bm.paragraphIndex,
          startOffset,
          endOffset,
          endParagraphIndex: bm.endParagraphIndex,
          runId: isTextRange ? undefined : bm.runId,
          text: '',
          createdAt: new Date().toISOString(),
        };

        if (newTag.targetType === 'text') {
          if (newTag.endParagraphIndex !== undefined) {
            newTag.text = buildMultiParaText(
              paragraphs,
              newTag.paragraphIndex,
              newTag.startOffset,
              newTag.endParagraphIndex,
              newTag.endOffset
            );
          } else {
            const para = paragraphs[newTag.paragraphIndex];
            if (para) {
              const paraText = getParagraphText(para);
              // Clamp endOffset if Word moved the bookmark boundary.
              if (newTag.endOffset > paraText.length) {
                newTag.endOffset = paraText.length;
              }
              newTag.text = paraText.slice(newTag.startOffset, newTag.endOffset);
            }
          }
        }

        tags.push(newTag);
        createdSuffixes.add(suffix);
      }
    }
  }

  return tags;
}
