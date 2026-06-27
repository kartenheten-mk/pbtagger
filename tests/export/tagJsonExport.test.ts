import { describe, expect, it } from 'vitest';
import {
  buildTagJsonExport,
  buildTagJsonExportFileName,
} from '../../src/export/tagJsonExport';
import type { Category, Geometry, Tag, TagTargetType } from '../../src/types';

const CREATED_AT = '2026-06-01T10:00:00.000Z';
const EXPORTED_AT = '2026-06-02T12:00:00.000Z';

const groupCategory: Category = {
  id: 'detaljplanens-syfte--syfte',
  name: 'Syfte',
  level: 'grupp',
  color: '#2563eb',
  temaId: 'detaljplanens-syfte',
  temaName: 'Detaljplanens syfte',
  gruppId: 'syfte',
  gruppName: 'Syfte',
};

const undergroupCategory: Category = {
  id: 'genomforandefragor--ekonomiska-fragor--planavgift',
  name: 'Planavgift',
  level: 'undergrupp',
  color: '#16a34a',
  temaId: 'genomforandefragor',
  temaName: 'Genomförandefrågor',
  gruppId: 'ekonomiska-fragor',
  gruppName: 'Ekonomiska frågor',
  undergruppId: 'planavgift',
  undergruppName: 'Planavgift',
};

const customCategory: Category = {
  id: 'custom-tema--custom-grupp',
  name: 'Egen grupp',
  level: 'grupp',
  color: '#9333ea',
  temaId: 'custom-tema',
  temaName: 'Eget tema',
  gruppId: 'custom-grupp',
  gruppName: 'Egen grupp',
  custom: true,
};

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    uuid: 'tag-1',
    categoryId: groupCategory.id,
    text: 'Markerad text',
    paragraphIndex: 2,
    startOffset: 5,
    endOffset: 18,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function makeGeometry(overrides: Partial<Geometry> = {}): Geometry {
  return {
    uuid: 'geo-1',
    name: 'Planbestämmelse',
    type: 'point',
    coordinates: [18.1, 59.3],
    crs: 'EPSG:4326',
    featureType: 'användningsbestämmelse',
    sourceDocId: 'plan-1',
    source: 'json',
    properties: {
      bestammelseformulering: 'Bostäder',
      extra: 'värde',
    },
    ...overrides,
  };
}

