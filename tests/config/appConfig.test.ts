import { describe, expect, it } from 'vitest';
import {
  buildDefaultAppConfig,
  normalizeAppConfig,
  normalizeLayerNames,
  parseAppConfig,
} from '../../src/config/appConfig';

describe('app config helpers', () => {
  it('builds an empty default config that uses OpenStreetMap', () => {
    expect(buildDefaultAppConfig()).toEqual({
      version: 1,
      map: {
        activeBackgroundMapId: null,
        backgroundMaps: [],
      },
    });
  });

  it('normalizes layer names from comma or newline separated input', () => {
    expect(normalizeLayerNames('plan,bakgrund\nplan')).toEqual(['plan', 'bakgrund']);
  });

  it('drops invalid maps and clears stale active ids while normalizing', () => {
    const normalized = normalizeAppConfig({
      version: 1,
      map: {
        activeBackgroundMapId: 'missing',
        backgroundMaps: [
          {
            id: 'valid',
            type: 'wms',
            name: 'Valid WMS',
            url: 'https://example.test/wms',
            layers: ['layer_a'],
          },
          {
            id: 'bad-url',
            type: 'wms',
            name: 'Bad URL',
            url: 'ftp://example.test/wms',
            layers: ['layer_b'],
          },
        ],
      },
    });

    expect(normalized.map.activeBackgroundMapId).toBeNull();
    expect(normalized.map.backgroundMaps).toHaveLength(1);
    expect(normalized.map.backgroundMaps[0].id).toBe('valid');
  });

  it('validates imported config.json and normalizes unknown active ids to OSM', () => {
    const parsed = parseAppConfig({
      version: 1,
      map: {
        activeBackgroundMapId: 'old-id',
        backgroundMaps: [
          {
            id: 'map-1',
            type: 'wms',
            name: 'Kommun WMS',
            url: 'https://example.test/wms',
            layers: ['layer_a', 'layer_b'],
          },
        ],
      },
    });

    expect(parsed.map.activeBackgroundMapId).toBeNull();
    expect(parsed.map.backgroundMaps[0].layers).toEqual(['layer_a', 'layer_b']);
  });

  it('rejects unsupported config versions and empty layer lists', () => {
    expect(() => parseAppConfig({ version: 2, map: { activeBackgroundMapId: null, backgroundMaps: [] } }))
      .toThrow(/stöds inte/);

    expect(() =>
      parseAppConfig({
        version: 1,
        map: {
          activeBackgroundMapId: null,
          backgroundMaps: [
            {
              id: 'map-1',
              type: 'wms',
              name: 'Kommun WMS',
              url: 'https://example.test/wms',
              layers: [],
            },
          ],
        },
      })
    ).toThrow(/minst ett lagernamn/);
  });
});
