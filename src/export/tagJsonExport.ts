import type { Category, Geometry, Tag, TagTargetType } from '../types';
import { geometriesToGeoJson } from '../geometry/geoJsonConverter';

type GeoJsonGeometry = NonNullable<
  ReturnType<typeof geometriesToGeoJson>['features'][number]['geometry']
>;

export interface BuildTagJsonExportArgs {
  tags: Tag[];
  geometries: Geometry[];
  categories?: Category[];
  fileName?: string;
  activeGeometryDocId?: string | null;
  exportedAt?: string;
}

export interface ExportCategory {
  categoryId: string;
  level: Category['level'];
  temaId: string;
  temaName: string;
  gruppId: string;
  gruppName: string;
  undergruppId: string | null;
  undergruppName: string | null;
  custom: boolean;
}

export interface ExportCategorySummary extends ExportCategory {
  tagCount: number;
}

export interface TagJsonExport {
  schemaVersion: 1;
  exportedAt: string;
  sourceDocument: {
    fileName: string;
    activeGeometryDocId: string | null;
  };
  summary: {
    tagCount: number;
    linkedGeometryCount: number;
    categories: ExportCategorySummary[];
    unknownCategoryIds: string[];
  };
  tags: Array<{
    uuid: string;
    targetType: TagTargetType;
    text: string;
    note: string | null;
    createdAt: string;
    paragraphIndex: number;
    startOffset: number;
    endParagraphIndex: number;
    endOffset: number;
    runId: string | null;
    tableId: string | null;
    categoryId: string;
    categoryLevel: Category['level'] | null;
    temaId: string | null;
    temaName: string | null;
    gruppId: string | null;
    gruppName: string | null;
    undergruppId: string | null;
    undergruppName: string | null;
    customCategory: boolean | null;
    geometryIds: string[];
    missingGeometryIds: string[];
    geometries: GeoJsonGeometry[];
  }>;
}

function categoryToExport(category: Category): ExportCategory {
  return {
    categoryId: category.id,
    level: category.level,
    temaId: category.temaId,
    temaName: category.temaName,
    gruppId: category.gruppId,
    gruppName: category.gruppName,
    undergruppId: category.undergruppId ?? null,
    undergruppName: category.undergruppName ?? null,
    custom: category.custom ?? false,
  };
}

function uniquePreservingOrder(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values ?? []) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

function geometryToGeoJsonGeometry(geometry: Geometry): GeoJsonGeometry {
  const geojson = geometriesToGeoJson([geometry]).features[0];
  if (!geojson?.geometry) {
    throw new Error(`Kunde inte skapa GeoJSON för geometri "${geometry.uuid}".`);
  }

  return geojson.geometry;
}

export function buildTagJsonExport({
  tags,
  geometries,
  categories = [],
  fileName = '',
  activeGeometryDocId = null,
  exportedAt = new Date().toISOString(),
}: BuildTagJsonExportArgs): TagJsonExport {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const geometryById = new Map(geometries.map((geometry) => [geometry.uuid, geometry]));
  const categorySummaryById = new Map<string, ExportCategorySummary>();
  const unknownCategoryIds: string[] = [];
  const unknownCategorySet = new Set<string>();
  const linkedGeometryIds = new Set<string>();

  const exportedTags = tags.map((tag) => {
    const category = categoryById.get(tag.categoryId);
    const exportedCategory = category ? categoryToExport(category) : null;

    if (exportedCategory) {
      const existing = categorySummaryById.get(tag.categoryId);
      if (existing) {
        existing.tagCount += 1;
      } else {
        categorySummaryById.set(tag.categoryId, {
          ...exportedCategory,
          tagCount: 1,
        });
      }
    } else if (!unknownCategorySet.has(tag.categoryId)) {
      unknownCategorySet.add(tag.categoryId);
      unknownCategoryIds.push(tag.categoryId);
    }

    const geometryIds = uniquePreservingOrder(tag.geometryIds);
    const missingGeometryIds: string[] = [];
    const exportedGeometries: GeoJsonGeometry[] = [];

    for (const geometryId of geometryIds) {
      const geometry = geometryById.get(geometryId);
      if (!geometry) {
        missingGeometryIds.push(geometryId);
        continue;
      }

      linkedGeometryIds.add(geometry.uuid);
      exportedGeometries.push(geometryToGeoJsonGeometry(geometry));
    }

    return {
      uuid: tag.uuid,
      targetType: tag.targetType ?? 'text',
      text: tag.text,
      note: tag.note ?? null,
      createdAt: tag.createdAt,
      paragraphIndex: tag.paragraphIndex,
      startOffset: tag.startOffset,
      endParagraphIndex: tag.endParagraphIndex ?? tag.paragraphIndex,
      endOffset: tag.endOffset,
      runId: tag.runId ?? null,
      tableId: tag.tableId ?? null,
      categoryId: tag.categoryId,
      categoryLevel: exportedCategory?.level ?? null,
      temaId: exportedCategory?.temaId ?? null,
      temaName: exportedCategory?.temaName ?? null,
      gruppId: exportedCategory?.gruppId ?? null,
      gruppName: exportedCategory?.gruppName ?? null,
      undergruppId: exportedCategory?.undergruppId ?? null,
      undergruppName: exportedCategory?.undergruppName ?? null,
      customCategory: exportedCategory?.custom ?? null,
      geometryIds,
      missingGeometryIds,
      geometries: exportedGeometries,
    };
  });

  return {
    schemaVersion: 1,
    exportedAt,
    sourceDocument: {
      fileName,
      activeGeometryDocId,
    },
    summary: {
      tagCount: tags.length,
      linkedGeometryCount: linkedGeometryIds.size,
      categories: Array.from(categorySummaryById.values()),
      unknownCategoryIds,
    },
    tags: exportedTags,
  };
}

export function buildTagJsonExportFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return 'taggar.json';

  const withoutDocx = trimmed.replace(/\.docx$/i, '');
  return `${withoutDocx}_taggar.json`;
}
