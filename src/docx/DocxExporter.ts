/**
 * DocxExporter.ts
 *
 * Takes the original PizZip archive + the current list of tags and:
 *  1. Parses word/document.xml into a mutable DOM
 *  2. Injects <w:sdt> Content Controls around tagged text runs
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
  injectSdtIntoParagraph,
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
  // ── 1. Clone the ZIP so we never mutate the in-memory original ────────────
  const zipData = originalZip.generate({ type: 'arraybuffer' });
  const zip = new PizZip(zipData);

  // ── 2. Parse word/document.xml into a mutable DOM ─────────────────────────
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) throw new Error('word/document.xml not found in ZIP');
  const docXmlString = docXmlFile.asText();
  const docDom = parseXml(docXmlString);

  // ── 3. Inject <w:sdt> Content Controls for text tags only ─────────────────
  const textTags = tags.filter(isTextTag);
  if (textTags.length > 0) {
    injectContentControls(docDom, docModel, textTags);
  }

  // ── 4. Serialize modified document.xml back into ZIP ─────────────────────
  const modifiedDocXml = serializeXml(docDom);
  zip.file('word/document.xml', modifiedDocXml);

  // ── 5. Write Custom XML part (all tag types) ──────────────────────────────
  const customXmlContent = buildCustomXmlItem(
    tags.map((t) => ({
      uuid: t.uuid,
      categoryId: t.categoryId,
      targetType: t.targetType ?? 'text',
      text: t.text,
      paragraphIndex: t.paragraphIndex,
      startOffset: t.startOffset,
      endOffset: t.endOffset,
      runId: t.runId,
      tableId: t.tableId,
      geometryId: t.geometryId,
      note: t.note,
      createdAt: t.createdAt,
    }))
  );
  zip.file(CUSTOM_XML_PATH, customXmlContent);
  zip.file(CUSTOM_XML_PROPS_PATH, buildCustomXmlItemProps(STORE_ITEM_ID));

  // ── 6. Ensure customXml/_rels/item1.xml.rels exists ──────────────────────
  ensureCustomXmlRels(zip);

  // ── 7. Update word/_rels/document.xml.rels ────────────────────────────────
  updateDocumentRels(zip);

  // ── 8. Update [Content_Types].xml ─────────────────────────────────────────
  updateContentTypes(zip);

  // ── 9. Generate blob and trigger download ─────────────────────────────────
  const blob = zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const exportName = fileName.replace(/\.docx$/i, '') + '_tagged.docx';
  saveAs(blob, exportName);
}

// ─── Content Control injection ────────────────────────────────────────────────

/**
 * Walk the document DOM and inject <w:sdt> wrappers + bookmarks for text tags.
 */
function injectContentControls(
  docDom: Document,
  docModel: DocModel,
  tags: Tag[]
): void {
  // Collect all paragraphs in document order
  const allParas = collectParagraphsInOrder(docDom);

  // Find the highest existing bookmark ID so we don't collide
  const bookmarkCounter = { value: findMaxBookmarkId(docDom) + 1 };

  // Sort tags by paragraph then by start offset (process in reverse within
  // each paragraph to avoid offset drift from earlier injections)
  const sortedTags = [...tags].sort((a, b) => {
    if (a.paragraphIndex !== b.paragraphIndex) {
      return b.paragraphIndex - a.paragraphIndex; // reverse para order
    }
    return b.startOffset - a.startOffset; // reverse offset order
  });

  for (const tag of sortedTags) {
    const paraEl = allParas[tag.paragraphIndex];
    if (!paraEl) continue;

    const docPara = docModel.paragraphs[tag.paragraphIndex];
    if (!docPara) continue;

    injectSdtIntoParagraph(docDom, paraEl, docPara, tag, bookmarkCounter, STORE_ITEM_ID);
  }
}

function isTextTag(tag: Tag): boolean {
  const type = tag.targetType ?? 'text';
  return type === 'text' && tag.endOffset > tag.startOffset;
}
