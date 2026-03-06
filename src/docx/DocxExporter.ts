/**
 * DocxExporter.ts
 *
 * Takes the original PizZip archive + the current list of tags and:
 *  1. Parses word/document.xml into a mutable DOM
 *  2. Injects <w:sdt> Content Controls around the tagged text runs
 *  3. Writes / updates customXml/item1.xml with all tag metadata
 *  4. Updates [Content_Types].xml and word/_rels/document.xml.rels if needed
 *  5. Re-zips and triggers a browser download
 *
 * All un-tagged content (images, tables, headers, footers, styles, etc.)
 * is preserved byte-for-byte because we only modify the two XML files above
 * and only in the specific run locations that are tagged.
 */

import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import type { Tag, DocModel } from '../types';
import { parseXml, serializeXml, NS } from './XmlHelpers';
import {
  buildCustomXmlItem,
  buildCustomXmlItemProps,
  CUSTOM_XML_REL_TYPE,
  CUSTOM_XML_CONTENT_TYPE,
  buildSdt,
} from './ContentControlBuilder';

// Fixed store item ID for our custom XML part (GUID without braces used in file)
const STORE_ITEM_ID = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
const CUSTOM_XML_PATH = 'customXml/item1.xml';
const CUSTOM_XML_PROPS_PATH = 'customXml/itemProps1.xml';
const CUSTOM_XML_RELS_PATH = 'customXml/_rels/item1.xml.rels';
const DOC_RELS_PATH = 'word/_rels/document.xml.rels';
const CONTENT_TYPES_PATH = '[Content_Types].xml';

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

  // ── 3. Inject <w:sdt> Content Controls ───────────────────────────────────
  if (tags.length > 0) {
    injectContentControls(docDom, docModel, tags);
  }

  // ── 4. Serialize modified document.xml back into ZIP ─────────────────────
  const modifiedDocXml = serializeXml(docDom);
  zip.file('word/document.xml', modifiedDocXml);

  // ── 5. Write Custom XML part ───────────────────────────────────────────────
  const customXmlContent = buildCustomXmlItem(
    tags.map((t) => ({
      uuid: t.uuid,
      categoryId: t.categoryId,
      text: t.text,
      paragraphIndex: t.paragraphIndex,
      startOffset: t.startOffset,
      endOffset: t.endOffset,
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
 * Walk the document DOM and inject <w:sdt> wrappers for each tag.
 *
 * Strategy:
 *   - Collect all <w:p> elements in document order (matching the index from
 *     the parser)
 *   - For each tag, find the target paragraph by index
 *   - Within that paragraph, find the <w:r> runs that cover the offset range
 *   - Split runs at the boundaries, then wrap the affected runs in a <w:sdt>
 */
function injectContentControls(
  docDom: Document,
  docModel: DocModel,
  tags: Tag[]
): void {
  // Collect all paragraphs in document order
  const allParas = collectParagraphsInOrder(docDom);

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

    injectSdtIntoParagraph(docDom, paraEl, docPara, tag);
  }
}

/**
 * Collect all <w:p> elements in document body order, mirroring the
 * sequential indexing done in DocxParser.
 */
function collectParagraphsInOrder(docDom: Document): Element[] {
  const result: Element[] = [];
  const bodies = docDom.getElementsByTagNameNS(NS.w, 'body');
  if (!bodies.length) return result;
  const body = bodies[0] as Element;

  function walk(node: Element) {
    if (node.namespaceURI === NS.w && node.localName === 'p') {
      result.push(node);
      return;
    }
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      if (children[i].nodeType === 1) walk(children[i] as Element);
    }
  }

  const bodyChildren = body.childNodes;
  for (let i = 0; i < bodyChildren.length; i++) {
    if (bodyChildren[i].nodeType === 1) walk(bodyChildren[i] as Element);
  }
  return result;
}

/**
 * Inject a single <w:sdt> content control into a paragraph element.
 */
function injectSdtIntoParagraph(
  docDom: Document,
  paraEl: Element,
  docPara: import('../types').DocParagraph,
  tag: Tag
): void {
  // Collect the <w:r> run elements that are direct or near-direct children
  const runElements = collectRunElements(paraEl);

  if (runElements.length === 0) return;

  // Map DocRun index → DOM Element
  // We match runs by sequential text position
  let cursor = 0;
  const runMap: { domRun: Element; start: number; end: number }[] = [];

  for (const runEl of runElements) {
    const tNodes = runEl.getElementsByTagNameNS(NS.w, 't');
    let text = '';
    for (let i = 0; i < tNodes.length; i++) text += tNodes[i].textContent ?? '';
    if (text === '') continue;
    runMap.push({ domRun: runEl, start: cursor, end: cursor + text.length });
    cursor += text.length;
  }

  // Find runs that overlap the tag range
  const affected = runMap.filter(
    (r) => r.end > tag.startOffset && r.start < tag.endOffset
  );
  if (affected.length === 0) return;

  // Split the first and last runs at the boundaries if necessary
  const firstRun = affected[0];
  const lastRun = affected[affected.length - 1];

  // Split first run if the tag doesn't start at its beginning
  if (tag.startOffset > firstRun.start) {
    const splitOffset = tag.startOffset - firstRun.start;
    const [, after] = splitRunElement(docDom, firstRun.domRun, splitOffset);
    // "after" is now the run that starts at tag.startOffset
    firstRun.domRun = after;
  }

  // Split last run if the tag doesn't end at its end
  if (tag.endOffset < lastRun.end) {
    const splitOffset = tag.endOffset - lastRun.start;
    const [before] = splitRunElement(docDom, lastRun.domRun, splitOffset);
    lastRun.domRun = before;
  }

  // Re-collect affected runs after potential splits
  const runsToWrap = affected.map((r) => r.domRun);

  // Build the <w:sdt> element
  const sdt = buildSdt(docDom, tag.uuid, [], STORE_ITEM_ID);
  // Find sdtContent as a direct child of the newly created sdt node.
  // (Avoid using sdt.contains() — @xmldom/xmldom does not implement that method.)
  let sdtContentEl: Element | null = null;
  const sdtChildren = sdt.childNodes;
  for (let i = 0; i < sdtChildren.length; i++) {
    const c = sdtChildren[i] as Element;
    if (c.localName === 'sdtContent') {
      sdtContentEl = c;
      break;
    }
  }

  if (!sdtContentEl) return;

  // Insert the sdt before the first run to wrap
  const parent = runsToWrap[0].parentNode;
  if (!parent) return;

  parent.insertBefore(sdt, runsToWrap[0]);

  // Move the target runs inside sdtContent
  for (const run of runsToWrap) {
    sdtContentEl.appendChild(run);
  }
}

/**
 * Collect all <w:r> run elements that carry text within a paragraph,
 * including those inside hyperlinks and existing sdtContent.
 */
function collectRunElements(paraEl: Element): Element[] {
  const runs: Element[] = [];

  function visit(node: Element) {
    if (node.namespaceURI === NS.w && node.localName === 'r') {
      runs.push(node);
      return;
    }
    if (node.namespaceURI === NS.w && node.localName === 'pPr') return;
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      if (children[i].nodeType === 1) visit(children[i] as Element);
    }
  }

  const children = paraEl.childNodes;
  for (let i = 0; i < children.length; i++) {
    if (children[i].nodeType === 1) visit(children[i] as Element);
  }

  return runs;
}

/**
 * Split a <w:r> run element at the given character offset into two runs.
 * Returns [beforeRun, afterRun]. Both are inserted into the DOM at the
 * correct position (the original run is removed).
 */
function splitRunElement(
  doc: Document,
  runEl: Element,
  offset: number
): [Element, Element] {
  const parent = runEl.parentNode!;

  // Get full text from <w:t> nodes
  const tNodes = runEl.getElementsByTagNameNS(NS.w, 't');
  let fullText = '';
  for (let i = 0; i < tNodes.length; i++) fullText += tNodes[i].textContent ?? '';

  const beforeText = fullText.slice(0, offset);
  const afterText = fullText.slice(offset);

  // Clone the run twice
  const beforeRun = runEl.cloneNode(true) as Element;
  const afterRun = runEl.cloneNode(true) as Element;

  // Update w:t text in beforeRun
  setRunText(doc, beforeRun, beforeText);
  // Update w:t text in afterRun
  setRunText(doc, afterRun, afterText);

  // Insert both before the original, then remove original
  parent.insertBefore(beforeRun, runEl);
  parent.insertBefore(afterRun, runEl);
  parent.removeChild(runEl);

  return [beforeRun, afterRun];
}

/** Update the text content of a <w:r>'s <w:t> node */
function setRunText(doc: Document, runEl: Element, text: string): void {
  const tNodes = runEl.getElementsByTagNameNS(NS.w, 't');
  if (tNodes.length === 0) {
    // Create a <w:t> if missing
    const t = doc.createElementNS(NS.w, 'w:t');
    t.textContent = text;
    if (text.startsWith(' ') || text.endsWith(' ')) {
      t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    }
    runEl.appendChild(t);
    return;
  }
  // Set first t node, remove extras
  for (let i = 0; i < tNodes.length; i++) {
    if (i === 0) {
      tNodes[i].textContent = text;
      if (text.startsWith(' ') || text.endsWith(' ')) {
        (tNodes[i] as Element).setAttributeNS(
          'http://www.w3.org/XML/1998/namespace',
          'xml:space',
          'preserve'
        );
      }
    } else {
      tNodes[i].parentNode?.removeChild(tNodes[i]);
    }
  }
}

// ─── ZIP file management ──────────────────────────────────────────────────────

function ensureCustomXmlRels(zip: PizZip): void {
  const relsContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;
  if (!zip.file(CUSTOM_XML_RELS_PATH)) {
    zip.file(CUSTOM_XML_RELS_PATH, relsContent);
  }
}

function updateDocumentRels(zip: PizZip): void {
  const relsFile = zip.file(DOC_RELS_PATH);
  if (!relsFile) return;

  let relsXml = relsFile.asText();

  // Check if relationship already exists
  if (relsXml.includes('../customXml/item1.xml')) return;

  // Generate a new relationship ID
  const relId = 'rIdPbTagging1';

  const newRel = `<Relationship Id="${relId}" Type="${CUSTOM_XML_REL_TYPE}" Target="../customXml/item1.xml"/>`;

  // Insert before </Relationships>
  relsXml = relsXml.replace('</Relationships>', `  ${newRel}\n</Relationships>`);
  zip.file(DOC_RELS_PATH, relsXml);
}

function updateContentTypes(zip: PizZip): void {
  const ctFile = zip.file(CONTENT_TYPES_PATH);
  if (!ctFile) return;

  let ctXml = ctFile.asText();

  // Add Override for item1.xml if not present
  if (!ctXml.includes('/customXml/item1.xml')) {
    const override = `<Override PartName="/customXml/item1.xml" ContentType="${CUSTOM_XML_CONTENT_TYPE}"/>`;
    ctXml = ctXml.replace('</Types>', `  ${override}\n</Types>`);
  }

  // Add Override for itemProps1.xml if not present
  if (!ctXml.includes('/customXml/itemProps1.xml')) {
    const propsOverride = `<Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>`;
    ctXml = ctXml.replace('</Types>', `  ${propsOverride}\n</Types>`);
  }

  zip.file(CONTENT_TYPES_PATH, ctXml);
}
