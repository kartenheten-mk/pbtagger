import type { Geometry, Tag } from '../types';

export type MapMainMode = 'json' | 'gml';
export type GmlViewMode = 'preview' | 'imported_docx';

export function resolveActiveMapMainMode(
  requestedMode: MapMainMode,
  isLinking: boolean
): MapMainMode {
  return isLinking ? 'json' : requestedMode;
}

export function selectVisibleGeometries(
  activeMainMode: MapMainMode,
  gmlViewMode: GmlViewMode,
  jsonGeometries: Geometry[],
  previewGeometries: Geometry[],
  importedDocxGeometries: Geometry[]
): Geometry[] {
  if (activeMainMode === 'json') return jsonGeometries;
  return gmlViewMode === 'preview' ? previewGeometries : importedDocxGeometries;
}

export function buildInspectionSelectedGeometryUuids(
  isLinking: boolean,
  focusedGeometryUuid: string | null
): string[] {
  if (isLinking || !focusedGeometryUuid) return [];
  return [focusedGeometryUuid];
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

  if (previousFocusedGeometryUuid && visibleIds.has(previousFocusedGeometryUuid)) {
    if (allowVisiblePreviousFocus) {
      return previousFocusedGeometryUuid;
    }
  }

  if (linkedForTag.size === 0) return null;

  if (previousFocusedGeometryUuid && visibleIds.has(previousFocusedGeometryUuid)) {
    if (linkedForTag.has(previousFocusedGeometryUuid)) {
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
  gmlViewMode: GmlViewMode;
  jsonGeometryIdSet: Set<string>;
  importedDocxGeometryIdSet: Set<string>;
  previewLinkedGeometryIdsByTagUuid: Map<string, Set<string>>;
}

/**
 * Returns geometry IDs to treat as linked for UI display in the active mode.
 * - JSON mode: explicit JSON links only
 * - GML preview mode: derived preview links only
 * - Imported DOCX mode: explicit links to imported DOCX geometries only
 */
export function buildDisplayLinkedGeometryIdsByTagUuidForMode(
  args: BuildDisplayLinksArgs
): Map<string, Set<string>> {
  const {
    tags,
    activeMainMode,
    gmlViewMode,
    jsonGeometryIdSet,
    importedDocxGeometryIdSet,
    previewLinkedGeometryIdsByTagUuid,
  } = args;

  const result = new Map<string, Set<string>>();
  for (const tag of tags) {
    if (activeMainMode === 'json') {
      const jsonLinks = (tag.geometryIds ?? []).filter((id) => jsonGeometryIdSet.has(id));
      result.set(tag.uuid, new Set(jsonLinks));
      continue;
    }

    if (gmlViewMode === 'preview') {
      result.set(
        tag.uuid,
        new Set(previewLinkedGeometryIdsByTagUuid.get(tag.uuid) ?? [])
      );
      continue;
    }

    const importedLinks = (tag.geometryIds ?? []).filter((id) =>
      importedDocxGeometryIdSet.has(id)
    );
    result.set(tag.uuid, new Set(importedLinks));
  }

  return result;
}
