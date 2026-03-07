import type { Tag } from '../types';
import { NS } from './XmlHelpers';
import { buildSdt } from './ContentControlBuilder';
import { generateBookmarkName } from './bookmarkUtils';

/**
 * Collect all <w:p> elements in document body order, mirroring the
 * sequential indexing done in DocxParser.
 */
export function collectParagraphsInOrder(docDom: Document): Element[] {
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
 * Collect all <w:r> run elements that carry text within a paragraph,
 * including those inside hyperlinks and existing sdtContent.
 */
export function collectRunElements(paraEl: Element): Element[] {
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
export function splitRunElement(
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
export function setRunText(doc: Document, runEl: Element, text: string): void {
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

/**
 * Inject a single <w:sdt> content control + surrounding bookmarks into a
 * paragraph element.
 *
 * The resulting XML structure is:
 *   <w:bookmarkStart w:id="N" w:name="Category_uuid8"/>
 *   <w:sdt>…</w:sdt>
 *   <w:bookmarkEnd w:id="N"/>
 */
export function injectSdtIntoParagraph(
  docDom: Document,
  paraEl: Element,
  docPara: import('../types').DocParagraph,
  tag: Tag,
  bookmarkCounter: { value: number },
  storeId: string
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
  const sdt = buildSdt(docDom, tag.uuid, [], storeId);
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

  // ── Bookmark ─────────────────────────────────────────────────────────────
  const bmId = bookmarkCounter.value++;
  const bmName = generateBookmarkName(tag);

  // <w:bookmarkStart w:id="N" w:name="..."/>
  const bookmarkStart = docDom.createElementNS(NS.w, 'w:bookmarkStart');
  bookmarkStart.setAttributeNS(NS.w, 'w:id', String(bmId));
  bookmarkStart.setAttributeNS(NS.w, 'w:name', bmName);

  // <w:bookmarkEnd w:id="N"/>
  const bookmarkEnd = docDom.createElementNS(NS.w, 'w:bookmarkEnd');
  bookmarkEnd.setAttributeNS(NS.w, 'w:id', String(bmId));

  // Insert order: bookmarkStart → sdt → bookmarkEnd
  parent.insertBefore(bookmarkStart, runsToWrap[0]);
  parent.insertBefore(sdt, runsToWrap[0]);
  parent.insertBefore(bookmarkEnd, runsToWrap[0]);

  // Move the target runs inside sdtContent
  for (const run of runsToWrap) {
    sdtContentEl.appendChild(run);
  }
}
