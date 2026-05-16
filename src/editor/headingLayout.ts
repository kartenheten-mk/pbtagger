import type { DocParagraph } from '../types';
import { getParagraphText } from './tocLayout';

export interface NumberedHeading {
  marker: string;
  title: string;
  level: number;
  leadingText: string;
  separatorText: string;
}

export function parseNumberedHeading(paragraph: DocParagraph | undefined): NumberedHeading | null {
  if (!paragraph) return null;
  if (paragraph.headingLevel <= 0) return null;

  const text = getParagraphText(paragraph);
  const tabbedMatch = text.match(/^(\t*)([^\t]+?)(\t+)([\s\S]+)$/);
  if (tabbedMatch) {
    const marker = normalizeHeadingText(tabbedMatch[2]);
    const title = normalizeHeadingText(tabbedMatch[4]);
    if (isLikelyHeadingMarker(marker) && title) {
      return {
        marker: cleanMarker(marker),
        title,
        level: Math.max(0, paragraph.headingLevel - 1),
        leadingText: tabbedMatch[1],
        separatorText: tabbedMatch[3],
      };
    }
  }

  const segments = text
    .split('\t')
    .map(normalizeHeadingText)
    .filter(Boolean);

  const headingLevel = Math.max(0, paragraph.headingLevel - 1);
  const fromTabs = parseTabbedHeadingSegments(segments, headingLevel);
  if (fromTabs) return fromTabs;

  const normalizedText = normalizeHeadingText(text);
  const match = normalizedText.match(/^(\d+(?:\.\d+)*\.?)\s+(.+)$/);
  if (!match) return null;

  return {
    marker: cleanMarker(match[1]),
    title: normalizeHeadingText(match[2]),
    level: headingLevel,
    leadingText: '',
    separatorText: ' ',
  };
}

function parseTabbedHeadingSegments(
  segments: string[],
  level: number
): NumberedHeading | null {
  if (segments.length < 2) return null;

  const marker = segments[0];
  if (!isLikelyHeadingMarker(marker)) return null;

  const title = normalizeHeadingText(segments.slice(1).join(' '));
  if (!title) return null;

  return {
    marker: cleanMarker(marker),
    title,
    level,
    leadingText: '',
    separatorText: '\t',
  };
}

function isLikelyHeadingMarker(value: string): boolean {
  return /^\d+(?:\.\d+)*\.?$/.test(value.trim());
}

function cleanMarker(value: string): string {
  return value.trim().replace(/\.$/, '');
}

function normalizeHeadingText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
