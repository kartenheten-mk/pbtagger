/**
 * DocxExporter.ts
 *
 * Takes the original PizZip archive + the current list of tags and:
 *  1. Parses word/document.xml into a mutable DOM
 *  2. Injects anchors into document.xml:
 *     - <w:sdt> + bookmarks for text tags
 *     - bookmarks for image/graph tags
 *  3. Writes / updates customXml/item1.xml with all tag metadata
 *  4. Updates [Content_Types].xml and word/_rels/document.xml.rels if needed
 *  5. Re-zips and triggers a browser download
 *
 * All un-tagged content (images, tables, headers, footers, styles, etc.)
 * is preserved byte-for-byte because we only modify the targeted XML files.
 */

import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import type { Tag, DocModel } from '../types';
import { parseXml, serializeXml } from './XmlHelpers';
import {
  buildCustomXmlItem,
  buildCustomXmlItemProps,
} from './ContentControlBuilder';
import {
  ensureCustomXmlRels,
  updateDocumentRels,
  updateContentTypes,
} from './zipUtils';
import { findMaxBookmarkId } from './bookmarkUtils';
import {
  collectParagraphsInOrder,
  injectBookmarkAroundRun,
  injectSdtIntoParagraph,
  injectCrossParaBookmarks,
  cleanExistingTagAnchors,
} from './domUtils';

// Fixed store item ID for our custom XML part (GUID without braces used in file)
const STORE_ITEM_ID = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
const CUSTOM_XML_PATH = 'customXml/item1.xml';
const CUSTOM_XML_PROPS_PATH = 'customXml/itemProps1.xml';

/**
 * Main export function. Clones the ZIP, injects tags, and downloads the file.
 */
export async function exportDocx(
  originalZip: PizZip,
  docModel: DocModel,
  tags: Tag[],
  fileName: string
): Promise<void> {
  // 1. Clone the ZIP so we never mutate the in-memory original
  const zipData = originalZip.generate({ type: 'arraybuffer' });
  const zip = new PizZip(zipData);

  // 2. Parse word/document.xml into a mutable DOM
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) throw new Error('word/document.xml not found in ZIP');
  const docXmlString = docXmlFile.asText();
  const docDom = parseXml(docXmlString);

  // 3. Clean any existing custom tag anchors to prevent nesting, then inject new ones
  cleanExistingTagAnchors(docDom);

  const textTags = tags.filter(isTextTag);
  const objectBookmarkTags = tags.filter(isObjectBookmarkTag);
  if (textTags.length > 0 || objectBookmarkTags.length > 0) {
    injectTagAnchors(docDom, docModel, textTags, objectBookmarkTags);
  }

  // 4. Serialize modified document.xml back into ZIP
  const modifiedDocXml = serializeXml(docDom);
  zip.file('word/document.xml', modifiedDocXml);

  // 5. Write Custom XML part (all tag types)
  const customXmlContent = buildCustomXmlItem(
    tags.map((t) => ({
      uuid: t.uuid,
      categoryId: t.categoryId,
      targetType: t.targetType ?? 'text',
      text: t.text,
      paragraphIndex: t.paragraphIndex,
      startOffset: t.startOffset,
      endOffset: t.endOffset,
      endParagraphIndex: t.endParagraphIndex,
      runId: t.runId,
      tableId: t.tableId,
      geometryIds: t.geometryIds,
      note: t.note,
      createdAt: t.createdAt,
    }))
  );
  zip.file(CUSTOM_XML_PATH, customXmlContent);
  zip.file(CUSTOM_XML_PROPS_PATH, buildCustomXmlItemProps(STORE_ITEM_ID));

  // 6. Ensure customXml/_rels/item1.xml.rels exists
  ensureCustomXmlRels(zip);

  // 7. Update word/_rels/document.xml.rels
  updateDocumentRels(zip);

  // 8. Update [Content_Types].xml
  updateContentTypes(zip);

  // 9. Generate blob and trigger download
  const blob = zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const exportName = fileName.replace(/\.docx$/i, '') + '_tagged.docx';
  saveAs(blob, exportName);
}

