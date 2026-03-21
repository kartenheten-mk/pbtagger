import type { Geometry, PlanbeskrivningConfig, Tag } from '../types';
import { generateBookmarkName } from '../docx/bookmarkUtils';
import { buildPlanbeskrivningXml } from '../docx/PlanbeskrivningXmlBuilder';
import { parsePlanbeskrivningXmlText } from '../docx/PlanbeskrivningXmlParser';

export interface GmlExportPreviewResult {
  geometries: Geometry[];
  linkedGeometryIdsByTagUuid: Map<string, Set<string>>;
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

    const linkedGeometryIdsByTagUuid = new Map<string, Set<string>>();
    for (const tag of tags) {
      const identitet = generateBookmarkName(tag);
      const previewIds = parsed.identitetToGeometryUuid.get(identitet) ?? [];
      linkedGeometryIdsByTagUuid.set(tag.uuid, new Set(previewIds));
    }

    return {
      geometries: parsed.geometries,
      linkedGeometryIdsByTagUuid,
    };
  } catch (error) {
    console.warn('[gmlExportPreview] Failed to build preview from current links:', error);
    return emptyPreview();
  }
}
