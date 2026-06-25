// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { Geometry } from '../../src/types';

const {
  fitMock,
  getFeaturesMock,
  readFeaturesMock,
  osmConstructMock,
  tileWmsOptionsMock,
  tileLayerConstructMock,
  mapRemoveLayerMock,
  mapInsertAtMock,
} = vi.hoisted(() => ({
  fitMock: vi.fn(),
  getFeaturesMock: vi.fn(),
  readFeaturesMock: vi.fn(),
  osmConstructMock: vi.fn(),
  tileWmsOptionsMock: vi.fn(),
  tileLayerConstructMock: vi.fn(),
  mapRemoveLayerMock: vi.fn(),
  mapInsertAtMock: vi.fn(),
}));

vi.mock('ol/Map', () => ({
  default: class MockMap {
    private view: { fit: typeof fitMock };
    private target: HTMLElement | undefined;
    private layers: unknown[];

    constructor(options: {
      target?: HTMLElement;
      view: { fit: typeof fitMock };
      layers?: unknown[];
    }) {
      this.target = options.target;
      this.view = options.view;
      this.layers = [...(options.layers ?? [])];
    }

    on() {}
    getFeaturesAtPixel() {
      return [];
    }
    hasFeatureAtPixel() {
      return false;
    }
    getTargetElement() {
      return this.target ?? document.createElement('div');
    }
    getView() {
      return this.view;
    }
    getLayers() {
      return {
        getArray: () => this.layers,
        insertAt: (index: number, layer: unknown) => {
          this.layers.splice(index, 0, layer);
          mapInsertAtMock(index, layer);
        },
      };
    }
    removeLayer(layer: unknown) {
      const index = this.layers.indexOf(layer);
      if (index >= 0) this.layers.splice(index, 1);
      mapRemoveLayerMock(layer);
    }
    updateSize() {}
    setTarget(target: HTMLElement | undefined) {
      this.target = target;
    }
  },
}));

vi.mock('ol/View', () => ({
  default: class MockView {
    fit = fitMock;
  },
}));

vi.mock('ol/layer/Tile', () => ({
  default: class MockTileLayer {
    source: unknown;

    constructor(options: { source?: unknown }) {
      this.source = options.source;
      tileLayerConstructMock(options);
    }
  },
}));

vi.mock('ol/source/OSM', () => ({
  default: class MockOsm {
    constructor() {
      osmConstructMock();
    }
  },
}));

vi.mock('ol/source/TileWMS', () => ({
  default: class MockTileWms {
    constructor(options: unknown) {
      tileWmsOptionsMock(options);
    }
  },
}));

vi.mock('ol/layer/VectorImage', () => ({
  default: class MockVectorImageLayer {
    private style: unknown;

    constructor(options: { style?: unknown }) {
      this.style = options.style;
    }

    setStyle(style: unknown) {
      this.style = style;
    }
  },
}));

vi.mock('ol/source/Vector', () => ({
  default: class MockVectorSource {
    private features: Array<{
      get: (key: string) => unknown;
      getGeometry: () => { getExtent: () => number[] };
    }> = [];

    clear() {
      this.features = [];
    }

    addFeatures(features: typeof this.features) {
      this.features = [...this.features, ...features];
    }

    getFeatures() {
      getFeaturesMock();
      return this.features;
    }

    getExtent() {
      const extent = [Infinity, Infinity, -Infinity, -Infinity];
      for (const feature of this.features) {
        const featureExtent = feature.getGeometry().getExtent();
        extent[0] = Math.min(extent[0], featureExtent[0]);
        extent[1] = Math.min(extent[1], featureExtent[1]);
        extent[2] = Math.max(extent[2], featureExtent[2]);
        extent[3] = Math.max(extent[3], featureExtent[3]);
      }
      return extent;
    }
  },
}));

vi.mock('ol/format/GeoJSON', () => ({
  default: class MockGeoJson {
    readFeatures(data: {
      features: Array<{
        id: string;
        properties: Record<string, unknown>;
      }>;
    }) {
      readFeaturesMock();
      return data.features.map((feature, index) => ({
        get: (key: string) => feature.properties[key],
        getGeometry: () => ({
          getExtent: () => [index, index, index + 1, index + 1],
        }),
      }));
    }
  },
}));

vi.mock('ol/proj', () => ({
  fromLonLat: (coord: number[]) => coord,
}));

