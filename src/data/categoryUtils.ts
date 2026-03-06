/**
 * categoryUtils.ts
 *
 * Utilities for working with the hierarchical category data
 * (Tema → Grupp → Undergrupp) stored in categories.json.
 *
 * The main export is `flattenCategories`, which converts the
 * hierarchy into a flat Category[] array. Each leaf in the tree
 * becomes one Category, keeping Tag.categoryId as a plain string id.
 *
 * Leaf rules:
 *  - If a Grupp has NO Undergrupper → the Grupp is the leaf
 *    (id = "<temaId>--<gruppId>")
 *  - If a Grupp HAS Undergrupper → each Undergrupp is a leaf
 *    (id = "<temaId>--<gruppId>--<undergruppId>")
 */

import type { Category, Tema } from '../types';

export function flattenCategories(teman: Tema[]): Category[] {
  const categories: Category[] = [];

  for (const tema of teman) {
    for (const grupp of tema.grupper) {
      if (grupp.undergrupper.length === 0) {
        // Grupp itself is the leaf
        categories.push({
          id: `${tema.id}--${grupp.id}`,
          name: grupp.name,
          color: tema.color,
          temaId: tema.id,
          temaName: tema.name,
          gruppId: grupp.id,
          gruppName: grupp.name,
        });
      } else {
        // Each undergrupp is a leaf
        for (const ug of grupp.undergrupper) {
          categories.push({
            id: `${tema.id}--${grupp.id}--${ug.id}`,
            name: ug.name,
            color: tema.color,
            temaId: tema.id,
            temaName: tema.name,
            gruppId: grupp.id,
            gruppName: grupp.name,
            undergruppName: ug.name,
          });
        }
      }
    }
  }

  return categories;
}

/**
 * Returns a human-readable breadcrumb label for a category.
 * Example: "Genomförandefrågor › Ekonomiska frågor › Planavgift"
 */
export function getCategoryLabel(cat: Category): string {
  const parts = [cat.temaName, cat.gruppName];
  if (cat.undergruppName && cat.undergruppName !== cat.gruppName) {
    parts.push(cat.undergruppName);
  }
  // Deduplicate adjacent identical parts (e.g. when grupp has no undergrupp)
  const unique = parts.filter((p, i) => i === 0 || p !== parts[i - 1]);
  return unique.join(' › ');
}
