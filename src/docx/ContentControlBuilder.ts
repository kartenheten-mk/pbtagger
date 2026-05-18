/**
 * ContentControlBuilder.ts
 *
 * Builds the OOXML XML fragments required to wrap text in a
 * <w:sdt> (Structured Document Tag / Content Control).
 *
 * The SDT stores the tag UUID as a <w:tag w:val="..."/> element in the
 * <w:sdtPr> block, and binds to our Custom XML Part via <w:dataBinding>.
 */

import { DOMParser as XmlDOMParser } from '@xmldom/xmldom';
import { NS } from './XmlHelpers';

// The namespace URI we use for our custom XML part
export const CUSTOM_XML_NS = 'https://planbeskrivning/tagging/v1';

// The relationship type for customXml parts
export const CUSTOM_XML_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml';

// Content type for our custom XML item
export const CUSTOM_XML_CONTENT_TYPE =
  'application/xml';

/**
 * Given a Document context and a list of run XML strings, produce the full
 * <w:sdt>…</w:sdt> XML string that wraps those runs.
 *
 * @param doc         The owning XML document (for namespace awareness)
 * @param tagUuid     The UUID of the tag
 * @param runXmls     Array of serialized <w:r> XML strings to wrap
 * @param customXmlId The id of the custom XML part (e.g. "1")
 */
export function buildSdt(
  doc: Document,
  tagUuid: string,
  runXmls: string[],
  customXmlId: string
): Element {
  const w = NS.w;

  // <w:sdt>
  const sdt = doc.createElementNS(w, 'w:sdt');

  // ── <w:sdtPr> ────────────────────────────────────────────────────────────
  const sdtPr = doc.createElementNS(w, 'w:sdtPr');

  // <w:tag w:val="uuid"/>
  const tagEl = doc.createElementNS(w, 'w:tag');
  tagEl.setAttributeNS(w, 'w:val', tagUuid);
  sdtPr.appendChild(tagEl);

  // <w:id w:val="..."/> (arbitrary unique integer, use hash of UUID)
  const idEl = doc.createElementNS(w, 'w:id');
  idEl.setAttributeNS(w, 'w:val', uuidToInt(tagUuid).toString());
  sdtPr.appendChild(idEl);

  // <w:dataBinding w:prefixMappings="xmlns:pb='...'" w:xpath="..." w:storeItemID="{...}"/>
  const dataBinding = doc.createElementNS(w, 'w:dataBinding');
  dataBinding.setAttributeNS(
    w,
    'w:prefixMappings',
    `xmlns:pb='${CUSTOM_XML_NS}'`
  );
  dataBinding.setAttributeNS(
    w,
    'w:xpath',
    `/pb:tags/pb:tag[@uuid='${tagUuid}']/pb:text`
  );
  dataBinding.setAttributeNS(
    w,
    'w:storeItemID',
    `{${customXmlId.toUpperCase()}}`
  );
  sdtPr.appendChild(dataBinding);

  sdt.appendChild(sdtPr);

  // ── <w:sdtContent> ───────────────────────────────────────────────────────
  const sdtContent = doc.createElementNS(w, 'w:sdtContent');

  // We embed a <w:p> if the runs don't already have one, otherwise just runs.
  // For inline content controls the runs go directly into sdtContent.
  for (const runXml of runXmls) {
    // Parse the run fragment and import it into the document
    const frag = importXmlFragment(doc, runXml);
    if (frag) sdtContent.appendChild(frag);
  }

  sdt.appendChild(sdtContent);

  return sdt;
}

/**
 * Build the Custom XML part content (customXml/item1.xml) from an array of tags.
 */
export interface TagMetadata {
  uuid: string;
  categoryId: string;
  targetType?: 'text' | 'image' | 'graph' | 'table';
  text: string;
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
  /**
   * When set, the tag spans paragraphs from `paragraphIndex` to
   * `endParagraphIndex`. Omitted for single-paragraph tags.
   */
  endParagraphIndex?: number;
  runId?: string;
  tableId?: string;
  /** UUIDs of linked geometries (stored as comma-separated string in XML) */
  geometryIds?: string[];
  planbeskrivningImportedPlanomrade?: boolean;
  note?: string;
  createdAt: string;
}

export function buildCustomXmlItem(tags: TagMetadata[]): string {
  const tagElements = tags
    .map((t) => {
      const targetType = t.targetType ?? 'text';
      const geometryIdsAttr =
        t.geometryIds && t.geometryIds.length > 0
          ? ` geometryIds="${escXml(t.geometryIds.join(','))}"`
          : '';
      const endParaAttr =
        t.endParagraphIndex !== undefined && t.endParagraphIndex !== t.paragraphIndex
          ? ` endParagraphIndex="${t.endParagraphIndex}"`
          : '';
      const importedPlanomradeAttr = t.planbeskrivningImportedPlanomrade
        ? ' planbeskrivningImportedPlanomrade="true"'
        : '';
      return `  <pb:tag uuid="${escXml(t.uuid)}" categoryId="${escXml(t.categoryId)}" targetType="${escXml(targetType)}" paragraphIndex="${t.paragraphIndex}" startOffset="${t.startOffset}" endOffset="${t.endOffset}"${endParaAttr} createdAt="${escXml(t.createdAt)}"${t.runId ? ` runId="${escXml(t.runId)}"` : ''}${t.tableId ? ` tableId="${escXml(t.tableId)}"` : ''}${geometryIdsAttr}${importedPlanomradeAttr}${t.note ? ` note="${escXml(t.note)}"` : ''}>
    <pb:text>${escXml(t.text)}</pb:text>
  </pb:tag>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pb:tags xmlns:pb="${CUSTOM_XML_NS}">
${tagElements}
</pb:tags>`;
}

/**
 * Build the customXml/itemProps1.xml content.
 */
export function buildCustomXmlItemProps(storeItemId: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ds:datastoreItem ds:itemID="{${storeItemId}}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml">
  <ds:schemaRefs>
    <ds:schemaRef ds:uri="${CUSTOM_XML_NS}"/>
  </ds:schemaRefs>
</ds:datastoreItem>`;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Escape special XML characters */
function escXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Deterministic integer from UUID string (for <w:id>) */
function uuidToInt(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = ((hash << 5) - hash + uuid.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2147483647;
}

/** Import a serialized XML element string into a Document as a Node */
function importXmlFragment(doc: Document, xmlString: string): Node | null {
  try {
    const parser = new XmlDOMParser();
    const tmpDoc = parser.parseFromString(xmlString, 'application/xml');
    const root = tmpDoc.documentElement;
    if (!root) return null;
    return doc.importNode(root, true);
  } catch {
    return null;
  }
}
