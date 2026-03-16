import type { Tag } from '../types';
import { NS } from './XmlHelpers';
import { buildSdt, CUSTOM_XML_NS } from './ContentControlBuilder';
import { generateBookmarkName, getBookmarkSuffix } from './bookmarkUtils';

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
 * Collect runs that map to DocParser run indices (`p{para}_r{index}`):
 * text/tab runs with visible content, image runs, and chart runs.
 */
export function collectTaggableRunElements(paraEl: Element): Element[] {
  const runs: Element[] = [];

  function visit(node: Element) {
    const ns = node.namespaceURI;
    const name = node.localName;

    if (ns === NS.w && name === 'r') {
      if (isTaggableRunElement(node)) runs.push(node);
      return;
    }

    if (
      ns === NS.w &&
      (name === 'hyperlink' ||
        name === 'sdt' ||
        name === 'sdtContent' ||
        name === 'ins' ||
        name === 'del')
    ) {
      const children = node.childNodes;
      for (let i = 0; i < children.length; i++) {
        if (children[i].nodeType === 1) visit(children[i] as Element);
      }
      return;
    }

    // Keep behavior aligned with DocxParser fallback branch: only direct w:r children.
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType !== 1) continue;
      const childEl = child as Element;
      if (childEl.namespaceURI === NS.w && childEl.localName === 'r') {
        if (isTaggableRunElement(childEl)) runs.push(childEl);
      }
    }
  }

  const children = paraEl.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType !== 1) continue;
    const childEl = child as Element;
    if (childEl.namespaceURI === NS.w && childEl.localName === 'pPr') continue;
    visit(childEl);
  }

  return runs;
}

/**
 * Inject only bookmarkStart/bookmarkEnd around a specific parsed run index.
 * Used for image/graph tags where we do not wrap with <w:sdt>.
 */
export function injectBookmarkAroundRun(
  docDom: Document,
  paraEl: Element,
  runIndex: number,
  tag: Tag,
  bookmarkCounter: { value: number }
): boolean {
  const runs = collectTaggableRunElements(paraEl);
  const targetRun = runs[runIndex];
  if (!targetRun) return false;

  const parent = targetRun.parentNode;
  if (!parent) return false;

  const bmId = bookmarkCounter.value++;
  const bmName = generateBookmarkName(tag);

  const bookmarkStart = docDom.createElementNS(NS.w, 'w:bookmarkStart');
  bookmarkStart.setAttributeNS(NS.w, 'w:id', String(bmId));
  bookmarkStart.setAttributeNS(NS.w, 'w:name', bmName);

  const bookmarkEnd = docDom.createElementNS(NS.w, 'w:bookmarkEnd');
  bookmarkEnd.setAttributeNS(NS.w, 'w:id', String(bmId));

  parent.insertBefore(bookmarkStart, targetRun);
  if (targetRun.nextSibling) {
    parent.insertBefore(bookmarkEnd, targetRun.nextSibling);
  } else {
    parent.appendChild(bookmarkEnd);
  }

  return true;
}

function isTaggableRunElement(runEl: Element): boolean {
  if (runHasImageOrGraph(runEl)) return true;
  return getRunTextWithTabs(runEl) !== '';
}

function runHasImageOrGraph(runEl: Element): boolean {
  const drawings = runEl.getElementsByTagNameNS(NS.w, 'drawing');
  for (let i = 0; i < drawings.length; i++) {
    const drawing = drawings[i];
    const blips = drawing.getElementsByTagNameNS(NS.a, 'blip');
    for (let j = 0; j < blips.length; j++) {
      const embedId =
        blips[j].getAttributeNS(NS.r, 'embed') ?? blips[j].getAttribute('r:embed');
      if (embedId) return true;
    }

    const charts = drawing.getElementsByTagNameNS(NS.c, 'chart');
    for (let j = 0; j < charts.length; j++) {
      const chartId =
        charts[j].getAttributeNS(NS.r, 'id') ?? charts[j].getAttribute('r:id');
      if (chartId) return true;
    }
  }

  const objects = runEl.getElementsByTagNameNS(NS.w, 'object');
  for (let i = 0; i < objects.length; i++) {
    const descendants = objects[i].getElementsByTagName('*');
    for (let j = 0; j < descendants.length; j++) {
      if (descendants[j].localName !== 'imagedata') continue;
      const imgId =
        descendants[j].getAttributeNS(NS.r, 'id') ??
        descendants[j].getAttribute('r:id');
      if (imgId) return true;
    }
  }

  return false;
}

