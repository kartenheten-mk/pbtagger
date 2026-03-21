/**
 * DocxExporter.ts
 *
 * Takes the original PizZip archive + the current list of tags and:
 *  1. Parses word/document.xml into a mutable DOM
 *  2. Injects anchors into document.xml:
 *     - <w:sdt> + bookmarks for text tags
 *     - bookmarks for image/graph tags
 *  3. Writes / updates the customXml item that holds our tag metadata
 *     (dynamically resolved — Word may renumber items when saving)
 *  4. Updates [Content_Types].xml and word/_rels/document.xml.rels if needed
 *  5. Re-zips and triggers a browser download
 *
 * All un-tagged content (images, tables, headers, footers, styles, etc.)
 * is preserved byte-for-byte because we only modify the targeted XML files.
 */

import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import type { Tag, DocModel, Geometry, PlanbeskrivningConfig } from '../types';
import { parseXml, serializeXml } from './XmlHelpers';
import {
  buildCustomXmlItem,
  buildCustomXmlItemProps,
} from './ContentControlBuilder';
import {
  ensureCustomXmlRels,
  updateDocumentRels,
  updateContentTypes,
  resolveCustomXmlSlot,
  resolvePlanbeskrivningSlot,
  buildPlanbeskrivningItemProps,
  updateDocumentRelsForPlanbeskrivning,
} from './zipUtils';
import { findMaxBookmarkId } from './bookmarkUtils';
import {
  buildPlanbeskrivningXml,
  validatePlanbeskrivning,
} from './PlanbeskrivningXmlBuilder';
import {
  collectParagraphsInOrder,
  injectBookmarkAroundRun,
  injectSdtIntoParagraph,
  injectCrossParaBookmarks,
  cleanExistingTagAnchors,
} from './domUtils';

// Fixed store item ID for our custom XML part (GUID without braces used in file)
const STORE_ITEM_ID = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';

/**
 * Options for Planbeskrivning v2.0 XML generation during export.
 */
export interface PlanbeskrivningExportOptions {
  config: PlanbeskrivningConfig;
  geometries: Geometry[];
  /** When true (default), compliance errors block export */
  enforceCompliance?: boolean;
}

/**
 * Main export function. Clones the ZIP, injects tags, and downloads the file.
 *
 * @param originalZip      The original PizZip archive
 * @param docModel         Parsed document model
 * @param tags             All tags to export
 * @param fileName         Original file name (used for download name)
 * @param planbeskrivning  When provided, also injects the Planbeskrivning v2.0 XML
 */
export async function exportDocx(
  originalZip: PizZip,
  docModel: DocModel,
  tags: Tag[],
  fileName: string,
  planbeskrivning?: PlanbeskrivningExportOptions
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

  // 5. Resolve the correct customXml slot (handles Word renumbering items)
  const { itemPath, itemNumber, propsPath, relsPath } = resolveCustomXmlSlot(zip);

  // 6. Write Custom XML part (all tag types)
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
  zip.file(itemPath, customXmlContent);
  zip.file(propsPath, buildCustomXmlItemProps(STORE_ITEM_ID));

  // 7. Ensure customXml/_rels/item{N}.xml.rels exists
  ensureCustomXmlRels(zip, relsPath, itemNumber);

  // 8. Update word/_rels/document.xml.rels
  updateDocumentRels(zip, itemPath);

  // 9. Update [Content_Types].xml
  updateContentTypes(zip, itemPath, propsPath);

  // ── 10. Optionally inject Planbeskrivning v2.0 XML (omfattningar.xml) ────
  if (planbeskrivning) {
    injectPlanbeskrivningXml(zip, itemNumber, tags, planbeskrivning);
  }

  // 11. Generate blob and trigger download
  const blob = zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const exportName = fileName.replace(/\.docx$/i, '') + '_tagged.docx';
  saveAs(blob, exportName);
}

/**
 * Inject the Planbeskrivning v2.0 XML (omfattningar.xml) as a second
 * custom XML part into the ZIP archive.
 */
function injectPlanbeskrivningXml(
  zip: PizZip,
  tagMetadataItemNumber: number,
  tags: Tag[],
  opts: PlanbeskrivningExportOptions
): void {
  const validation = validatePlanbeskrivning(tags, opts.geometries);
  const enforceCompliance = opts.enforceCompliance ?? true;
  if (enforceCompliance && !validation.valid) {
    const details = formatComplianceErrors(validation.errors, tags);
    throw new Error(
      `Kan inte exportera Planbeskrivning v2.0 eftersom vissa regler inte uppfylls:\n${details}`
    );
  }

  // Resolve a slot that doesn't conflict with the tag-metadata slot
  const {
    itemPath: pbItemPath,
    itemNumber: pbItemNumber,
    propsPath: pbPropsPath,
    relsPath: pbRelsPath,
  } = resolvePlanbeskrivningSlot(zip, tagMetadataItemNumber);

  // Build the XML content
  const pbXml = buildPlanbeskrivningXml(opts.config, tags, opts.geometries);

  // Write the XML part and its props
  zip.file(pbItemPath, pbXml);
  zip.file(pbPropsPath, buildPlanbeskrivningItemProps());

  // Ensure the _rels file exists for this part
  ensureCustomXmlRels(zip, pbRelsPath, pbItemNumber);

  // Register in document.xml.rels and [Content_Types].xml
  updateDocumentRelsForPlanbeskrivning(zip, pbItemPath);
  updateContentTypes(zip, pbItemPath, pbPropsPath);
}

function formatComplianceErrors(
  errors: Array<{ rule: string; message: string; tagUuid?: string }>,
  tags: Tag[]
): string {
  const tagByUuid = new Map(tags.map((t) => [t.uuid, t]));
  return errors
    .map((e, idx) => {
      const tag = e.tagUuid ? tagByUuid.get(e.tagUuid) : undefined;
      const shortUuid = e.tagUuid ? e.tagUuid.slice(0, 8) : 'okänd';
      const preview =
        tag?.text
          ?.replace(/\s+/g, ' ')
          .trim()
          .slice(0, 60) ?? '';
      const clippedPreview =
        preview.length === 60 ? `${preview}...` : preview;
      const para =
        tag?.paragraphIndex !== undefined ? `, stycke ${tag.paragraphIndex + 1}` : '';

      const humanRule =
        e.rule === 'PLANB-004'
          ? 'Indelning (tema/grupp/undergrupp) måste vara giltig enligt BFS 2020:8.'
          : e.rule === 'PLANB-007'
            ? 'Objektreferens måste vara en beständig identifierare.'
            : e.message;

      const tagInfo = tag
        ? `Tagg ${shortUuid}${para}${clippedPreview ? `, text: "${clippedPreview}"` : ''}`
        : `Tagg ${shortUuid}`;

      return `${idx + 1}. [${e.rule}] ${tagInfo}\n   ${humanRule}`;
    })
    .join('\n');
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
