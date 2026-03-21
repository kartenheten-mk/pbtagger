import type { Geometry, PlanbeskrivningConfig, Tag } from '../types';
import { generateBookmarkName } from '../docx/bookmarkUtils';
import { buildPlanbeskrivningXml } from '../docx/PlanbeskrivningXmlBuilder';
import { parsePlanbeskrivningXmlText } from '../docx/PlanbeskrivningXmlParser';

export interface GmlExportPreviewResult {
  geometries: Geometry[];
  linkedGeometryIdsByTagUuid: Map<string, Set<string>>;
}

function buildStablePreviewGeometryIds(
  geometries: Geometry[]
): { geometries: Geometry[]; uuidMap: Map<string, string> } {
  const identitetCounts = new Map<string, number>();
  const uuidMap = new Map<string, string>();

  const stabilized = geometries.map((geo) => {
    const identitet = String(geo.properties?.['identitet'] ?? geo.name ?? geo.uuid);
    const count = (identitetCounts.get(identitet) ?? 0) + 1;
    identitetCounts.set(identitet, count);
    const stableUuid = `preview_gml_${identitet}_${count}`;
    uuidMap.set(geo.uuid, stableUuid);
    return { ...geo, uuid: stableUuid };
  });

  return { geometries: stabilized, uuidMap };
}

function emptyPreview(): GmlExportPreviewResult {
  return {
    geometries: [],
    linkedGeometryIdsByTagUuid: new Map<string, Set<string>>(),
  };
}

/**
 * Build a live GML preview by running the same builder/parser pipeline as export.
 * This guarantees that the UI preview mirrors actual DOCX custom XML output.
 */
export function buildGmlExportPreview(
  config: PlanbeskrivningConfig,
  tags: Tag[],
  jsonGeometries: Geometry[]
): GmlExportPreviewResult {
  try {
    const xml = buildPlanbeskrivningXml(config, tags, jsonGeometries);
    const parsed = parsePlanbeskrivningXmlText(xml);
    if (!parsed) return emptyPreview();
    const { geometries: stablePreviewGeometries, uuidMap } = buildStablePreviewGeometryIds(
      parsed.geometries
    );

    const linkedGeometryIdsByTagUuid = new Map<string, Set<string>>();
    for (const tag of tags) {
      const identitet = generateBookmarkName(tag);
      const previewIds = parsed.identitetToGeometryUuid.get(identitet) ?? [];
      const stablePreviewIds = previewIds
        .map((id) => uuidMap.get(id))
        .filter((id): id is string => !!id);
      linkedGeometryIdsByTagUuid.set(tag.uuid, new Set(stablePreviewIds));
    }

    return {
      geometries: stablePreviewGeometries,
      linkedGeometryIdsByTagUuid,
    };
  } catch (error) {
    console.warn('[gmlExportPreview] Failed to build preview from current links:', error);
    return emptyPreview();
  }
}
