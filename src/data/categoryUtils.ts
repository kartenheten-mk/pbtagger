/**
 * categoryUtils.ts
 *
 * Utilities for working with the hierarchical category data
 * (Tema → Grupp → Undergrupp) stored in categories.json.
 *
 * The main export is `flattenCategories`, which converts the
 * hierarchy into a flat Category[] array. Each selectable group and
 * undergrupp becomes one Category, keeping Tag.categoryId as a plain string id.
 *
 * Selectable id rules:
 *  - Grupp → id = "<temaId>--<gruppId>"
 *  - Undergrupp → id = "<temaId>--<gruppId>--<undergruppId>"
 */

import type { Category, CategoryConfig, Tema } from '../types';

const FALLBACK_CATEGORY_ID = 'kategori';

function cloneTeman(teman: Tema[]): Tema[] {
  return teman.map((tema) => ({
    ...tema,
    grupper: tema.grupper.map((grupp) => ({
      ...grupp,
      undergrupper: grupp.undergrupper.map((undergrupp) => ({ ...undergrupp })),
    })),
  }));
}

function findGrupp(teman: Tema[], temaId: string, gruppId: string) {
  const tema = teman.find((item) => item.id === temaId);
  const grupp = tema?.grupper.find((item) => item.id === gruppId);
  return { tema, grupp };
}

export function slugifyCategoryId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return slug || FALLBACK_CATEGORY_ID;
}

export function createUniqueCategoryId(name: string, existingIds: Iterable<string>): string {
  const existing = new Set(existingIds);
  const baseId = slugifyCategoryId(name);
  if (!existing.has(baseId)) return baseId;

  let suffix = 2;
  let candidate = `${baseId}-${suffix}`;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-${suffix}`;
  }
  return candidate;
}

export function createUniqueGroupId(teman: Tema[], temaId: string, name: string): string | null {
  const tema = teman.find((item) => item.id === temaId);
  if (!tema) return null;
  return createUniqueCategoryId(
    name,
    tema.grupper.map((grupp) => grupp.id)
  );
}

export function createUniqueUndergroupId(
  teman: Tema[],
  temaId: string,
  gruppId: string,
  name: string
): string | null {
  const { grupp } = findGrupp(teman, temaId, gruppId);
  if (!grupp) return null;
  return createUniqueCategoryId(
    name,
    grupp.undergrupper.map((undergrupp) => undergrupp.id)
  );
}

export function mergeCustomCategories(teman: Tema[], config?: CategoryConfig): Tema[] {
  const merged = cloneTeman(teman);
  const categoryConfig = config ?? { customGroups: [], customUndergroups: [] };

  for (const customGroup of categoryConfig.customGroups) {
    const tema = merged.find((item) => item.id === customGroup.temaId);
    if (!tema || tema.grupper.some((grupp) => grupp.id === customGroup.id)) continue;

    tema.grupper.push({
      id: customGroup.id,
      name: customGroup.name,
      custom: true,
      undergrupper: customGroup.undergrupper.map((undergrupp) => ({
        id: undergrupp.id,
        name: undergrupp.name,
        custom: true,
      })),
    });
  }

  for (const customUndergroup of categoryConfig.customUndergroups) {
    const { grupp } = findGrupp(
      merged,
      customUndergroup.temaId,
      customUndergroup.gruppId
    );
    if (!grupp) continue;
    if (grupp.undergrupper.some((undergrupp) => undergrupp.id === customUndergroup.id)) {
      continue;
    }

    grupp.undergrupper.push({
      id: customUndergroup.id,
      name: customUndergroup.name,
      custom: true,
    });
  }

  return merged;
}

export function flattenCategories(teman: Tema[]): Category[] {
  const categories: Category[] = [];

  for (const tema of teman) {
    for (const grupp of tema.grupper) {
      categories.push({
        id: `${tema.id}--${grupp.id}`,
        name: grupp.name,
        level: 'grupp',
        color: tema.color,
        temaId: tema.id,
        temaName: tema.name,
        gruppId: grupp.id,
        gruppName: grupp.name,
        custom: grupp.custom,
      });

      for (const ug of grupp.undergrupper) {
        categories.push({
          id: `${tema.id}--${grupp.id}--${ug.id}`,
          name: ug.name,
          level: 'undergrupp',
          color: tema.color,
          temaId: tema.id,
          temaName: tema.name,
          gruppId: grupp.id,
          gruppName: grupp.name,
          undergruppId: ug.id,
          undergruppName: ug.name,
          custom: ug.custom,
        });
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
