import type { Geometry, Tag } from '../types';
import { inferGeometrySource, normalizeGeometrySource } from '../geometry/geometrySource';

export interface ReplaceDocxGmlResult {
  geometries: Geometry[];
  tags: Tag[];
}

/**
 * Replace all existing DOCX-GML geometries with a fresh set and strip stale
 * GML references from tag.geometryIds.
 */
export function replaceDocxGmlGeometriesInState(
  allGeometries: Geometry[],
  tags: Tag[],
  nextDocxGmlGeometries: Geometry[]
): ReplaceDocxGmlResult {
  const oldDocxIds = new Set(
    allGeometries
      .filter((g) => inferGeometrySource(g) === 'docx_gml')
      .map((g) => g.uuid)
  );

  const normalizedIncoming = nextDocxGmlGeometries.map((g) => ({
    ...normalizeGeometrySource(g),
    source: 'docx_gml' as const,
  }));
  const incomingIdSet = new Set(normalizedIncoming.map((g) => g.uuid));

  const keptGeometries = allGeometries.filter(
    (g) => inferGeometrySource(g) !== 'docx_gml'
  );

  const cleanedTags = tags.map((tag) => {
    if (!tag.geometryIds || tag.geometryIds.length === 0) return tag;
    const remaining = tag.geometryIds.filter(
      (id) => !oldDocxIds.has(id) || incomingIdSet.has(id)
    );
    return {
      ...tag,
      geometryIds: remaining.length > 0 ? remaining : undefined,
    };
  });

  return {
    geometries: [...keptGeometries, ...normalizedIncoming],
    tags: cleanedTags,
  };
}
