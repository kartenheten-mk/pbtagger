import { describe, expect, it } from 'vitest';
import { groupDocxGmlGeometries } from '../../src/geometry/docxGmlGrouping';
import type { Geometry } from '../../src/types';

function makeDocxGmlGeometry(
  uuid: string,
  identitet: string,
  coordinates: number[][][] = [
    [
      [313000, 6400000],
      [313100, 6400000],
      [313100, 6400100],
      [313000, 6400100],
      [313000, 6400000],
    ],
  ]
): Geometry {
  return {
    uuid,
    name: identitet,
    type: 'polygon',
    coordinates,
    crs: 'EPSG:3006',
    source: 'docx_gml',
    featureType: 'planbeskrivning',
    properties: { identitet },
  };
}

describe('groupDocxGmlGeometries', () => {
  it('groups DOCX GML objects with the same shape as one logical display geometry', () => {
    const groups = groupDocxGmlGeometries([
      makeDocxGmlGeometry('gml-a', 'TagA'),
      makeDocxGmlGeometry('gml-b', 'TagB'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('gml-a');
    expect(groups[0].geometryUuids).toEqual(['gml-a', 'gml-b']);
  });

  it('keeps different GML shapes as separate display geometries', () => {
    const groups = groupDocxGmlGeometries([
      makeDocxGmlGeometry('gml-a', 'TagA'),
      makeDocxGmlGeometry('gml-b', 'TagB', [
        [
          [314000, 6400000],
          [314100, 6400000],
          [314100, 6400100],
          [314000, 6400100],
          [314000, 6400000],
        ],
      ]),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.geometryUuids)).toEqual([['gml-a'], ['gml-b']]);
  });

  it('uses a cleaned base identitet as the group label', () => {
    const groups = groupDocxGmlGeometries([
      makeDocxGmlGeometry('gml-a', 'LongBaseIdentitet_g2'),
    ]);

    expect(groups[0].label).toBe('LongBaseIdentitet');
  });
});