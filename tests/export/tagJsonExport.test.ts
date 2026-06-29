import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import {
  buildTagJsonExport,
  buildTagJsonExportFileName,
} from '../../src/export/tagJsonExport';
import {
  buildTagJsonWithImagesPackage,
  buildTagJsonWithImagesZip,
  buildTagJsonWithImagesZipFileName,
} from '../../src/export/tagJsonWithImagesExport';
import type { Category, DocModel, Geometry, Tag, TagTargetType } from '../../src/types';

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

function makeDocModelWithImage(imageData = new Uint8Array([137, 80, 78, 71])): DocModel {
  return {
    paragraphs: [
      {
        index: 0,
        headingLevel: 0,
        runs: [
          {
            id: 'p0_r0',
            text: '',
            isImage: true,
            imageData,
            imageMime: 'image/png',
          },
        ],
      },
    ],
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

describe('tag JSON with images ZIP export', () => {
  it('writes tagged image files to images/ and references them from tags.json', async () => {
    const imageData = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const blob = buildTagJsonWithImagesZip({
      tags: [
        makeTag({
          uuid: 'tag-image-1',
          targetType: 'image',
          text: 'Bild',
          paragraphIndex: 0,
          startOffset: 0,
          endOffset: 0,
          runId: 'p0_r0',
        }),
      ],
      geometries: [],
      categories: [groupCategory],
      docModel: makeDocModelWithImage(imageData),
      exportedAt: EXPORTED_AT,
    });

    const zip = new PizZip(await blob.arrayBuffer());
    const tagsJsonFile = zip.file('tags.json');
    expect(tagsJsonFile).not.toBeNull();

    const exported = JSON.parse(tagsJsonFile!.asText());
    expect(exported.schemaVersion).toBe(2);
    expect(exported.assets).toMatchObject({
      geometries: {
        path: 'geometries.geojson',
        linkedGeometryCount: 0,
        featureCount: 0,
        missingGeometryReferenceCount: 0,
      },
      images: {
        directory: 'images',
        imageTagCount: 1,
        exportedImageCount: 1,
        missingImageCount: 0,
      },
    });
    expect(exported.tags[0].image).toEqual({
      path: 'images/tag-image-1.png',
      fileName: 'tag-image-1.png',
      mimeType: 'image/png',
      byteLength: imageData.byteLength,
    });
    expect(exported.tags[0].missingImage).toBe(false);
    expect(exported.tags[0]).not.toHaveProperty('geometries');

    const geometryFile = zip.file('geometries.geojson');
    expect(geometryFile).not.toBeNull();
    expect(JSON.parse(geometryFile!.asText())).toEqual({
      type: 'FeatureCollection',
      features: [],
    });

    const imageFile = zip.file('images/tag-image-1.png');
    expect(imageFile).not.toBeNull();
    expect(Array.from(imageFile!.asUint8Array())).toEqual(Array.from(imageData));
  });

  it('writes linked geometries once to geometries.geojson and keeps tag geometry references', async () => {
    const blob = buildTagJsonWithImagesZip({
      tags: [
        makeTag({ uuid: 'tag-1', geometryIds: ['geo-1'] }),
        makeTag({ uuid: 'tag-2', geometryIds: ['geo-1', 'missing-geo'] }),
      ],
      geometries: [makeGeometry()],
      categories: [groupCategory],
      docModel: { paragraphs: [] },
      exportedAt: EXPORTED_AT,
    });

    const zip = new PizZip(await blob.arrayBuffer());
    const exported = JSON.parse(zip.file('tags.json')!.asText());
    const geojson = JSON.parse(zip.file('geometries.geojson')!.asText());

    expect(exported.assets.geometries).toEqual({
      path: 'geometries.geojson',
      linkedGeometryCount: 1,
      featureCount: 1,
      missingGeometryReferenceCount: 1,
    });
    expect(exported.tags[0]).toMatchObject({
      uuid: 'tag-1',
      geometryIds: ['geo-1'],
      missingGeometryIds: [],
    });
    expect(exported.tags[0]).not.toHaveProperty('geometries');
    expect(exported.tags[1]).toMatchObject({
      uuid: 'tag-2',
      geometryIds: ['geo-1', 'missing-geo'],
      missingGeometryIds: ['missing-geo'],
    });
    expect(exported.tags[1]).not.toHaveProperty('geometries');

    expect(geojson).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'geo-1',
          properties: {},
          geometry: {
            type: 'Point',
            coordinates: [18.1, 59.3],
          },
        },
      ],
    });
    expect(Object.keys(geojson.features[0]).sort()).toEqual([
      'geometry',
      'id',
      'properties',
      'type',
    ]);
    expect(geojson.features[0].properties).not.toHaveProperty('uuid');
    expect(geojson.features[0].properties).not.toHaveProperty('geometryId');
    expect(geojson.features[0].properties).not.toHaveProperty('color');
    expect(geojson.features[0].properties).not.toHaveProperty('name');
    expect(geojson.features[0].properties).not.toHaveProperty('type');
    expect(geojson.features[0].properties).not.toHaveProperty('featureType');
    expect(geojson.features[0].properties).not.toHaveProperty('sourceDocId');
    expect(geojson.features[0].properties).not.toHaveProperty('bestammelseformulering');
    expect(geojson.features[0].properties).not.toHaveProperty('linkedTagUuids');
  });

  it('keeps image tags in tags.json when the referenced image cannot be found', () => {
    const result = buildTagJsonWithImagesPackage({
      tags: [
        makeTag({
          uuid: 'tag-missing-image',
          targetType: 'image',
          text: 'Bild',
          paragraphIndex: 0,
          startOffset: 0,
          endOffset: 0,
          runId: 'missing-run',
        }),
      ],
      geometries: [],
      categories: [groupCategory],
      docModel: makeDocModelWithImage(),
      exportedAt: EXPORTED_AT,
    });

    expect(result.imageFiles).toEqual([]);
    expect(result.geometryGeoJson).toEqual({
      type: 'FeatureCollection',
      features: [],
    });
    expect(result.exportJson.assets).toMatchObject({
      geometries: {
        path: 'geometries.geojson',
        linkedGeometryCount: 0,
        featureCount: 0,
        missingGeometryReferenceCount: 0,
      },
      images: {
        directory: 'images',
        imageTagCount: 1,
        exportedImageCount: 0,
        missingImageCount: 1,
      },
    });
    expect(result.exportJson.tags[0].image).toBeNull();
    expect(result.exportJson.tags[0].missingImage).toBe(true);
    expect(result.exportJson.tags[0]).not.toHaveProperty('geometries');
  });

  it('builds a document-based ZIP file name with a fallback', () => {
    expect(buildTagJsonWithImagesZipFileName('Planbeskrivning.docx')).toBe(
      'Planbeskrivning_taggar.zip'
    );
    expect(buildTagJsonWithImagesZipFileName('')).toBe('taggar.zip');
  });
});
