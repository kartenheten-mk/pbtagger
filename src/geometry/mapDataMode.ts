import type { Geometry, Tag } from '../types';

export type MapMainMode = 'json' | 'gml';
export type GeometryTagStatusFilter = 'all' | 'tagged' | 'untagged';

export interface GeometryTagStatusCounts {
  all: number;
  tagged: number;
  untagged: number;
}

export function resolveActiveMapMainMode(
  requestedMode: MapMainMode,
  isLinking: boolean
): MapMainMode {
  return isLinking ? 'json' : requestedMode;
}

export function selectVisibleGeometries(
  activeMainMode: MapMainMode,
  jsonGeometries: Geometry[],
  importedDocxGeometries: Geometry[]
): Geometry[] {
  if (activeMainMode === 'json') return jsonGeometries;
  return importedDocxGeometries;
}

function buildLinkedGeometryIdSet(
  displayLinkedGeometryIdsByTagUuid: Map<string, Set<string>>
): Set<string> {
  const linkedGeometryIds = new Set<string>();

  for (const geometryIds of displayLinkedGeometryIdsByTagUuid.values()) {
    for (const geometryId of geometryIds) {
      linkedGeometryIds.add(geometryId);
    }
  }

  return linkedGeometryIds;
}

export function countGeometriesByTagStatus(
  geometries: Geometry[],
  displayLinkedGeometryIdsByTagUuid: Map<string, Set<string>>
): GeometryTagStatusCounts {
  const linkedGeometryIds = buildLinkedGeometryIdSet(displayLinkedGeometryIdsByTagUuid);
  const tagged = geometries.filter((geometry) => linkedGeometryIds.has(geometry.uuid)).length;

  return {
    all: geometries.length,
    tagged,
    untagged: geometries.length - tagged,
  };
}

export function filterGeometriesByTagStatus(
  geometries: Geometry[],
  displayLinkedGeometryIdsByTagUuid: Map<string, Set<string>>,
  tagStatusFilter: GeometryTagStatusFilter
): Geometry[] {
  if (tagStatusFilter === 'all') return geometries;

  const linkedGeometryIds = buildLinkedGeometryIdSet(displayLinkedGeometryIdsByTagUuid);
  return geometries.filter((geometry) => {
    const isTagged = linkedGeometryIds.has(geometry.uuid);
    return tagStatusFilter === 'tagged' ? isTagged : !isTagged;
  });
}

interface BuildHighlightedGeometryUuidsArgs {
  isLinking: boolean;
  manualFocusedGeometryUuid: string | null;
  selectedTagUuid: string | null;
  displayLinkedGeometryIdsByTagUuid: Map<string, Set<string>>;
  visibleGeometries: Geometry[];
}

export function buildHighlightedGeometryUuids(
  args: BuildHighlightedGeometryUuidsArgs
): string[] {
  const {
    isLinking,
    manualFocusedGeometryUuid,
    selectedTagUuid,
    displayLinkedGeometryIdsByTagUuid,
    visibleGeometries,
  } = args;

  if (isLinking) return [];

  const visibleIds = new Set(visibleGeometries.map((geometry) => geometry.uuid));

  if (manualFocusedGeometryUuid && visibleIds.has(manualFocusedGeometryUuid)) {
    return [manualFocusedGeometryUuid];
  }

  if (!selectedTagUuid) return [];

  const linkedGeometryIds = displayLinkedGeometryIdsByTagUuid.get(selectedTagUuid);
  if (!linkedGeometryIds || linkedGeometryIds.size === 0) return [];

  return visibleGeometries
    .map((geometry) => geometry.uuid)
    .filter((uuid) => linkedGeometryIds.has(uuid));
}

interface ResolveFocusedGeometryArgs {
  selectedTagUuid: string | null;
  displayLinkedGeometryIdsByTagUuid: Map<string, Set<string>>;
  visibleGeometries: Geometry[];
  previousFocusedGeometryUuid: string | null;
  /**
   * When true, keep the previous focused geometry if it is visible,
   * even if it is not linked to the selected tag.
   */
  allowVisiblePreviousFocus?: boolean;
}

/**
 * Choose which geometry to focus when a tag is selected.
 * - Keep previous focused geometry if it is still linked+visible
 * - Otherwise pick the first linked geometry in current visible order
 * - Return null if no linked visible geometry exists
 */
export function resolveFocusedGeometryForSelectedTag(
  args: ResolveFocusedGeometryArgs
): string | null {
  const {
    selectedTagUuid,
    displayLinkedGeometryIdsByTagUuid,
    visibleGeometries,
    previousFocusedGeometryUuid,
    allowVisiblePreviousFocus = false,
  } = args;
  if (!selectedTagUuid) return null;

  const linkedForTag = displayLinkedGeometryIdsByTagUuid.get(selectedTagUuid) ?? new Set<string>();
  const visibleIds = new Set(visibleGeometries.map((g) => g.uuid));

  if (linkedForTag.size === 0) {
    if (
      allowVisiblePreviousFocus &&
      previousFocusedGeometryUuid &&
      visibleIds.has(previousFocusedGeometryUuid)
    ) {
      return previousFocusedGeometryUuid;
    }
    return null;
  }

  if (previousFocusedGeometryUuid && visibleIds.has(previousFocusedGeometryUuid)) {
    if (allowVisiblePreviousFocus || linkedForTag.has(previousFocusedGeometryUuid)) {
      return previousFocusedGeometryUuid;
    }
  }

  for (const geo of visibleGeometries) {
    if (linkedForTag.has(geo.uuid)) {
      return geo.uuid;
    }
  }

  return null;
}

interface BuildDisplayLinksArgs {
  tags: Tag[];
  activeMainMode: MapMainMode;
  jsonGeometryIdSet: Set<string>;
  importedDocxGeometryIdSet: Set<string>;
  importedDocxLinkedGeometryIdsByTagUuid: Map<string, Set<string>>;
}

/**
 * Returns geometry IDs to treat as linked for UI display in the active mode.
 * - JSON mode: explicit JSON links only
 * - GML mode: explicit DOCX links OR mirrored DOCX links derived
 *   from matching JSON-linked tags when the imported DOCX contains the same
 *   logical GML tag
 */
export function buildDisplayLinkedGeometryIdsByTagUuidForMode(
  args: BuildDisplayLinksArgs
): Map<string, Set<string>> {
  const {
    tags,
    activeMainMode,
    jsonGeometryIdSet,
    importedDocxGeometryIdSet,
    importedDocxLinkedGeometryIdsByTagUuid,
  } = args;

  const result = new Map<string, Set<string>>();
  for (const tag of tags) {
    if (activeMainMode === 'json') {
      const jsonLinks = (tag.geometryIds ?? []).filter((id) => jsonGeometryIdSet.has(id));
      result.set(tag.uuid, new Set(jsonLinks));
      continue;
    }

    const importedLinks =
      importedDocxLinkedGeometryIdsByTagUuid.get(tag.uuid) ??
      new Set(
        (tag.geometryIds ?? []).filter((id) => importedDocxGeometryIdSet.has(id))
      );
    result.set(tag.uuid, new Set(importedLinks));
  }

  return result;
}

/**
 * Returns geometry IDs to use for tag-driven focus behavior in the active mode.
 * - JSON mode: explicit JSON links only
 * - GML mode: explicit or mirrored imported DOCX links
 */
export function buildFocusLinkedGeometryIdsByTagUuidForMode(
  args: BuildDisplayLinksArgs
): Map<string, Set<string>> {
  return buildDisplayLinkedGeometryIdsByTagUuidForMode(args);
}