vi.mock('ol/style', () => ({
  Style: class MockStyle {
    constructor() {}
  },
  Fill: class MockFill {
    constructor() {}
  },
  Stroke: class MockStroke {
    constructor() {}
  },
  Circle: class MockCircle {
    constructor() {}
  },
}));

vi.mock('ol/extent', () => ({
  createEmpty: () => [Infinity, Infinity, -Infinity, -Infinity],
  extend: (extent: number[], other: number[]) => {
    extent[0] = Math.min(extent[0], other[0]);
    extent[1] = Math.min(extent[1], other[1]);
    extent[2] = Math.max(extent[2], other[2]);
    extent[3] = Math.max(extent[3], other[3]);
    return extent;
  },
  isEmpty: (extent: number[]) => extent[0] > extent[2] || extent[1] > extent[3],
}));

import { MapView } from '../../src/geometry/MapView';

function makeGeometry(uuid: string): Geometry {
  return {
    uuid,
    name: uuid,
    type: 'polygon',
    coordinates: [
      [
        [15, 62],
        [15.001, 62],
        [15.001, 62.001],
        [15, 62.001],
        [15, 62],
      ],
    ],
    crs: 'EPSG:4326',
    source: 'json',
    featureType: 'detaljplan',
    properties: {},
  };
}

const noop = () => {};

