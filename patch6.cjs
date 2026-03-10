const fs = require('fs');
let code = fs.readFileSync('src/docx/bookmarkUtils.ts', 'utf8');

code += `
/**
 * Attempt to reverse-engineer a category ID from a bookmark name prefix.
 * This is a heuristic, as the prefix is a transliterated and truncated label.
 * Returns the matched categoryId or a fallback.
 */
export function guessCategoryIdFromBookmarkName(bookmarkName: string): string | null {
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
      .replace(/[^a-zA-Z0-9\s_]/g, '')
      .replace(/\\s+/g, '_')
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
      let base = label
        .replace(/[åÅ]/g, 'a')
        .replace(/[äÄæÆ]/g, 'a')
        .replace(/[öÖøØ]/g, 'o')
        .replace(/[éèêëÉÈÊË]/g, 'e')
        .replace(/[úùûüÚÙÛÜ]/g, 'u')
        .replace(/[íìîïÍÌÎÏ]/g, 'i')
        .replace(/[›»]/g, '_')
        .replace(/[^a-zA-Z0-9\s_]/g, '')
        .replace(/\\s+/g, '_')
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
`;

fs.writeFileSync('src/docx/bookmarkUtils.ts', code);
