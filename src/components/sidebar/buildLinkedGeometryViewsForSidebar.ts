import type { Geometry, Tag } from '../../types';
import type { LinkedGeometryView } from './TagListItem';

interface BuildLinkedGeometryViewsArgs {
  tag: Tag;
  geometryByUuid: Map<string, Geometry>;
  jsonGeometryIdSet: Set<string>;
  docxGmlGeometryIdSet: Set<string>;
  mirroredDocxGeometryIds: Set<string>;
}

export function buildLinkedGeometryViewsForSidebar({
  tag,
  geometryByUuid,
  jsonGeometryIdSet,
  docxGmlGeometryIdSet,
  mirroredDocxGeometryIds,
}: BuildLinkedGeometryViewsArgs): LinkedGeometryView[] {
  const explicitGeometryIds = tag.geometryIds ?? [];

  const buildViews = (ids: string[], canUnlink: boolean): LinkedGeometryView[] => {
    const seen = new Set<string>();
    const views: LinkedGeometryView[] = [];

    for (const id of ids) {
      if (seen.has(id)) continue;
      const geometry = geometryByUuid.get(id);
      if (!geometry) continue;

      seen.add(id);
      views.push({ geometry, canUnlink });
    }

    return views;
  };

  const explicitJsonGeometryIds = explicitGeometryIds.filter((id) =>
    jsonGeometryIdSet.has(id)
  );
  if (explicitJsonGeometryIds.length > 0) {
    return buildViews(explicitJsonGeometryIds, true);
  }

  const explicitLoadedGeometryViews = buildViews(explicitGeometryIds, true);
  if (explicitLoadedGeometryViews.length > 0) {
    return explicitLoadedGeometryViews;
  }

  const mirroredDocxIds = Array.from(mirroredDocxGeometryIds).filter((id) =>
    docxGmlGeometryIdSet.has(id)
  );
  return buildViews(mirroredDocxIds, false);
}