describe('MapView selected geometry auto-fit', () => {
  beforeEach(() => {
    fitMock.mockClear();
    getFeaturesMock.mockClear();
    readFeaturesMock.mockClear();
    osmConstructMock.mockClear();
    tileWmsOptionsMock.mockClear();
    tileLayerConstructMock.mockClear();
    mapRemoveLayerMock.mockClear();
    mapInsertAtMock.mockClear();
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uses OpenStreetMap when no custom background map is active', () => {
    render(
      <MapView
        geometries={[]}
        selectedGeometryUuids={[]}
        isLinking={false}
        onFeatureClick={noop}
        onMultiFeatureClick={noop}
      />
    );

    expect(osmConstructMock).toHaveBeenCalledTimes(1);
    expect(tileWmsOptionsMock).not.toHaveBeenCalled();
  });

  it('creates WMS background layers so the first configured layer is drawn on top', () => {
    render(
      <MapView
        geometries={[]}
        backgroundMap={{
          id: 'wms-1',
          type: 'wms',
          name: 'Kommun WMS',
          url: 'https://example.test/wms',
          layers: ['layer_a', 'layer_b'],
        }}
        selectedGeometryUuids={[]}
        isLinking={false}
        onFeatureClick={noop}
        onMultiFeatureClick={noop}
      />
    );

    expect(osmConstructMock).not.toHaveBeenCalled();
    expect(tileWmsOptionsMock).toHaveBeenCalledTimes(2);
    expect(tileWmsOptionsMock.mock.calls.map(([options]) => options)).toEqual([
      {
        url: 'https://example.test/wms',
        params: {
          LAYERS: 'layer_b',
          TILED: true,
          TRANSPARENT: true,
        },
        crossOrigin: 'anonymous',
      },
      {
        url: 'https://example.test/wms',
        params: {
          LAYERS: 'layer_a',
          TILED: true,
          TRANSPARENT: true,
        },
        crossOrigin: 'anonymous',
      },
    ]);
  });

  it('keeps WMS backgrounds below the vector layer when the active background changes', () => {
    const { rerender } = render(
      <MapView
        geometries={[]}
        backgroundMap={{
          id: 'wms-1',
          type: 'wms',
          name: 'Kommun WMS',
          url: 'https://example.test/wms',
          layers: ['base', 'labels'],
        }}
        selectedGeometryUuids={[]}
        isLinking={false}
        onFeatureClick={noop}
        onMultiFeatureClick={noop}
      />
    );

    mapRemoveLayerMock.mockClear();
    mapInsertAtMock.mockClear();
    tileWmsOptionsMock.mockClear();

    rerender(
      <MapView
        geometries={[]}
        backgroundMap={{
          id: 'wms-2',
          type: 'wms',
          name: 'Annan WMS',
          url: 'https://example.test/other-wms',
          layers: ['ortho'],
        }}
        selectedGeometryUuids={[]}
        isLinking={false}
        onFeatureClick={noop}
        onMultiFeatureClick={noop}
      />
    );

    expect(mapRemoveLayerMock).toHaveBeenCalledTimes(2);
    expect(tileWmsOptionsMock).toHaveBeenCalledTimes(1);
    expect(tileWmsOptionsMock).toHaveBeenCalledWith({
      url: 'https://example.test/other-wms',
      params: {
        LAYERS: 'ortho',
        TILED: true,
        TRANSPARENT: true,
      },
      crossOrigin: 'anonymous',
    });
    expect(mapInsertAtMock).toHaveBeenCalledWith(0, expect.anything());
  });

  it('does not fit the map again when selected and geometry content are unchanged', () => {
    const geometries = [makeGeometry('geo-a'), makeGeometry('geo-b')];
    const { rerender } = render(
      <MapView
        geometries={geometries}
        selectedGeometryUuids={['geo-a']}
        isLinking={false}
        onFeatureClick={noop}
        onMultiFeatureClick={noop}
      />
    );

    expect(fitMock).toHaveBeenCalledTimes(2);
    fitMock.mockClear();

    rerender(
      <MapView
        geometries={[...geometries]}
        selectedGeometryUuids={['geo-a']}
        previewGeometryUuid="geo-b"
        isLinking={false}
        onFeatureClick={noop}
        onMultiFeatureClick={noop}
      />
    );

    expect(fitMock).not.toHaveBeenCalled();

    rerender(
      <MapView
        geometries={geometries}
        selectedGeometryUuids={['geo-b']}
        previewGeometryUuid="geo-b"
        isLinking={false}
        onFeatureClick={noop}
        onMultiFeatureClick={noop}
      />
    );

    expect(fitMock).toHaveBeenCalledTimes(1);
  });

  it('reloads features when coordinate array identity changes', () => {
    const geometries = [makeGeometry('geo-a'), makeGeometry('geo-b')];
    const { rerender } = render(
      <MapView
        geometries={geometries}
        selectedGeometryUuids={[]}
        isLinking={false}
        onFeatureClick={noop}
        onMultiFeatureClick={noop}
      />
    );

    expect(fitMock).toHaveBeenCalledTimes(1);
    fitMock.mockClear();

    rerender(
      <MapView
        geometries={[...geometries]}
        selectedGeometryUuids={[]}
        previewGeometryUuid="geo-b"
        isLinking={false}
        onFeatureClick={noop}
        onMultiFeatureClick={noop}
      />
    );

    expect(fitMock).not.toHaveBeenCalled();

    const updatedGeometries: Geometry[] = [
      {
        ...geometries[0],
        coordinates: [
          [
            [15, 62],
            [15.002, 62],
            [15.002, 62.002],
            [15, 62.002],
            [15, 62],
          ],
        ],
      },
      geometries[1],
    ];

    rerender(
      <MapView
        geometries={updatedGeometries}
        selectedGeometryUuids={[]}
        previewGeometryUuid="geo-b"
        isLinking={false}
        onFeatureClick={noop}
        onMultiFeatureClick={noop}
      />
    );

    expect(fitMock).toHaveBeenCalledTimes(1);
  });

  it('uses the uuid feature index when fitting selected geometries', () => {
    render(
      <MapView
        geometries={[makeGeometry('geo-index-a'), makeGeometry('geo-index-b')]}
        selectedGeometryUuids={['geo-index-b']}
        isLinking={false}
        onFeatureClick={noop}
        onMultiFeatureClick={noop}
      />
    );

    expect(fitMock).toHaveBeenCalledTimes(2);
    expect(getFeaturesMock).not.toHaveBeenCalled();
  });

  it('reuses prepared features across map remounts for unchanged geometry content', () => {
    const geometries = [makeGeometry('geo-cache-a'), makeGeometry('geo-cache-b')];
    const first = render(
      <MapView
        geometries={geometries}
        selectedGeometryUuids={[]}
        isLinking={false}
        onFeatureClick={noop}
        onMultiFeatureClick={noop}
      />
    );

    expect(readFeaturesMock).toHaveBeenCalledTimes(1);
    first.unmount();

    render(
      <MapView
        geometries={geometries}
        selectedGeometryUuids={[]}
        isLinking={false}
        onFeatureClick={noop}
        onMultiFeatureClick={noop}
      />
    );

    expect(readFeaturesMock).toHaveBeenCalledTimes(1);
  });
});
