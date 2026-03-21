import { describe, expect, it } from 'vitest';
import type { Geometry } from '../../src/types';
import { inferGeometrySource, splitGeometriesBySource } from '../../src/geometry/geometrySource';

function makeGeometry(overrides: Partial<Geometry> = {}): Geometry {
  return {
    uuid: 'geo-1',
    name: 'Geo',
    type: 'polygon',
    coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]],
    ...overrides,
  };
}

describe('geometrySource', () => {
  it('prefers explicit source when set', () => {
    const geo = makeGeometry({ source: 'docx_gml' });
    expect(inferGeometrySource(geo)).toBe('docx_gml');
  });

  it('infers legacy docx_gml from featureType + identitet without sourceDocId', () => {
    const geo = makeGeometry({
      featureType: 'planbeskrivning',
      properties: { identitet: 'Tag_abc123' },
    });
    expect(inferGeometrySource(geo)).toBe('docx_gml');
  });

  it('falls back to json for legacy geometries that do not match gml signature', () => {
    const geo = makeGeometry({
      featureType: 'detaljplan',
      sourceDocId: 'plan-1',
    });
    expect(inferGeometrySource(geo)).toBe('json');
  });

  it('splits mixed geometry collections by source', () => {
    const geos = [
      makeGeometry({ uuid: 'j1', source: 'json' }),
      makeGeometry({
        uuid: 'g1',
        featureType: 'planbeskrivning',
        properties: { identitet: 'Tag_1' },
      }),
    ];
    const { json, docxGml } = splitGeometriesBySource(geos);
    expect(json.map((g) => g.uuid)).toEqual(['j1']);
    expect(docxGml.map((g) => g.uuid)).toEqual(['g1']);
  });
});
