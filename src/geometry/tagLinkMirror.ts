import type { Geometry, Tag } from '../types';
import { generateBookmarkName } from '../docx/bookmarkUtils';

export function getBaseIdentitet(identitet: string): string {
  return identitet.replace(/_g\d+$/i, '');
}

function getUuidSuffix(tagUuid: string): string {
  return tagUuid.replace(/-/g, '').slice(0, 8).toLowerCase();
}

function matchesTagIdentitet(
  tagBaseIdentitet: string,
  tagUuidSuffix: string,
  geometryIdentitet: string
): boolean {
  const ident = geometryIdentitet.toLowerCase();
  const base = tagBaseIdentitet.toLowerCase();
  if (ident === base) return true;

  const stripped = getBaseIdentitet(ident);
  // Handles truncated _g2/_g3 forms where stripped identitet is a prefix
  // of the full base identitet (same approach as parser grouping).
  if (ident !== stripped && (base.startsWith(stripped) || stripped.startsWith(base))) {
    return true;
  }

  // Fallback: match by UUID short suffix token even if category/hash changed.
  const tokens = stripped.split('_').filter(Boolean);
  const lastToken = tokens[tokens.length - 1] ?? '';
  if (lastToken && (tagUuidSuffix.startsWith(lastToken) || lastToken.startsWith(tagUuidSuffix))) {
    return true;
  }

  return false;
}

/**
 * Build display-time link sets per tag, mirroring JSON links onto
 * matching DOCX-GML geometries for user feedback in GML view.
 * Stale external IDs from an embedded tag payload count too, which lets a
 * DOCX-only import navigate its own GML even before the matching JSON is loaded.
 */
export function buildMirroredDisplayLinks(
  tags: Tag[],
  jsonGeometryIdSet: Set<string>,
  docxGmlGeometries: Geometry[]
): Map<string, Set<string>> {
  const docxGmlGeometryIdSet = new Set(docxGmlGeometries.map((geo) => geo.uuid));
  const gmlGeometriesWithIdentitet = docxGmlGeometries
    .map((geo) => ({
      uuid: geo.uuid,
      identitet:
        typeof geo.properties?.['identitet'] === 'string'
          ? (geo.properties['identitet'] as string)
          : '',
    }))
    .filter((g) => g.identitet.length > 0);

  const result = new Map<string, Set<string>>();
  for (const tag of tags) {
    const tagGeometryIds = tag.geometryIds ?? [];
    const linked = new Set(tagGeometryIds);
    const hasJsonLink = tagGeometryIds.some((id) => jsonGeometryIdSet.has(id));
    const hasExternalLink = tagGeometryIds.some((id) => !docxGmlGeometryIdSet.has(id));
    if (hasJsonLink || hasExternalLink) {
      const baseIdentitet = generateBookmarkName(tag);
      const uuidSuffix = getUuidSuffix(tag.uuid);
      for (const geo of gmlGeometriesWithIdentitet) {
        if (matchesTagIdentitet(baseIdentitet, uuidSuffix, geo.identitet)) {
          linked.add(geo.uuid);
        }
      }
    }
    result.set(tag.uuid, linked);
  }

  return result;
}