describe('buildTagJsonExport', () => {
  it('exports every tag target type and defaults missing targetType to text', () => {
    const targetTypes: Array<TagTargetType | undefined> = [
      undefined,
      'image',
      'graph',
      'table',
    ];
    const tags = targetTypes.map((targetType, index) =>
      makeTag({
        uuid: `tag-${index + 1}`,
        targetType,
        runId: targetType === 'image' || targetType === 'graph' ? `run-${index}` : undefined,
        tableId: targetType === 'table' ? 'table-1' : undefined,
      })
    );

    const result = buildTagJsonExport({
      tags,
      geometries: [],
      categories: [groupCategory],
      exportedAt: EXPORTED_AT,
    });

    expect(result.tags.map((tag) => tag.targetType)).toEqual([
      'text',
      'image',
      'graph',
      'table',
    ]);
    expect(result.tags[1].runId).toBe('run-1');
    expect(result.tags[3].tableId).toBe('table-1');
  });

  it('maps category hierarchy, custom categories, and summary counts', () => {
    const result = buildTagJsonExport({
      tags: [
        makeTag({ uuid: 'tag-1', categoryId: undergroupCategory.id }),
        makeTag({ uuid: 'tag-2', categoryId: undergroupCategory.id }),
        makeTag({ uuid: 'tag-3', categoryId: customCategory.id }),
      ],
      geometries: [],
      categories: [undergroupCategory, customCategory],
      fileName: 'Planbeskrivning.docx',
      activeGeometryDocId: 'plan-1',
      exportedAt: EXPORTED_AT,
    });

    expect(result.sourceDocument).toEqual({
      fileName: 'Planbeskrivning.docx',
      activeGeometryDocId: 'plan-1',
    });
    expect(result.summary.categories).toEqual([
      {
        categoryId: undergroupCategory.id,
        level: 'undergrupp',
        temaId: 'genomforandefragor',
        temaName: 'Genomförandefrågor',
        gruppId: 'ekonomiska-fragor',
        gruppName: 'Ekonomiska frågor',
        undergruppId: 'planavgift',
        undergruppName: 'Planavgift',
        custom: false,
        tagCount: 2,
      },
      {
        categoryId: customCategory.id,
        level: 'grupp',
        temaId: 'custom-tema',
        temaName: 'Eget tema',
        gruppId: 'custom-grupp',
        gruppName: 'Egen grupp',
        undergruppId: null,
        undergruppName: null,
        custom: true,
        tagCount: 1,
      },
    ]);
    expect(result.tags[0]).toMatchObject({
      categoryId: undergroupCategory.id,
      categoryLevel: 'undergrupp',
      temaName: 'Genomförandefrågor',
      undergruppName: 'Planavgift',
      customCategory: false,
    });
  });

  it('exports linked geometry as plain GeoJSON geometry without source metadata', () => {
    const result = buildTagJsonExport({
      tags: [makeTag({ geometryIds: ['geo-1'] })],
      geometries: [makeGeometry()],
      categories: [groupCategory],
      exportedAt: EXPORTED_AT,
    });

    const exportedGeometry = result.tags[0].geometries[0];
    expect(result.summary.linkedGeometryCount).toBe(1);
    expect(exportedGeometry).toEqual({
      type: 'Point',
      coordinates: [18.1, 59.3],
    });
    expect(exportedGeometry).not.toHaveProperty('uuid');
    expect(exportedGeometry).not.toHaveProperty('name');
    expect(exportedGeometry).not.toHaveProperty('source');
    expect(exportedGeometry).not.toHaveProperty('sourceDocId');
    expect(exportedGeometry).not.toHaveProperty('featureType');
    expect(exportedGeometry).not.toHaveProperty('sourceCrs');
    expect(exportedGeometry).not.toHaveProperty('properties');
  });

  it('keeps unknown categories and missing geometries without throwing', () => {
    const result = buildTagJsonExport({
      tags: [
        makeTag({
          categoryId: 'okand-kategori',
          geometryIds: ['missing-geo'],
        }),
      ],
      geometries: [],
      categories: [],
      exportedAt: EXPORTED_AT,
    });

    expect(result.summary.unknownCategoryIds).toEqual(['okand-kategori']);
    expect(result.summary.categories).toEqual([]);
    expect(result.tags[0].categoryId).toBe('okand-kategori');
    expect(result.tags[0]).toMatchObject({
      categoryLevel: null,
      temaId: null,
      temaName: null,
      gruppId: null,
      gruppName: null,
      undergruppId: null,
      undergruppName: null,
      customCategory: null,
    });
    expect(result.tags[0].geometryIds).toEqual(['missing-geo']);
    expect(result.tags[0].missingGeometryIds).toEqual(['missing-geo']);
    expect(result.tags[0].geometries).toEqual([]);
  });

  it('deduplicates repeated geometry ids per tag while preserving order', () => {
    const result = buildTagJsonExport({
      tags: [
        makeTag({
          geometryIds: ['geo-1', 'geo-2', 'geo-1', 'missing-geo', 'geo-2'],
        }),
      ],
      geometries: [
        makeGeometry({ uuid: 'geo-1', name: 'Första' }),
        makeGeometry({ uuid: 'geo-2', name: 'Andra', coordinates: [18.2, 59.4] }),
      ],
      categories: [groupCategory],
      exportedAt: EXPORTED_AT,
    });

    expect(result.tags[0].geometryIds).toEqual(['geo-1', 'geo-2', 'missing-geo']);
    expect(result.tags[0].geometries).toEqual([
      { type: 'Point', coordinates: [18.1, 59.3] },
      { type: 'Point', coordinates: [18.2, 59.4] },
    ]);
    expect(result.tags[0].missingGeometryIds).toEqual(['missing-geo']);
    expect(result.summary.linkedGeometryCount).toBe(2);
  });
});

describe('buildTagJsonExportFileName', () => {
  it('builds a document-based export file name with a fallback', () => {
    expect(buildTagJsonExportFileName('Planbeskrivning.docx')).toBe(
      'Planbeskrivning_taggar.json'
    );
    expect(buildTagJsonExportFileName('')).toBe('taggar.json');
  });
});
