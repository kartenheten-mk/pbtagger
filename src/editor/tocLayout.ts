import type { DocParagraph } from '../types';

export interface TocEntry {
  marker: string;
  title: string;
  page: string;
  /** Zero-based visual nesting level: TOC1/Innehll1 = 0, TOC2/Innehll2 = 1. */
  level: number;
}

export interface TocDecorations {
  titleIndices: Set<number>;
  entries: Map<number, TocEntry>;
}

export function buildTocDecorations(paragraphs: DocParagraph[]): TocDecorations {
  const titleIndices = new Set<number>();
  const entries = new Map<number, TocEntry>();

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    if (isTocTitle(getParagraphText(para))) {
      titleIndices.add(i);
    }

    const styleLevel = getTocStyleLevel(para.styleId);
    if (styleLevel !== undefined) {
      const entry = parseTocEntry(para, styleLevel);
      if (entry) entries.set(i, entry);
    }
  }

  for (const titleIndex of titleIndices) {
    const counters: number[] = [];
    let foundAnyItems = false;

    for (let i = titleIndex + 1; i < paragraphs.length; i++) {
      if (entries.has(i)) {
        foundAnyItems = true;
        continue;
      }

      const para = paragraphs[i];
      if (para.listLevel === undefined) {
        if (foundAnyItems && getParagraphText(para).trim()) break;
        continue;
      }

      foundAnyItems = true;
      const level = Math.max(0, para.listLevel);
      counters[level] = (counters[level] ?? 0) + 1;
      counters.length = level + 1;

      const generatedMarker = counters.map((value) => value || 1).join('.');
      const entry = parseTocEntry(para, level, generatedMarker);
      if (entry) entries.set(i, entry);
    }
  }

  return { titleIndices, entries };
}

export function parseTocEntry(
  paragraph: DocParagraph,
  level = 0,
  generatedMarker = ''
): TocEntry | null {
  const rawText = getParagraphText(paragraph);
  const tabSegments = rawText
    .split('\t')
    .map(normalizeTocText)
    .map(normalizeFieldSegment)
    .filter(Boolean);

  const entryFromTabs = parseTabbedTocSegments(tabSegments, level, generatedMarker);
  if (entryFromTabs) return entryFromTabs;

  const text = normalizeTocText(normalizeFieldSegment(rawText));
  const trailingPageMatch = text.match(/^(.*?)(\d{1,4}|[IVXLCDMivxlcdm]{1,10})$/);
  if (!trailingPageMatch) return null;

  const leftText = normalizeTocText(trailingPageMatch[1]);
  const page = trailingPageMatch[2];
  if (!leftText || !isLikelyPageNumber(page)) return null;

  const markerMatch = leftText.match(/^(\d+(?:\.\d+)*\.?)\s+(.+)$/);
  const marker = generatedMarker || (markerMatch ? cleanMarker(markerMatch[1]) : '');
  const title = markerMatch ? normalizeTocText(markerMatch[2]) : leftText;
  if (!title) return null;

  return { marker, title, page, level };
}

export function getTocStyleLevel(styleId: string | undefined): number | undefined {
  if (!styleId) return undefined;

  const normalized = styleId
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  const match = normalized.match(/^(?:toc|innehall|innehll)(\d+)$/);
  if (!match) return undefined;

  const level = parseInt(match[1], 10);
  return Number.isFinite(level) && level > 0 ? level - 1 : undefined;
}

export function getParagraphText(para: DocParagraph): string {
  return para.runs.map((run) => run.text).join('');
}

function parseTabbedTocSegments(
  segments: string[],
  level: number,
  generatedMarker: string
): TocEntry | null {
  if (segments.length < 2) return null;

  const page = segments[segments.length - 1];
  if (!isLikelyPageNumber(page)) return null;

  const contentSegments = segments.slice(0, -1);
  const firstContent = contentSegments[0];
  const hasExplicitMarker = isLikelyTocMarker(firstContent);
  const marker = generatedMarker || (hasExplicitMarker ? cleanMarker(firstContent) : '');
  const titleSegments = hasExplicitMarker ? contentSegments.slice(1) : contentSegments;
  const title = normalizeTocText(titleSegments.join(' '));

  if (!title) return null;

  return { marker, title, page, level };
}

function isLikelyTocMarker(value: string): boolean {
  return /^\d+(?:\.\d+)*\.?$/.test(value.trim());
}

function cleanMarker(value: string): string {
  return value.trim().replace(/\.$/, '');
}

function normalizeTocText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeFieldSegment(value: string): string {
  const text = normalizeTocText(value);
  if (!/\b(?:PAGEREF|TOC)\b/i.test(text)) return text;

  const pageMatch = text.match(/(\d{1,4}|[IVXLCDMivxlcdm]{1,10})$/);
  return pageMatch?.[1] ?? '';
}

function isLikelyPageNumber(value: string): boolean {
  return /^\d{1,4}$/.test(value) || /^[IVXLCDMivxlcdm]{1,10}$/.test(value);
}

function isTocTitle(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    normalized === 'innehallsforteckning' ||
    normalized === 'innehallforteckning' ||
    normalized === 'table of contents' ||
    normalized === 'contents'
  );
}