function getRunTextWithTabs(runEl: Element): string {
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

function appendRunTextWithTabs(doc: Document, runEl: Element, text: string): void {
  if (text.length === 0) return;

  const tokens = text.match(/\t+|[^\t]+/g);
  if (!tokens) return;

  for (const token of tokens) {
    if (token.startsWith('\t')) {
      for (let i = 0; i < token.length; i++) {
        runEl.appendChild(doc.createElementNS(NS.w, 'w:tab'));
      }
      continue;
    }

    const t = doc.createElementNS(NS.w, 'w:t');
    t.textContent = token;
    if (token.startsWith(' ') || token.endsWith(' ')) {
      t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    }
    runEl.appendChild(t);
  }
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

  // Get full run text, including tab characters.
  const fullText = getRunTextWithTabs(runEl);

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

/** Update the text content of a <w:r>, preserving tab characters as <w:tab/>. */
export function setRunText(doc: Document, runEl: Element, text: string): void {
  const children = Array.from(runEl.childNodes);
  for (const child of children) {
    if (
      child.nodeType === 1 &&
      (child as Element).namespaceURI === NS.w &&
      (child as Element).localName === 'rPr'
    ) {
      continue;
    }
    runEl.removeChild(child);
  }

  appendRunTextWithTabs(doc, runEl, text);
}

/**
 * Inject a single <w:sdt> content control + surrounding bookmarks into a
 * paragraph element.
 *
 * The resulting XML structure is:
 *   <w:bookmarkStart w:id="N" w:name="Category_uuid8"/>
 *   <w:sdt>...</w:sdt>
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

  // Map DocRun index -> DOM Element
  // We match runs by sequential text position
  let cursor = 0;
  const runMap: { domRun: Element; start: number; end: number }[] = [];

  for (const runEl of runElements) {
    const text = getRunTextWithTabs(runEl);
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
  // (Avoid using sdt.contains() - @xmldom/xmldom does not implement that method.)
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

  // Bookmark
  const bmId = bookmarkCounter.value++;
  const bmName = generateBookmarkName(tag);

  // <w:bookmarkStart w:id="N" w:name="..."/>
  const bookmarkStart = docDom.createElementNS(NS.w, 'w:bookmarkStart');
  bookmarkStart.setAttributeNS(NS.w, 'w:id', String(bmId));
  bookmarkStart.setAttributeNS(NS.w, 'w:name', bmName);

  // <w:bookmarkEnd w:id="N"/>
  const bookmarkEnd = docDom.createElementNS(NS.w, 'w:bookmarkEnd');
  bookmarkEnd.setAttributeNS(NS.w, 'w:id', String(bmId));

  // Insert order: bookmarkStart -> sdt -> bookmarkEnd
  parent.insertBefore(bookmarkStart, runsToWrap[0]);
  parent.insertBefore(sdt, runsToWrap[0]);
  parent.insertBefore(bookmarkEnd, runsToWrap[0]);

  // Move the target runs inside sdtContent
  for (const run of runsToWrap) {
    sdtContentEl.appendChild(run);
  }

  // Keep signature aligned with existing caller; intentionally unused.
  void docPara;
}



/**
 * Inject bookmarkStart + bookmarkEnd for a tag that spans multiple paragraphs.
 *
 * The bookmarkStart is placed before the first tagged run in the start
 * paragraph (splitting a run if the offset falls in the middle), and
 * bookmarkEnd is placed after the last tagged run in the end paragraph.
 *
 * No <w:sdt> is used here — Word bookmarks alone fully support
 * cross-paragraph ranges and are simpler to inject/extract.
 */
export function injectCrossParaBookmarks(
  docDom: Document,
  allParas: Element[],
  tag: import('../types').Tag,
  bookmarkCounter: { value: number }
): void {
  const endParaIdx = tag.endParagraphIndex!;
  const startParaEl = allParas[tag.paragraphIndex];
  const endParaEl = allParas[endParaIdx];
  if (!startParaEl || !endParaEl) return;

  const bmId = bookmarkCounter.value++;
  const bmName = generateBookmarkName(tag);

  const bookmarkStart = docDom.createElementNS(NS.w, 'w:bookmarkStart');
  bookmarkStart.setAttributeNS(NS.w, 'w:id', String(bmId));
  bookmarkStart.setAttributeNS(NS.w, 'w:name', bmName);

  const bookmarkEnd = docDom.createElementNS(NS.w, 'w:bookmarkEnd');
  bookmarkEnd.setAttributeNS(NS.w, 'w:id', String(bmId));

  placeBookmarkAtOffset(docDom, startParaEl, tag.startOffset, 'start', bookmarkStart);
  placeBookmarkAtOffset(docDom, endParaEl, tag.endOffset, 'end', bookmarkEnd);
}

/**
 * Place a bookmark marker (start or end) at the given character offset
 * within a paragraph.
 *
 * @param placement 'start' → insert before the run at offset (splitting if
 *                  needed); 'end' → insert after the run containing offset.
 */
function placeBookmarkAtOffset(
  docDom: Document,
  paraEl: Element,
  targetOffset: number,
  placement: 'start' | 'end',
  markerEl: Element
): void {
  const runElements = collectRunElements(paraEl);
  if (runElements.length === 0) {
    // Paragraph has no runs — just append the marker to the paragraph
    paraEl.appendChild(markerEl);
    return;
  }

  // Build a text-offset map for the paragraph's runs
  let cursor = 0;
  const runMap: { domRun: Element; start: number; end: number }[] = [];
  for (const runEl of runElements) {
    const text = getRunTextWithTabs(runEl);
    if (text === '') continue;
    runMap.push({ domRun: runEl, start: cursor, end: cursor + text.length });
    cursor += text.length;
  }

  if (runMap.length === 0) {
    paraEl.appendChild(markerEl);
    return;
  }

  if (placement === 'start') {
    // Find the first run that covers (or starts at) targetOffset
    for (const entry of runMap) {
      if (entry.end <= targetOffset) continue;

      const parent = entry.domRun.parentNode!;
      if (entry.start < targetOffset) {
        // Need to split this run so the bookmark is on the boundary
        const splitOffset = targetOffset - entry.start;
        const [, after] = splitRunElement(docDom, entry.domRun, splitOffset);
        parent.insertBefore(markerEl, after);
      } else {
        parent.insertBefore(markerEl, entry.domRun);
      }
      return;
    }
    // targetOffset is past all runs — insert after the last run
    const last = runMap[runMap.length - 1].domRun;
    const parent = last.parentNode!;
    if (last.nextSibling) {
      parent.insertBefore(markerEl, last.nextSibling);
    } else {
      parent.appendChild(markerEl);
    }
  } else {
    // placement === 'end': insert after the last run that is ≤ targetOffset
    let insertAfter: Element | null = null;
    for (const entry of runMap) {
      if (entry.start >= targetOffset) break;

      if (entry.end > targetOffset) {
        // Run straddles the boundary — split it
        const splitOffset = targetOffset - entry.start;
        const [before] = splitRunElement(docDom, entry.domRun, splitOffset);
        insertAfter = before;
        break;
      }
      insertAfter = entry.domRun;
    }

    if (!insertAfter) {
      // targetOffset is before all runs — insert at the beginning of the para
      const firstChild = paraEl.firstChild;
      if (firstChild) {
        paraEl.insertBefore(markerEl, firstChild);
      } else {
        paraEl.appendChild(markerEl);
      }
      return;
    }

    const parent = insertAfter.parentNode!;
    if (insertAfter.nextSibling) {
      parent.insertBefore(markerEl, insertAfter.nextSibling);
    } else {
      parent.appendChild(markerEl);
    }
  }
}

/**
 * Removes existing custom tag <w:sdt> elements and their associated bookmarks
 * from the document to prevent nesting when we inject new ones.
 */
export function cleanExistingTagAnchors(docDom: Document): void {
  // 1. Unwrap all custom <w:sdt> elements
  const sdts = Array.from(docDom.getElementsByTagNameNS(NS.w, 'sdt'));
  for (const sdt of sdts) {
    const sdtPr = sdt.getElementsByTagNameNS(NS.w, 'sdtPr')[0];
    if (!sdtPr) continue;

    const dataBinding = sdtPr.getElementsByTagNameNS(NS.w, 'dataBinding')[0];
    if (!dataBinding) continue;

    const prefixMappings = dataBinding.getAttributeNS(NS.w, 'prefixMappings') || dataBinding.getAttribute('w:prefixMappings') || '';
    if (!prefixMappings.includes(CUSTOM_XML_NS)) continue;

    // This is one of our custom SDTs. Unwrap it.
    const sdtContent = sdt.getElementsByTagNameNS(NS.w, 'sdtContent')[0];
    const parent = sdt.parentNode;
    if (!parent) continue;

    if (sdtContent) {
      // Move all children of sdtContent to the parent, before the sdt
      while (sdtContent.firstChild) {
        parent.insertBefore(sdtContent.firstChild, sdt);
      }
    }
    // Remove the sdt element
    parent.removeChild(sdt);
  }

  // 2. Remove associated bookmarkStart and bookmarkEnd
  const activeIds = new Set<string>();
  const starts = Array.from(docDom.getElementsByTagNameNS(NS.w, 'bookmarkStart'));
  for (const start of starts) {
    const name = start.getAttributeNS(NS.w, 'name') || start.getAttribute('w:name');
    if (name && getBookmarkSuffix(name)) {
      const id = start.getAttributeNS(NS.w, 'id') || start.getAttribute('w:id');
      if (id) activeIds.add(id);
      start.parentNode?.removeChild(start);
    }
  }

  const ends = Array.from(docDom.getElementsByTagNameNS(NS.w, 'bookmarkEnd'));
  for (const end of ends) {
    const id = end.getAttributeNS(NS.w, 'id') || end.getAttribute('w:id');
    if (id && activeIds.has(id)) {
      end.parentNode?.removeChild(end);
    }
  }
}
