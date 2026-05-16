/**
 * XmlHelpers.ts
 * Low-level utilities for working with OOXML/WordprocessingML XML DOMs.
 * Uses @xmldom/xmldom for parsing and serialisation.
 */

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

// ─── Namespace URIs ──────────────────────────────────────────────────────────

export const NS = {
  w:
    'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r:
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  w14:
    'http://schemas.microsoft.com/office/word/2010/wordml',
  ct:
    'http://schemas.openxmlformats.org/package/2006/content-types',
  pkg:
    'http://schemas.microsoft.com/office/2006/xmlPackage',
  a:
    'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic:
    'http://schemas.openxmlformats.org/drawingml/2006/picture',
  c:
    'http://schemas.openxmlformats.org/drawingml/2006/chart',
  v:
    'urn:schemas-microsoft-com:vml',
} as const;

// ─── Parser / Serialiser ─────────────────────────────────────────────────────

const domParser = new DOMParser();
const xmlSerializer = new XMLSerializer();

export function parseXml(xmlString: string): Document {
  return domParser.parseFromString(xmlString, 'application/xml');
}

export function serializeXml(doc: Document | Element): string {
  return xmlSerializer.serializeToString(doc);
}

// ─── Node helpers ─────────────────────────────────────────────────────────────

/** Return all direct child elements with the given local name in the w: namespace */
export function wChildren(parent: Element | Document, localName: string): Element[] {
  const result: Element[] = [];
  const nodes = parent.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (
      node.nodeType === 1 &&
      (node as Element).localName === localName &&
      (node as Element).namespaceURI === NS.w
    ) {
      result.push(node as Element);
    }
  }
  return result;
}

/** Return all descendant elements with the given local name in the w: namespace */
export function wDescendants(parent: Element | Document, localName: string): Element[] {
  const nodeList = (parent as Element).getElementsByTagNameNS
    ? (parent as Element).getElementsByTagNameNS(NS.w, localName)
    : (parent as Document).getElementsByTagNameNS(NS.w, localName);
  const result: Element[] = [];
  for (let i = 0; i < nodeList.length; i++) {
    result.push(nodeList[i] as Element);
  }
  return result;
}

/** Get the text value of a w: attribute */
export function wAttr(element: Element, attr: string): string {
  return (
    element.getAttributeNS(NS.w, attr) ??
    element.getAttribute(`w:${attr}`) ??
    ''
  );
}

/** Get first child w: element by local name */
export function wChild(parent: Element, localName: string): Element | null {
  return wChildren(parent, localName)[0] ?? null;
}

/** Collect the raw text content of all w:t children recursively */
export function collectText(element: Element): string {
  const tNodes = element.getElementsByTagNameNS(NS.w, 't');
  let text = '';
  for (let i = 0; i < tNodes.length; i++) {
    text += tNodes[i].textContent ?? '';
  }
  return text;
}

/** Create an element in the w: namespace */
export function createWElement(doc: Document, localName: string): Element {
  return doc.createElementNS(NS.w, `w:${localName}`);
}

/** Clone a DOM document deeply */
export function cloneDoc(doc: Document): Document {
  const xml = serializeXml(doc);
  return parseXml(xml);
}

// ─── Heading style detection ──────────────────────────────────────────────────

/**
 * Detect the heading level (1-6) from a paragraph's <w:pStyle w:val="..."/>.
 * Returns 0 for normal paragraphs.
 */
export function getHeadingLevel(para: Element): number {
  const styleId = getParagraphStyleId(para);
  if (!styleId) return 0;

  const val = styleId.toLowerCase();
  const match = val.match(/^heading(\d)$/);
  if (match) return parseInt(match[1], 10);
  // Swedish / other locales use "Rubrik 1" etc.
  const matchRubrik = val.match(/^rubrik\s*(\d)$/);
  if (matchRubrik) return parseInt(matchRubrik[1], 10);
  return 0;
}

/** Return the raw paragraph style id from <w:pStyle w:val="..."/> */
export function getParagraphStyleId(para: Element): string | undefined {
  const pPr = wChild(para, 'pPr');
  if (!pPr) return undefined;
  const pStyle = wChild(pPr, 'pStyle');
  if (!pStyle) return undefined;
  return wAttr(pStyle, 'val') || undefined;
}

/** Return paragraph alignment from <w:jc w:val="..."/> */
export function getParagraphAlignment(para: Element): string | undefined {
  const pPr = wChild(para, 'pPr');
  if (!pPr) return undefined;
  const jc = wChild(pPr, 'jc');
  if (!jc) return undefined;
  return wAttr(jc, 'val') || undefined;
}

/** Return numbering list level from <w:numPr><w:ilvl w:val="..."/> */
export function getListLevel(para: Element): number | undefined {
  const pPr = wChild(para, 'pPr');
  if (!pPr) return undefined;
  const numPr = wChild(pPr, 'numPr');
  if (!numPr) return undefined;
  const ilvl = wChild(numPr, 'ilvl');
  if (!ilvl) return undefined;
  const val = wAttr(ilvl, 'val');
  return val !== '' ? parseInt(val, 10) : undefined;
}


