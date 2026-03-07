import type { Tag, Tema } from '../types';
import { NS } from './XmlHelpers';
import rawCategories from '../data/categories.json';
import { flattenCategories, getCategoryLabel } from '../data/categoryUtils';

const _allCategories = flattenCategories(
  (rawCategories as unknown as { teman: Tema[] }).teman
);
const CATEGORY_MAP = new Map(_allCategories.map((c) => [c.id, c]));

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
    .replace(/[^a-zA-Z0-9\s_]/g, '') // strip anything else
    .replace(/\s+/g, '_') // spaces → underscores
    .replace(/_{2,}/g, '_') // collapse repeated underscores
    .replace(/^_+|_+$/g, ''); // trim leading/trailing underscores

  // Ensure it starts with a letter
  if (!base || !/^[a-zA-Z]/.test(base)) {
    base = 'Tag_' + base;
  }

  // Short suffix from UUID (first 8 hex chars, no dashes)
  const shortId = tag.uuid.replace(/-/g, '').slice(0, 8);

  // Truncate base so total length ≤ 40 (base + '_' + 8-char suffix)
  const maxBase = 40 - 1 - shortId.length;
  base = base.slice(0, maxBase);

  return `${base}_${shortId}`;
}
