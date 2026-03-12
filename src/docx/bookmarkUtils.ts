import type { Tag, Tema } from '../types';
import { NS } from './XmlHelpers';
import rawCategories from '../data/categories.json';
import { flattenCategories, getCategoryLabel } from '../data/categoryUtils';

const _allCategories = flattenCategories(
  (rawCategories as unknown as { teman: Tema[] }).teman
);
const CATEGORY_MAP = new Map(_allCategories.map((c) => [c.id, c]));

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const HASH_TO_CATEGORY = new Map(_allCategories.map((c) => [hashString(c.id), c.id]));

/**
 * Scan the document for the highest existing <w:bookmarkStart w:id="..."/>
 * so our new bookmarks start above it and never collide.
 */
export function findMaxBookmarkId(docDom: Document): number {
  let maxId = 0;
  const starts = docDom.getElementsByTagNameNS(NS.w, 'bookmarkStart');
  for (let i = 0; i < starts.length; i++) {
    const el = starts[i] as Element;
    const raw =
      el.getAttributeNS(NS.w, 'id') ?? el.getAttribute('w:id') ?? '';
    const id = parseInt(raw, 10);
    if (!isNaN(id) && id > maxId) maxId = id;
  }
  return maxId;
}

/**
 * Generate a valid Word bookmark name for a tag.
 *
 * Word bookmark name rules:
 *   - Must start with a letter
 *   - May contain letters, digits and underscores only
 *   - Maximum 40 characters
 *
 * We derive a human-readable base from the category label and append
 * the first 8 hex chars of the UUID to guarantee uniqueness.
 */
export function generateBookmarkName(tag: Tag): string {
  const cat = CATEGORY_MAP.get(tag.categoryId);
  let base = cat ? getCategoryLabel(cat) : tag.categoryId;

  // Transliterate common Swedish / accented characters
  base = base
    .replace(/[åÅ]/g, 'a')
    .replace(/[äÄæÆ]/g, 'a')
    .replace(/[öÖøØ]/g, 'o')
    .replace(/[éèêëÉÈÊË]/g, 'e')
    .replace(/[úùûüÚÙÛÜ]/g, 'u')
    .replace(/[íìîïÍÌÎÏ]/g, 'i')
    .replace(/[›»]/g, '_') // breadcrumb separators → underscore
    .replace(/[^a-zA-Z0-9\\s_]/g, '') // strip anything else
    .replace(/\s+/g, '_') // spaces → underscores
    .replace(/_{2,}/g, '_') // collapse repeated underscores
    .replace(/^_+|_+$/g, ''); // trim leading/trailing underscores

  // Ensure it starts with a letter
  if (!base || !/^[a-zA-Z]/.test(base)) {
    base = 'Tag_' + base;
  }

  const catHash = hashString(tag.categoryId);

  // Short suffix from UUID (first 8 hex chars, no dashes)
  const shortId = tag.uuid.replace(/-/g, '').slice(0, 8);

  // Truncate base so total length ≤ 40 (base + '_' + 8-char hash + '_' + 8-char suffix)
  const maxBase = 40 - 1 - catHash.length - 1 - shortId.length;
  base = base.slice(0, maxBase);

  return `${base}_${catHash}_${shortId}`;
}

/**
 * Parse a tag suffix (first 8 chars of UUID) from a bookmark name.
 */
export function getBookmarkSuffix(bookmarkName: string): string | null {
  const match = bookmarkName.match(/_([0-9a-f]{8})$/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Attempt to reverse-engineer a category ID from a bookmark name prefix.
 * This is a heuristic, as the prefix is a transliterated and truncated label.
 * Returns the matched categoryId or a fallback.
 */
export function guessCategoryIdFromBookmarkName(bookmarkName: string): string | null {
  // First check the new format: _<catHash>_<shortId>
  const hashMatch = bookmarkName.match(/_([0-9a-fA-F]{8})_[0-9a-fA-F]{8}$/i);
  if (hashMatch) {
    const catHash = hashMatch[1].toLowerCase();
    const exactMatch = HASH_TO_CATEGORY.get(catHash);
    if (exactMatch) {
      return exactMatch;
    }
  }

  // Fallback to legacy format: <prefix>_<shortId>
  const match = bookmarkName.match(/^(.*)_[0-9a-fA-F]{8}$/);
  if (!match) return null;
  const prefix = match[1].toLowerCase();

  // Sort categories by label length descending to match longest possible string
  const sortedCategories = Array.from(CATEGORY_MAP.values()).sort((a, b) => {
    const aLabel = getCategoryLabel(a).toLowerCase();
    const bLabel = getCategoryLabel(b).toLowerCase();
    return bLabel.length - aLabel.length;
  });

  for (const cat of sortedCategories) {
    const label = getCategoryLabel(cat);
    // Mimic the generation logic
    let base = label
      .replace(/[åÅ]/g, 'a')
      .replace(/[äÄæÆ]/g, 'a')
      .replace(/[öÖøØ]/g, 'o')
      .replace(/[éèêëÉÈÊË]/g, 'e')
      .replace(/[úùûüÚÙÛÜ]/g, 'u')
      .replace(/[íìîïÍÌÎÏ]/g, 'i')
      .replace(/[›»]/g, '_')
      .replace(/[^a-zA-Z0-9\\s_]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!base || !/^[a-zA-Z]/.test(base)) {
      base = 'Tag_' + base;
    }

    base = base.toLowerCase();

    // Since the base was truncated in generation (to fit 40 chars total with suffix),
    // we should check if the prefix starts with the truncated base.
    // The suffix is 9 chars (including underscore), so max base length was 31.
    const maxBase = 40 - 1 - 8;
    const truncatedBase = base.slice(0, maxBase);

    if (prefix === truncatedBase) {
      return cat.id;
    }
  }

  // Fallback: If no exact match found due to truncation, find the best partial match
  for (const cat of sortedCategories) {
      const label = getCategoryLabel(cat);
      const base = label
        .replace(/[åÅ]/g, 'a')
        .replace(/[äÄæÆ]/g, 'a')
        .replace(/[öÖøØ]/g, 'o')
        .replace(/[éèêëÉÈÊË]/g, 'e')
        .replace(/[úùûüÚÙÛÜ]/g, 'u')
        .replace(/[íìîïÍÌÎÏ]/g, 'i')
        .replace(/[›»]/g, '_')
        .replace(/[^a-zA-Z0-9\\s_]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();

      const maxBase = 40 - 1 - 8;
      const truncatedBase = base.slice(0, maxBase);

      if (truncatedBase.startsWith(prefix) || prefix.startsWith(truncatedBase)) {
          return cat.id;
      }
  }

  return null;
}
