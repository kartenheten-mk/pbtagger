import { describe, expect, it } from 'vitest';
import type { Geometry, Tag } from '../../src/types';
import { buildMirroredDisplayLinks, getBaseIdentitet } from '../../src/geometry/tagLinkMirror';
import { generateBookmarkName } from '../../src/docx/bookmarkUtils';

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    uuid: '11111111-2222-3333-4444-555555555555',
    categoryId: 'detaljplanens-syfte--syfte',
    text: 'Syfte',
    paragraphIndex: 0,
    startOffset: 0,
    endOffset: 5,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeGeometry(overrides: Partial<Geometry> = {}): Geometry {
  return {
    uuid: 'geo-1',
    name: 'Geo',
    type: 'polygon',
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    ...overrides,
  };
}

describe('tagLinkMirror', () => {
  it('strips _gN suffix for grouping', () => {
    expect(getBaseIdentitet('Tag_a_b_g2')).toBe('Tag_a_b');
    expect(getBaseIdentitet('Tag_a_b')).toBe('Tag_a_b');
  });

  it('mirrors a JSON-linked tag to matching GML geometries for display', () => {
    const tag = makeTag({ geometryIds: ['json-1'] });
    const base = generateBookmarkName(tag);
    const gml1 = makeGeometry({
      uuid: 'gml-1',
      source: 'docx_gml',
      properties: { identitet: base },
    });
    const gml2 = makeGeometry({
      uuid: 'gml-2',
      source: 'docx_gml',
      properties: { identitet: `${base}_g2` },
    });

    const map = buildMirroredDisplayLinks(
      [tag],
      new Set(['json-1']),
      [gml1, gml2]
    );

    const linked = Array.from(map.get(tag.uuid) ?? new Set<string>());
    expect(linked).toEqual(expect.arrayContaining(['json-1', 'gml-1', 'gml-2']));
  });

  it('mirrors using UUID suffix fallback when base identitet changed', () => {
    const tag = makeTag({ geometryIds: ['json-1'] });
    const suffix = tag.uuid.replace(/-/g, '').slice(0, 8).toLowerCase();
    const gml = makeGeometry({
      uuid: 'gml-x',
      source: 'docx_gml',
      properties: { identitet: `LegacyName_deadbeef_${suffix}` },
    });

    const map = buildMirroredDisplayLinks([tag], new Set(['json-1']), [gml]);
    const linked = Array.from(map.get(tag.uuid) ?? new Set<string>());
    expect(linked).toEqual(expect.arrayContaining(['json-1', 'gml-x']));
  });

  it('mirrors stale external geometry links when no JSON document is loaded', () => {
    const tag = makeTag({ geometryIds: ['stale-json-1'] });
    const base = generateBookmarkName(tag);
    const gml = makeGeometry({
      uuid: 'gml-from-docx',
      source: 'docx_gml',
      properties: { identitet: base },
    });

    const map = buildMirroredDisplayLinks([tag], new Set(), [gml]);
    const linked = Array.from(map.get(tag.uuid) ?? new Set<string>());

    expect(linked).toEqual(expect.arrayContaining(['stale-json-1', 'gml-from-docx']));
  });

  it('does not mirror when tag has no JSON geometry link', () => {
    const tag = makeTag({ geometryIds: ['gml-1'] });
    const base = generateBookmarkName(tag);
    const gml = makeGeometry({
      uuid: 'gml-1',
      source: 'docx_gml',
      properties: { identitet: base },
    });

    const map = buildMirroredDisplayLinks(
      [tag],
      new Set(['json-1']),
      [gml]
    );

    expect(Array.from(map.get(tag.uuid) ?? new Set<string>())).toEqual(['gml-1']);
  });
});
