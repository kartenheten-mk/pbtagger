import { describe, expect, it } from 'vitest';
import type { Geometry, Tag } from '../../src/types';
import { generateBookmarkName } from '../../src/docx/bookmarkUtils';
import {
  buildDefaultConfig,
  buildPlanbeskrivningXml,
} from '../../src/docx/PlanbeskrivningXmlBuilder';
import { parsePlanbeskrivningXmlText } from '../../src/docx/PlanbeskrivningXmlParser';
import { buildGmlExportPreview } from '../../src/geometry/gmlExportPreview';

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    uuid: '11111111-1111-4111-8111-111111111111',
    categoryId: 'detaljplanens-syfte--syfte',
    targetType: 'text',
    text: 'Syfte',
    paragraphIndex: 0,
    startOffset: 0,
    endOffset: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePolygon(uuid: string, name: string): Geometry {
  return {
    uuid,
    name,
    type: 'polygon',
    coordinates: [
      [
        [313000, 6400000],
        [313100, 6400000],
        [313100, 6400100],
        [313000, 6400100],
        [313000, 6400000],
      ],
    ],
    crs: 'EPSG:3006',
    source: 'json',
    sourceDocId: 'plan-1',
    featureType: 'detaljplan',
    color: '#3b82f6',
    properties: {},
  };
}

function deriveGeoIdentitet(baseIdentitet: string, geoIndex: number): string {
  const suffix = `_g${geoIndex}`;
  return baseIdentitet.slice(0, 40 - suffix.length) + suffix;
}

describe('buildGmlExportPreview', () => {
  it('returns preview geometries for tags linked to JSON geometries', () => {
    const config = buildDefaultConfig('plan-1');
    const tag = makeTag({ geometryIds: ['json-1'] });
    const geometries = [makePolygon('json-1', 'Plan area')];

    const preview = buildGmlExportPreview(config, [tag], geometries);

    expect(preview.geometries).toHaveLength(1);
    expect(preview.linkedGeometryIdsByTagUuid.get(tag.uuid)?.size).toBe(1);
  });

  it('creates multiple preview geometries with expected identitet suffixes', () => {
    const config = buildDefaultConfig('plan-1');
    const tag = makeTag({
      uuid: '22222222-2222-4222-8222-222222222222',
      text: 'Motiv till reglering',
      geometryIds: ['json-1', 'json-2'],
    });
    const geometries = [
      makePolygon('json-1', 'Geo A'),
      makePolygon('json-2', 'Geo B'),
    ];

    const preview = buildGmlExportPreview(config, [tag], geometries);
    const identiteter = preview.geometries
      .map((g) => String(g.properties?.['identitet'] ?? ''))
      .filter(Boolean);
    const baseIdentitet = generateBookmarkName(tag);

    expect(preview.geometries).toHaveLength(2);
    expect(identiteter).toContain(baseIdentitet);
    expect(identiteter).toContain(deriveGeoIdentitet(baseIdentitet, 2));
  });

  it('returns no preview geometry when tags have no linked geometry', () => {
    const config = buildDefaultConfig('plan-1');
    const tag = makeTag({ geometryIds: undefined });

    const preview = buildGmlExportPreview(config, [tag], []);

    expect(preview.geometries).toHaveLength(0);
    expect(preview.linkedGeometryIdsByTagUuid.get(tag.uuid)?.size ?? 0).toBe(0);
  });

  it('matches builder+parser semantics for representative data', () => {
    const config = buildDefaultConfig('plan-1');
    const tagA = makeTag({
      uuid: '33333333-3333-4333-8333-333333333333',
      text: 'Syfte',
      geometryIds: ['json-1', 'json-2'],
    });
    const tagB = makeTag({
      uuid: '44444444-4444-4444-8444-444444444444',
      text: 'Upplysning',
      geometryIds: ['json-3'],
      paragraphIndex: 1,
      startOffset: 0,
      endOffset: 9,
    });
    const jsonGeometries = [
      makePolygon('json-1', 'Geo 1'),
      makePolygon('json-2', 'Geo 2'),
      makePolygon('json-3', 'Geo 3'),
    ];

    const expectedParsed = parsePlanbeskrivningXmlText(
      buildPlanbeskrivningXml(config, [tagA, tagB], jsonGeometries)
    );
    expect(expectedParsed).not.toBeNull();

    const preview = buildGmlExportPreview(config, [tagA, tagB], jsonGeometries);

    expect(preview.geometries).toHaveLength(expectedParsed!.geometries.length);
    expect(preview.linkedGeometryIdsByTagUuid.get(tagA.uuid)?.size).toBe(
      expectedParsed!.identitetToGeometryUuid.get(generateBookmarkName(tagA))?.length ?? 0
    );
    expect(preview.linkedGeometryIdsByTagUuid.get(tagB.uuid)?.size).toBe(
      expectedParsed!.identitetToGeometryUuid.get(generateBookmarkName(tagB))?.length ?? 0
    );
  });

  it('uses stable preview UUIDs across recomputations', () => {
    const config = buildDefaultConfig('plan-1');
    const tag = makeTag({
      uuid: '55555555-5555-4555-8555-555555555555',
      text: 'Stabil preview',
      geometryIds: ['json-1', 'json-2'],
    });
    const jsonGeometries = [
      makePolygon('json-1', 'Geo 1'),
      makePolygon('json-2', 'Geo 2'),
    ];

    const previewA = buildGmlExportPreview(config, [tag], jsonGeometries);
    const previewB = buildGmlExportPreview(config, [tag], jsonGeometries);

    const uuidsA = previewA.geometries.map((g) => g.uuid);
    const uuidsB = previewB.geometries.map((g) => g.uuid);
    expect(uuidsB).toEqual(uuidsA);

    const previewIds = Array.from(previewA.linkedGeometryIdsByTagUuid.get(tag.uuid) ?? []);
    expect(previewIds.length).toBeGreaterThan(0);
    const uuidSet = new Set(uuidsA);
    for (const id of previewIds) {
      expect(uuidSet.has(id)).toBe(true);
    }
  });
});
