import { describe, expect, it } from 'vitest';
import { parseDetaljplanJson } from '../../src/geometry/detaljplanParser';

describe('parseDetaljplanJson', () => {
  it('marks imported geometries with source=json', () => {
    const raw = {
      type: 'FeatureCollection',
      features: [
        {
          id: 'plan-1',
          properties: {
            'feature:typ': 'detaljplan',
            objektidentitet: 'plan-1',
            beteckning: 'DP-1',
            plangeometri: [
              {
                geometri: {
                  koordinatsystemPlan: 'EPSG:3009',
                  position: {
                    type: 'Polygon',
                    coordinates: [
                      [
                        [500000, 7000000],
                        [500100, 7000000],
                        [500100, 7000100],
                        [500000, 7000000],
                      ],
                    ],
                  },
                },
              },
            ],
          },
        },
      ],
    } as Record<string, unknown>;

    const result = parseDetaljplanJson(raw, 'plan.json');
    expect(result.geometries).toHaveLength(1);
    expect(result.geometries[0].source).toBe('json');
  });
});
