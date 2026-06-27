import { describe, expect, it } from 'vitest';
import {
  buildDefaultAppConfig,
  normalizeAppConfig,
  normalizeLayerNames,
  parseAppConfig,
  parseCategoryConfigFromAppConfig,
  parseMapConfigFromAppConfig,
  serializeAppConfig,
} from '../../src/config/appConfig';

describe('app config helpers', () => {
  it('builds an empty default config that uses OpenStreetMap', () => {
    expect(buildDefaultAppConfig()).toEqual({
      version: 1,
      map: {
        activeBackgroundMapId: null,
        backgroundMaps: [],
      },
      categories: {
        customGroups: [],
        customUndergroups: [],
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
    expect(normalized.categories).toEqual({
      customGroups: [],
      customUndergroups: [],
    });
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
    expect(parsed.categories).toEqual({
      customGroups: [],
      customUndergroups: [],
    });
  });

  it('parses and serializes custom category config', () => {
    const parsed = parseAppConfig({
      version: 1,
      map: {
        activeBackgroundMapId: null,
        backgroundMaps: [],
      },
      categories: {
        customGroups: [
          {
            temaId: 'beskrivning-av-detaljplanen',
            id: 'min-grupp',
            name: 'Min grupp',
            undergrupper: [
              { id: 'min-undergrupp', name: 'Min undergrupp' },
            ],
          },
        ],
        customUndergroups: [
          {
            temaId: 'genomforandefragor',
            gruppId: 'tekniska-fragor',
            id: 'drift',
            name: 'Drift',
          },
        ],
      },
    });

    expect(parsed.categories.customGroups[0].undergrupper[0].id).toBe('min-undergrupp');
    expect(parsed.categories.customUndergroups[0]).toMatchObject({
      temaId: 'genomforandefragor',
      gruppId: 'tekniska-fragor',
      id: 'drift',
    });

    expect(JSON.parse(serializeAppConfig(parsed)).categories).toEqual(parsed.categories);
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

  it('rejects duplicate custom category ids within the same parent', () => {
    expect(() =>
      parseAppConfig({
        version: 1,
        map: { activeBackgroundMapId: null, backgroundMaps: [] },
        categories: {
          customGroups: [
            {
              temaId: 'tema',
              id: 'egen',
              name: 'Egen',
              undergrupper: [],
            },
            {
              temaId: 'tema',
              id: 'egen',
              name: 'Egen igen',
              undergrupper: [],
            },
          ],
          customUndergroups: [],
        },
      })
    ).toThrow(/duplicerad/);

    expect(() =>
      parseAppConfig({
        version: 1,
        map: { activeBackgroundMapId: null, backgroundMaps: [] },
        categories: {
          customGroups: [],
          customUndergroups: [
            {
              temaId: 'tema',
              gruppId: 'grupp',
              id: 'egen',
              name: 'Egen',
            },
            {
              temaId: 'tema',
              gruppId: 'grupp',
              id: 'egen',
              name: 'Egen igen',
            },
          ],
        },
      })
    ).toThrow(/duplicerad/);
  });

  it('parses only the map section for WMS config imports', () => {
    const parsed = parseMapConfigFromAppConfig({
      version: 1,
      map: {
        activeBackgroundMapId: 'map-1',
        backgroundMaps: [
          {
            id: 'map-1',
            type: 'wms',
            name: 'Kommun WMS',
            url: 'https://example.test/wms',
            layers: ['layer_a'],
          },
        ],
      },
      categories: {
        customGroups: 'not-a-list',
        customUndergroups: [],
      },
    });

    expect(parsed.activeBackgroundMapId).toBe('map-1');
    expect(parsed.backgroundMaps[0].name).toBe('Kommun WMS');
  });

  it('parses only the categories section for tag config imports', () => {
    const parsed = parseCategoryConfigFromAppConfig({
      version: 1,
      map: {
        activeBackgroundMapId: null,
        backgroundMaps: [
          {
            id: 'bad-map',
            type: 'wms',
            name: 'Bad WMS',
            url: 'ftp://example.test/wms',
            layers: [],
          },
        ],
      },
      categories: {
        customGroups: [
          {
            temaId: 'genomforandefragor',
            id: 'kommunala-fragor',
            name: 'Kommunala frågor',
            undergrupper: [],
          },
        ],
        customUndergroups: [],
      },
    });

    expect(parsed.customGroups[0]).toMatchObject({
      temaId: 'genomforandefragor',
      id: 'kommunala-fragor',
    });
  });

  it('rejects partial imports when the selected section is missing or invalid', () => {
    expect(() =>
      parseMapConfigFromAppConfig({
        version: 1,
        categories: { customGroups: [], customUndergroups: [] },
      })
    ).toThrow(/saknar map/);

    expect(() =>
      parseMapConfigFromAppConfig({
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

    expect(() =>
      parseCategoryConfigFromAppConfig({
        version: 1,
        map: { activeBackgroundMapId: null, backgroundMaps: [] },
      })
    ).toThrow(/saknar categories/);

    expect(() =>
      parseCategoryConfigFromAppConfig({
        version: 1,
        categories: { customGroups: 'bad', customUndergroups: [] },
      })
    ).toThrow(/customGroups måste vara en lista/);
  });
});
