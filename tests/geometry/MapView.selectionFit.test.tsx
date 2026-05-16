// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { Geometry } from '../../src/types';

const { fitMock } = vi.hoisted(() => ({
  fitMock: vi.fn(),
}));

vi.mock('ol/Map', () => ({
  default: class MockMap {
    private view: { fit: typeof fitMock };
    private target: HTMLElement | undefined;

    constructor(options: { target?: HTMLElement; view: { fit: typeof fitMock } }) {
      this.target = options.target;
      this.view = options.view;
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
    constructor(_options: unknown) {}
  },
}));

vi.mock('ol/source/OSM', () => ({
  default: class MockOsm {},
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
    constructor(_options: unknown) {}
  },
  Fill: class MockFill {
    constructor(_options: unknown) {}
  },
  Stroke: class MockStroke {
    constructor(_options: unknown) {}
  },
  Circle: class MockCircle {
    constructor(_options: unknown) {}
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
});