/**
 * Walk the document DOM and inject anchors for tag targets.
 */
function injectTagAnchors(
  docDom: Document,
  docModel: DocModel,
  textTags: Tag[],
  objectBookmarkTags: Tag[]
): void {
  const allParas = collectParagraphsInOrder(docDom);
  const bookmarkCounter = { value: findMaxBookmarkId(docDom) + 1 };

  injectObjectBookmarks(docDom, allParas, objectBookmarkTags, bookmarkCounter);
  injectTextContentControls(docDom, docModel, allParas, textTags, bookmarkCounter);
}

function injectObjectBookmarks(
  docDom: Document,
  allParas: Element[],
  tags: Tag[],
  bookmarkCounter: { value: number }
): void {
  const sortedTags = [...tags].sort((a, b) => {
    if (a.paragraphIndex !== b.paragraphIndex) {
      return b.paragraphIndex - a.paragraphIndex;
    }
    const aRun = parseRunIndexFromRunId(a.runId) ?? -1;
    const bRun = parseRunIndexFromRunId(b.runId) ?? -1;
    return bRun - aRun;
  });

  for (const tag of sortedTags) {
    const runIndex = parseRunIndexFromRunId(tag.runId);
    if (runIndex === null) continue;

    const paraEl = allParas[tag.paragraphIndex];
    if (!paraEl) continue;

    injectBookmarkAroundRun(docDom, paraEl, runIndex, tag, bookmarkCounter);
  }
}

/**
 * Inject anchors for text tags.
 *
 * - Single-paragraph tags get an inline <w:sdt> + bookmarks (existing path).
 * - Multi-paragraph tags get a cross-paragraph bookmark only (no SDT), since
 *   inline SDTs cannot span <w:p> boundaries.
 */
function injectTextContentControls(
  docDom: Document,
  docModel: DocModel,
  allParas: Element[],
  tags: Tag[],
  bookmarkCounter: { value: number }
): void {
  const singleParaTags = tags.filter(
    (t) => !t.endParagraphIndex || t.endParagraphIndex === t.paragraphIndex
  );
  const multiParaTags = tags.filter(
    (t) => t.endParagraphIndex !== undefined && t.endParagraphIndex > t.paragraphIndex
  );

  // ── Single-paragraph tags: inline SDT + bookmarks ────────────────────────
  // Process in reverse document order so earlier injections don't shift offsets
  const sortedSingle = [...singleParaTags].sort((a, b) => {
    if (a.paragraphIndex !== b.paragraphIndex) {
      return b.paragraphIndex - a.paragraphIndex;
    }
    return b.startOffset - a.startOffset;
  });

  for (const tag of sortedSingle) {
    const paraEl = allParas[tag.paragraphIndex];
    if (!paraEl) continue;
    const docPara = docModel.paragraphs[tag.paragraphIndex];
    if (!docPara) continue;
    injectSdtIntoParagraph(docDom, paraEl, docPara, tag, bookmarkCounter, STORE_ITEM_ID);
  }

  // ── Multi-paragraph tags: cross-paragraph bookmarks only ─────────────────
  // Process in reverse document order as well
  const sortedMulti = [...multiParaTags].sort(
    (a, b) => b.paragraphIndex - a.paragraphIndex
  );

  for (const tag of sortedMulti) {
    injectCrossParaBookmarks(docDom, allParas, tag, bookmarkCounter);
  }
}

function parseRunIndexFromRunId(runId: string | undefined): number | null {
  if (!runId) return null;
  const match = runId.match(/_r(\d+)$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  return Number.isNaN(value) ? null : value;
}

function isTextTag(tag: Tag): boolean {
  const type = tag.targetType ?? 'text';
  return type === 'text' && tag.endOffset > tag.startOffset;
}

function isObjectBookmarkTag(tag: Tag): boolean {
  const type = tag.targetType ?? 'text';
  return (type === 'image' || type === 'graph') && !!tag.runId;
}
