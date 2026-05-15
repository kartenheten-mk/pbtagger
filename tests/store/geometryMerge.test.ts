import { describe, expect, it } from 'vitest';
import type { Geometry, Tag } from '../../src/types';
import { replaceDocxGmlGeometriesInState } from '../../src/store/geometryMerge';

function makeGeometry(overrides: Partial<Geometry> = {}): Geometry {
  return {
    uuid: 'geo',
    name: 'Geo',
    type: 'polygon',
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    ...overrides,
  };
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    uuid: 'tag-1',
    categoryId: 'cat',
    text: 'Tag text',
    paragraphIndex: 0,
    startOffset: 0,
    endOffset: 3,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('replaceDocxGmlGeometriesInState', () => {
  it('replaces old gml geometries, preserves json geometries, and cleans stale gml links', () => {
    const jsonGeo = makeGeometry({ uuid: 'json-1', source: 'json', sourceDocId: 'plan-1' });
    const oldGmlGeo = makeGeometry({
      uuid: 'gml-old',
      source: 'docx_gml',
      featureType: 'planbeskrivning',
      properties: { identitet: 'OldTag' },
    });
    const incomingGml = [
      makeGeometry({
        uuid: 'gml-new',
        featureType: 'planbeskrivning',
        properties: { identitet: 'NewTag' },
      }),
    ];
    const tags = [
      makeTag({ uuid: 'tag-json', geometryIds: ['json-1'] }),
      makeTag({ uuid: 'tag-mixed', geometryIds: ['json-1', 'gml-old'] }),
      makeTag({ uuid: 'tag-gml-only', geometryIds: ['gml-old'] }),
    ];

    const next = replaceDocxGmlGeometriesInState([jsonGeo, oldGmlGeo], tags, incomingGml);

    expect(next.geometries.map((g) => g.uuid)).toEqual(['json-1', 'gml-new']);
    expect(next.geometries.find((g) => g.uuid === 'gml-new')?.source).toBe('docx_gml');
    expect(next.tags.find((t) => t.uuid === 'tag-json')?.geometryIds).toEqual(['json-1']);
    expect(next.tags.find((t) => t.uuid === 'tag-mixed')?.geometryIds).toEqual(['json-1']);
    expect(next.tags.find((t) => t.uuid === 'tag-gml-only')?.geometryIds).toBeUndefined();
  });
});
