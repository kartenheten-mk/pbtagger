/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { GeometryPanel } from '../../src/geometry/GeometryPanel';
import { useDocumentStore } from '../../src/store/useDocumentStore';
import type { AppConfig, Geometry, Tag, WmsBackgroundMap } from '../../src/types';
import { generateBookmarkName } from '../../src/docx/bookmarkUtils';
import { buildDefaultAppConfig } from '../../src/config/appConfig';

const { mapViewRenderMock } = vi.hoisted(() => ({
  mapViewRenderMock: vi.fn(),
}));

vi.mock('../../src/geometry/MapView', () => ({
  MapView: ({
    geometries,
    selectedGeometryUuids,
    pendingGeometryUuids = [],
    previewGeometryUuid,
    backgroundMap,
    onFeatureClick,
    onMultiFeatureClick,
  }: {
    geometries: Geometry[];
    backgroundMap?: WmsBackgroundMap | null;
    selectedGeometryUuids: string[];
    pendingGeometryUuids?: string[];
    previewGeometryUuid?: string | null;
    onFeatureClick: (uuid: string) => void;
    onMultiFeatureClick: (
      items: Array<{
        uuid: string;
        name: string;
        featureType?: string;
        color: string;
        isChecked: boolean;
      }>,
      x: number,
      y: number
    ) => void;
  }) => {
    mapViewRenderMock({ geometries, selectedGeometryUuids, pendingGeometryUuids, previewGeometryUuid, backgroundMap });

    return (
      <div
        data-testid="mock-map-view"
        data-geometry-uuids={geometries.map((geometry) => geometry.uuid).join(',')}
        data-selected-uuids={selectedGeometryUuids.join(',')}
        data-pending-uuids={pendingGeometryUuids.join(',')}
        data-preview-uuid={previewGeometryUuid ?? ''}
      >
        {geometries.map((geometry) => (
          <button
            key={geometry.uuid}
            type="button"
            onClick={() => onFeatureClick(geometry.uuid)}
          >
            map-select-{geometry.uuid}
          </button>
        ))}
        {geometries.length >= 2 && (
          <button
            type="button"
            onClick={() =>
              onMultiFeatureClick(
                geometries.slice(0, 2).map((geometry) => ({
                  uuid: geometry.uuid,
                  name: geometry.name,
                  featureType: geometry.featureType,
                  color: '#3b82f6',
                  isChecked:
                    selectedGeometryUuids.includes(geometry.uuid) ||
                    pendingGeometryUuids.includes(geometry.uuid),
                })),
                24,
                16
              )
            }
          >
            open-overlap-picker
          </button>
        )}
      </div>
    );
  },
}));

function makeGeometry(uuid: string, name: string): Geometry {
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
    featureType: 'detaljplan',
    properties: {},
  };
}

function makeDocxGmlGeometry(uuid: string, name: string): Geometry {
  return {
    ...makeGeometry(uuid, name),
    source: 'docx_gml',
    featureType: 'planbeskrivning',
  };
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    uuid: 'tag-1',
    categoryId: 'detaljplanens-syfte--syfte',
    targetType: 'text',
    text: 'Markerad tagg',
    paragraphIndex: 0,
    startOffset: 0,
    endOffset: 9,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function resetStore(
  geometries: Geometry[],
  {
    appConfig = buildDefaultAppConfig(),
    tags = [],
    selectedTagUuid = null,
  }: {
    appConfig?: AppConfig;
    tags?: Tag[];
    selectedTagUuid?: string | null;
  } = {}
) {
  useDocumentStore.setState({
    documentId: null,
    zipBuffer: null,
    docModel: null,
    fileName: '',
    tags,
    geometries,
    selectedTagUuid,
    linkingTagUuid: null,
    pendingSelection: null,
    showTags: true,
    activeGeometryDocId: null,
    planbeskrivningConfig: null,
    enforcePlanbeskrivningCompliance: true,
    appConfig,
  });
}

function getGeometryRow(uuid: string, container: HTMLElement): HTMLElement {
  const row = container.querySelector<HTMLElement>(`[data-geometry-uuid="${uuid}"] > div`);
  if (!row) {
    throw new Error(`Geometry row ${uuid} not found`);
  }
  return row;
}

function expectScrolledToGeometry(uuid: string, container: HTMLElement) {
  const scrollIntoViewMock = vi.mocked(Element.prototype.scrollIntoView);
  const row = container.querySelector<HTMLElement>(`[data-geometry-uuid="${uuid}"]`);
  expect(row).toBeTruthy();
  expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });
  expect(scrollIntoViewMock.mock.contexts[scrollIntoViewMock.mock.contexts.length - 1]).toBe(row);
}

function hasExactText(expected: string) {
  return (_: string, element: Element | null) =>
    element?.textContent === expected &&
    Array.from(element.children).every((child) => child.textContent !== expected);
}

function openDocumentGeometryCheck() {
  fireEvent.click(screen.getByRole('button', { name: 'Dokumentkontroll' }));
}

function getMapGeometryUuids(): string[] {
  const raw = screen.getByTestId('mock-map-view').getAttribute('data-geometry-uuids') ?? '';
  return raw ? raw.split(',') : [];
}

function getWmsLayerOrder(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-wms-layer-name]'))
    .map((element) => element.dataset.wmsLayerName ?? '');
}

function addManualWmsLayer(layerName: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Lägg till lager' }));
  fireEvent.change(screen.getByLabelText('Nytt lagernamn'), {
    target: { value: layerName },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }));
}

describe('GeometryPanel unlinked geometry selection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    mapViewRenderMock.mockClear();
    resetStore([
      makeGeometry('geo-a', 'Unlinked A'),
      makeGeometry('geo-b', 'Unlinked B'),
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it('highlights the map selection when clicking an unlinked geometry row', () => {
    const { container } = render(<GeometryPanel />);

    fireEvent.click(screen.getByText('Unlinked A'));

    expect(screen.getByTestId('mock-map-view').getAttribute('data-selected-uuids')).toBe(
      'geo-a'
    );
    expect(getGeometryRow('geo-a', container).className).toContain('bg-blue-50');
    expect(useDocumentStore.getState().selectedTagUuid).toBeNull();
  });

  it('does not rerender the map for unrelated store updates', () => {
    render(<GeometryPanel />);
    mapViewRenderMock.mockClear();

    act(() => {
      useDocumentStore.setState({ fileName: 'renamed.docx' });
    });

    expect(mapViewRenderMock).not.toHaveBeenCalled();
  });

  it('highlights the list row when clicking an unlinked geometry in the map', () => {
    const { container } = render(<GeometryPanel />);
    vi.mocked(Element.prototype.scrollIntoView).mockClear();

    fireEvent.click(screen.getByText('map-select-geo-b'));

    expect(screen.getByTestId('mock-map-view').getAttribute('data-selected-uuids')).toBe(
      'geo-b'
    );
    expect(getGeometryRow('geo-b', container).className).toContain('bg-blue-50');
    expectScrolledToGeometry('geo-b', container);
    expect(useDocumentStore.getState().selectedTagUuid).toBeNull();
  });

  it('uses the overlap picker path for unlinked geometries just like a direct map click', () => {
    const { container } = render(<GeometryPanel />);
    vi.mocked(Element.prototype.scrollIntoView).mockClear();

    fireEvent.click(screen.getByText('open-overlap-picker'));
    fireEvent.click(screen.getByRole('button', { name: /Unlinked B/ }));

    expect(screen.getByTestId('mock-map-view').getAttribute('data-selected-uuids')).toBe(
      'geo-b'
    );
    expect(getGeometryRow('geo-b', container).className).toContain('bg-blue-50');
    expectScrolledToGeometry('geo-b', container);
    expect(useDocumentStore.getState().selectedTagUuid).toBeNull();
  });

  it('scrolls to a geometry selected from the map while linking', () => {
    const tag = makeTag();
    resetStore(
      [
        makeGeometry('geo-a', 'Unlinked A'),
        makeGeometry('geo-b', 'Unlinked B'),
      ],
      {
        tags: [tag],
      }
    );
    useDocumentStore.setState({ linkingTagUuid: tag.uuid });
    const { container } = render(<GeometryPanel />);
    vi.mocked(Element.prototype.scrollIntoView).mockClear();

    fireEvent.click(screen.getByText('map-select-geo-b'));

    expect(getGeometryRow('geo-b', container).className).toContain('bg-emerald-50');
    expect(screen.getByTestId('mock-map-view').getAttribute('data-pending-uuids')).toBe(
      'geo-b'
    );
    expect(useDocumentStore.getState().tags[0].geometryIds).toBeUndefined();
    expectScrolledToGeometry('geo-b', container);
  });

  it('keeps the untagged filter on committed links until linking is confirmed', () => {
    const tag = makeTag({ uuid: 'tag-to-link' });
    resetStore(
      [
        makeGeometry('geo-a', 'Unlinked A'),
        makeGeometry('geo-b', 'Unlinked B'),
      ],
      {
        tags: [tag],
      }
    );

    render(<GeometryPanel />);

    fireEvent.click(screen.getByRole('button', { name: /^Otaggade\s*2$/ }));

    act(() => {
      useDocumentStore.setState({ linkingTagUuid: tag.uuid });
    });

    fireEvent.click(screen.getByText('map-select-geo-b'));

    expect(screen.getByText('Unlinked B')).toBeTruthy();
    expect(getMapGeometryUuids()).toEqual(['geo-a', 'geo-b']);
    expect(screen.getByTestId('mock-map-view').getAttribute('data-pending-uuids')).toBe(
      'geo-b'
    );
    expect(useDocumentStore.getState().tags[0].geometryIds).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Länka' }));

    expect(useDocumentStore.getState().tags[0].geometryIds).toEqual(['geo-b']);
    expect(screen.queryByText('Unlinked B')).toBeNull();
    expect(screen.getByText('Unlinked A')).toBeTruthy();
    expect(getMapGeometryUuids()).toEqual(['geo-a']);
    expect(screen.getByRole('button', { name: /^Otaggade\s*1$/ }).getAttribute('aria-pressed')).toBe(
      'true'
    );
  });

  it('previews an overlap picker geometry on hover without selecting it', () => {
    render(<GeometryPanel />);

    fireEvent.click(screen.getByText('open-overlap-picker'));
    fireEvent.pointerEnter(screen.getByRole('button', { name: /Unlinked B/ }));

    const map = screen.getByTestId('mock-map-view');
    expect(map.getAttribute('data-preview-uuid')).toBe('geo-b');
    expect(map.getAttribute('data-selected-uuids')).toBe('');
    expect(useDocumentStore.getState().selectedTagUuid).toBeNull();
  });

  it('clears the overlap picker preview on pointer leave and close', () => {
    render(<GeometryPanel />);

    fireEvent.click(screen.getByText('open-overlap-picker'));
    const unlinkedB = screen.getByRole('button', { name: /Unlinked B/ });
    fireEvent.pointerEnter(unlinkedB);
    fireEvent.pointerLeave(unlinkedB);

    expect(screen.getByTestId('mock-map-view').getAttribute('data-preview-uuid')).toBe('');

    fireEvent.pointerEnter(screen.getByRole('button', { name: /Unlinked A/ }));
    expect(screen.getByTestId('mock-map-view').getAttribute('data-preview-uuid')).toBe('geo-a');

    fireEvent.click(screen.getByRole('button', { name: 'Stäng geometriväljare' }));
    expect(screen.getByTestId('mock-map-view').getAttribute('data-preview-uuid')).toBe('');
  });

  it('hides JSON map subtitles and linked summary in JSON mode', () => {
    resetStore(
      [
        makeGeometry('geo-a', 'Linked A'),
        makeGeometry('geo-b', 'Linked B'),
        makeGeometry('geo-c', 'Linked C'),
      ],
      {
        tags: [
          makeTag({ geometryIds: ['geo-a', 'geo-b'] }),
          makeTag({ uuid: 'tag-2', geometryIds: ['geo-a', 'missing-geo'] }),
        ],
        selectedTagUuid: 'tag-1',
      }
    );

    const { container } = render(<GeometryPanel />);

    expect(screen.getByRole('heading', { name: 'Karta' })).toBeTruthy();
    expect(screen.queryByText(hasExactText('2 av 3 geometrier är länkade'))).toBeNull();
    expect(screen.queryByText(hasExactText('JSON · 3 visade'))).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fler geometrier' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dokumentkontroll' })).toBeNull();
    expect(screen.queryByText('GML PREVIEW')).toBeNull();
    expect(screen.queryByText('GML DOCX')).toBeNull();
    expect(container.textContent).not.toContain('Delta');
    expect(container.textContent).not.toContain('JSON-länkar');
    expect(container.textContent).not.toContain('Vald tagg');
    expect(container.textContent).not.toContain('Preview-GML');
  });

  it('opens map settings, saves a WMS background, and falls back to OSM when it is removed', async () => {
    render(<GeometryPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Kartinställningar' }));

    expect(screen.getByRole('dialog', { name: 'Kartinställningar' })).toBeTruthy();
    expect(
      screen.getByText(
        /Översta lagret i listan hamnar överst i kartan\./
      )
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Namn'), {
      target: { value: 'Kommun WMS' },
    });
    fireEvent.change(screen.getByLabelText('WMS-adress'), {
      target: { value: 'https://example.test/wms' },
    });
    addManualWmsLayer('layer_a');
    addManualWmsLayer('layer_b');
    fireEvent.click(screen.getByRole('button', { name: 'Spara karta' }));

    await waitFor(() => {
      expect(useDocumentStore.getState().appConfig.map.backgroundMaps).toHaveLength(1);
    });

    let lastRender = mapViewRenderMock.mock.calls[mapViewRenderMock.mock.calls.length - 1][0];
    expect(lastRender.backgroundMap?.name).toBe('Kommun WMS');
    expect(lastRender.backgroundMap?.layers).toEqual(['layer_a', 'layer_b']);

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort Kommun WMS' }));

    await waitFor(() => {
      expect(useDocumentStore.getState().appConfig.map.backgroundMaps).toHaveLength(0);
    });

    lastRender = mapViewRenderMock.mock.calls[mapViewRenderMock.mock.calls.length - 1][0];
    expect(lastRender.backgroundMap).toBeNull();
  });

  it('imports only WMS map config from config.json', async () => {
    const existingConfig: AppConfig = {
      ...buildDefaultAppConfig(),
      categories: {
        customGroups: [
          {
            temaId: 'genomforandefragor',
            id: 'egen-grupp',
            name: 'Egen grupp',
            undergrupper: [],
          },
        ],
        customUndergroups: [],
      },
    };
    resetStore([makeGeometry('geo-a', 'Unlinked A')], { appConfig: existingConfig });
    const { container } = render(<GeometryPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Kartinställningar' }));

    const input = container.querySelector<HTMLInputElement>('[data-testid="map-config-file-input"]');
    expect(input).toBeTruthy();

    fireEvent.change(input!, {
      target: {
        files: [
          new File([
            JSON.stringify({
              version: 1,
              map: {
                activeBackgroundMapId: 'imported-wms',
                backgroundMaps: [
                  {
                    id: 'imported-wms',
                    type: 'wms',
                    name: 'Importerad WMS',
                    url: 'https://example.test/imported-wms',
                    layers: ['imported_layer'],
                  },
                ],
              },
              categories: {
                customGroups: 'invalid',
                customUndergroups: [],
              },
            }),
          ], 'config.json', { type: 'application/json' }),
        ],
      },
    });

    await waitFor(() => {
      expect(useDocumentStore.getState().appConfig.map.backgroundMaps[0].id).toBe(
        'imported-wms'
      );
    });

    expect(useDocumentStore.getState().appConfig.categories).toEqual(existingConfig.categories);
    expect(screen.getAllByText('Importerad WMS').length).toBeGreaterThan(0);

    const lastRender = mapViewRenderMock.mock.calls[mapViewRenderMock.mock.calls.length - 1][0];
    expect(lastRender.backgroundMap?.name).toBe('Importerad WMS');
  });

  it('fetches WMS capabilities, filters available layers, and selects a layer into the draft', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(`<?xml version="1.0"?>
        <WMS_Capabilities>
          <Capability>
            <Layer>
              <Title>Root</Title>
              <Layer>
                <Name>workspace:plan</Name>
                <Title>Detaljplan</Title>
              </Layer>
              <Layer>
                <Name>workspace:ortho</Name>
                <Title>Ortofoto</Title>
              </Layer>
            </Layer>
          </Capability>
        </WMS_Capabilities>`),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<GeometryPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Kartinställningar' }));
    fireEvent.change(screen.getByLabelText('Namn'), {
      target: { value: 'Kommun WMS' },
    });
    fireEvent.change(screen.getByLabelText('WMS-adress'), {
      target: { value: 'https://example.test/geoserver/wms?foo=bar' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Lägg till lager' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hämta lager från WMS' }));

    await waitFor(() => {
      expect(screen.getByText('Detaljplan')).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/geoserver/wms?foo=bar&SERVICE=WMS&REQUEST=GetCapabilities',
      expect.any(Object)
    );

    fireEvent.change(screen.getByLabelText('Sök lager'), {
      target: { value: 'orto' },
    });

    expect(screen.queryByText('Detaljplan')).toBeNull();
    expect(screen.getByText('Ortofoto')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Ortofoto/ }));
    expect(getWmsLayerOrder()).toEqual(['workspace:ortho']);
    expect(screen.queryByLabelText('Nytt lagernamn')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Spara karta' }));

    await waitFor(() => {
      expect(useDocumentStore.getState().appConfig.map.backgroundMaps[0]?.layers).toEqual([
        'workspace:ortho',
      ]);
    });
  });

  it('reorders selected WMS layers with arrow controls before saving', async () => {
    render(<GeometryPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Kartinställningar' }));
    fireEvent.change(screen.getByLabelText('Namn'), {
      target: { value: 'Kommun WMS' },
    });
    fireEvent.change(screen.getByLabelText('WMS-adress'), {
      target: { value: 'https://example.test/wms' },
    });
    addManualWmsLayer('bottom_layer');
    addManualWmsLayer('middle_layer');
    addManualWmsLayer('top_layer');

    fireEvent.click(screen.getByRole('button', { name: 'Flytta upp top_layer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Flytta upp top_layer' }));

    expect(getWmsLayerOrder()).toEqual(['top_layer', 'bottom_layer', 'middle_layer']);

    fireEvent.click(screen.getByRole('button', { name: 'Flytta ner top_layer' }));
    expect(getWmsLayerOrder()).toEqual(['bottom_layer', 'top_layer', 'middle_layer']);

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort middle_layer' }));
    expect(getWmsLayerOrder()).toEqual(['bottom_layer', 'top_layer']);

    fireEvent.click(screen.getByRole('button', { name: 'Spara karta' }));

    await waitFor(() => {
      expect(useDocumentStore.getState().appConfig.map.backgroundMaps[0]?.layers).toEqual([
        'bottom_layer',
        'top_layer',
      ]);
    });
  }, 10000);

  it('validates WMS map settings before saving', () => {
    render(<GeometryPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Kartinställningar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spara karta' }));

    expect(screen.getByText('Ange ett namn.')).toBeTruthy();
    expect(screen.getByText('Ange en WMS-adress.')).toBeTruthy();
    expect(screen.getByText('Ange minst ett lagernamn.')).toBeTruthy();
    expect(useDocumentStore.getState().appConfig.map.backgroundMaps).toHaveLength(0);
  });

  it('filters JSON geometries by tagged status in both map and list', () => {
    resetStore(
      [
        makeGeometry('geo-a', 'Linked A'),
        makeGeometry('geo-b', 'Linked B'),
        makeGeometry('geo-c', 'Unlinked C'),
      ],
      {
        tags: [
          makeTag({ geometryIds: ['geo-a', 'geo-b'] }),
        ],
      }
    );

    render(<GeometryPanel />);

    fireEvent.click(screen.getByRole('button', { name: /^Taggade\s*2$/ }));

    expect(screen.getByText('Linked A')).toBeTruthy();
    expect(screen.getByText('Linked B')).toBeTruthy();
    expect(screen.queryByText('Unlinked C')).toBeNull();
    expect(getMapGeometryUuids()).toEqual(['geo-a', 'geo-b']);
    expect(screen.queryByText(hasExactText('JSON · 2 visade'))).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Otaggade\s*1$/ }));

    expect(screen.queryByText('Linked A')).toBeNull();
    expect(screen.queryByText('Linked B')).toBeNull();
    expect(screen.getByText('Unlinked C')).toBeTruthy();
    expect(getMapGeometryUuids()).toEqual(['geo-c']);
    expect(screen.queryByText(hasExactText('JSON · 1 visade'))).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Alla\s*3$/ }));

    expect(screen.getByText('Linked A')).toBeTruthy();
    expect(screen.getByText('Linked B')).toBeTruthy();
    expect(screen.getByText('Unlinked C')).toBeTruthy();
    expect(getMapGeometryUuids()).toEqual(['geo-a', 'geo-b', 'geo-c']);
  });

  it('resets the untagged filter when a selected tag focuses a linked geometry', async () => {
    const tag = makeTag({
      uuid: 'tag-linked',
      geometryIds: ['geo-a'],
    });
    resetStore(
      [
        makeGeometry('geo-a', 'Linked A'),
        makeGeometry('geo-b', 'Unlinked B'),
      ],
      {
        tags: [tag],
      }
    );

    render(<GeometryPanel />);

    fireEvent.click(screen.getByRole('button', { name: /^Otaggade\s*1$/ }));
    expect(screen.queryByText('Linked A')).toBeNull();
    expect(screen.getByText('Unlinked B')).toBeTruthy();

    act(() => {
      useDocumentStore.setState({ selectedTagUuid: tag.uuid });
    });

    await waitFor(() => {
      expect(screen.getByText('Linked A')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /^Alla\s*2$/ }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(getMapGeometryUuids()).toEqual(['geo-a', 'geo-b']);
  });

  it('expands every geometry row linked to the selected tag', async () => {
    const tag = makeTag({
      uuid: 'tag-multi-geometry',
      text: 'Selected multi geometry tag',
      geometryIds: ['geo-a', 'geo-b'],
    });
    resetStore(
      [
        makeGeometry('geo-a', 'Linked A'),
        makeGeometry('geo-b', 'Linked B'),
        makeGeometry('geo-c', 'Unlinked C'),
      ],
      {
        tags: [tag],
        selectedTagUuid: tag.uuid,
      }
    );

    render(<GeometryPanel />);

    await waitFor(() => {
      expect(screen.getAllByText('Selected multi geometry tag')).toHaveLength(2);
    });
    expect(screen.getByTestId('mock-map-view').getAttribute('data-selected-uuids'))
      .toBe('geo-a,geo-b');
  });

  it('expands every geometry row when clicking a linked tag in the geometry list', async () => {
    const tag = makeTag({
      uuid: 'tag-multi-geometry',
      text: 'Selected multi geometry tag',
      geometryIds: ['geo-a', 'geo-b'],
    });
    resetStore(
      [
        makeGeometry('geo-a', 'Linked A'),
        makeGeometry('geo-b', 'Linked B'),
        makeGeometry('geo-c', 'Unlinked C'),
      ],
      {
        tags: [tag],
      }
    );

    render(<GeometryPanel />);

    fireEvent.click(screen.getByText('Linked A'));
    fireEvent.click(screen.getAllByText('Selected multi geometry tag')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('Selected multi geometry tag')).toHaveLength(2);
    });
    expect(useDocumentStore.getState().selectedTagUuid).toBe(tag.uuid);
    expect(screen.getByTestId('mock-map-view').getAttribute('data-selected-uuids'))
      .toBe('geo-a,geo-b');
  });

  it('hides the JSON linked summary in document-check mode without preview controls', () => {
    resetStore(
      [
        makeDocxGmlGeometry('docx-1', 'Imported A'),
      ],
      {
        tags: [makeTag({ geometryIds: ['docx-1'] })],
      }
    );

    render(<GeometryPanel />);

    expect(screen.queryByRole('button', { name: 'Tillgängliga geometrier' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dokumentkontroll' })).toBeTruthy();

    expect(screen.queryByText(hasExactText('0 av 0 geometrier är länkade'))).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Imported DOCX' })).toBeNull();
    expect(
      screen.queryByText(hasExactText('1 geometrier finns redan i dokumentet'))
    ).toBeNull();
  });

  it('auto-selects document-check mode when only imported DOCX GML exists', () => {
    resetStore([
      makeDocxGmlGeometry('docx-1', 'Imported A'),
    ]);

    render(<GeometryPanel />);

    expect(screen.queryByRole('button', { name: 'Tillgängliga geometrier' })).toBeNull();
    expect(screen.queryByText(hasExactText('0 av 0 geometrier är länkade'))).toBeNull();
    expect(screen.queryByText(hasExactText('1 geometrier finns redan i dokumentet'))).toBeNull();
    expect(screen.getByText('map-select-docx-1')).toBeTruthy();
  });

  it('uses mirrored document-check links for tagged and untagged status filters', () => {
    const tag = makeTag({
      uuid: '11111111-2222-3333-4444-555555555555',
      geometryIds: ['stale-json-1'],
    });
    resetStore(
      [
        {
          ...makeDocxGmlGeometry('docx-linked', 'Mirrored GML'),
          properties: { identitet: generateBookmarkName(tag) },
        },
        makeDocxGmlGeometry('docx-unlinked', 'Unlinked GML'),
      ],
      {
        tags: [tag],
      }
    );

    render(<GeometryPanel />);

    fireEvent.click(screen.getByRole('button', { name: /^Taggade\s*1$/ }));

    expect(screen.queryByText('Unlinked GML')).toBeNull();
    expect(getMapGeometryUuids()).toEqual(['docx-linked']);

    fireEvent.click(screen.getByRole('button', { name: /^Otaggade\s*1$/ }));

    expect(screen.queryByText('map-select-docx-linked')).toBeNull();
    expect(screen.getByText('Unlinked GML')).toBeTruthy();
    expect(getMapGeometryUuids()).toEqual(['docx-unlinked']);
  });

  it('groups identical DOCX GML shapes into one list row with multiple linked tags', () => {
    resetStore(
      [
        {
          ...makeDocxGmlGeometry('docx-a', 'Tag A GML'),
          properties: { identitet: 'TagAIdentitet' },
        },
        {
          ...makeDocxGmlGeometry('docx-b', 'Tag B GML'),
          properties: { identitet: 'TagBIdentitet' },
        },
      ],
      {
        tags: [
          makeTag({ uuid: 'tag-a', text: 'First linked tag', geometryIds: ['docx-a'] }),
          makeTag({ uuid: 'tag-b', text: 'Second linked tag', geometryIds: ['docx-b'] }),
        ],
      }
    );

    render(<GeometryPanel />);

    expect(screen.getByText('TagAIdentitet')).toBeTruthy();
    expect(screen.queryByText('TagBIdentitet')).toBeNull();
    expect(screen.getByText(/2 GML-objekt/)).toBeTruthy();
    expect(screen.getByText(/2 taggar/)).toBeTruthy();

    fireEvent.click(screen.getByText('TagAIdentitet'));

    expect(screen.getByTestId('mock-map-view').getAttribute('data-selected-uuids'))
      .toContain('docx-a');
    expect(screen.getByTestId('mock-map-view').getAttribute('data-selected-uuids'))
      .toContain('docx-b');
    expect(screen.getByText('First linked tag')).toBeTruthy();
    expect(screen.getByText('Second linked tag')).toBeTruthy();
  });

  it('hides imported-docx header count when using document-check mode', () => {
    resetStore(
      [
        makeDocxGmlGeometry('docx-1', 'Imported A'),
      ],
      {
        tags: [
          makeTag({
            geometryIds: ['docx-1'],
          }),
        ],
      }
    );

    render(<GeometryPanel />);

    openDocumentGeometryCheck();

    expect(
      screen.queryByText(hasExactText('1 geometrier finns redan i dokumentet'))
    ).toBeNull();
  });

  it('also hides the GML count in the maximized modal header', () => {
    resetStore(
      [
        makeDocxGmlGeometry('docx-1', 'Imported A'),
      ],
      {
        tags: [makeTag({ geometryIds: ['docx-1'] })],
      }
    );

    render(<GeometryPanel />);

    openDocumentGeometryCheck();
    fireEvent.click(screen.getByTitle('Maximera karta'));

    expect(
      screen.queryByText(hasExactText('1 geometrier finns redan i dokumentet'))
    ).toBeNull();
  });

  it('selects the first linked tag in document order when clicking imported DOCX GML', () => {
    resetStore(
      [
        makeDocxGmlGeometry('docx-1', 'Imported A'),
      ],
      {
        tags: [
          makeTag({
            uuid: 'later-tag',
            text: 'Later tag',
            paragraphIndex: 4,
            startOffset: 0,
            endOffset: 9,
            geometryIds: ['docx-1'],
          }),
          makeTag({
            uuid: 'earlier-tag',
            text: 'Earlier tag',
            paragraphIndex: 2,
            startOffset: 0,
            endOffset: 11,
            geometryIds: ['docx-1'],
          }),
        ],
      }
    );

    render(<GeometryPanel />);

    fireEvent.click(screen.getByText('map-select-docx-1'));

    expect(useDocumentStore.getState().selectedTagUuid).toBe('earlier-tag');
    expect(screen.getByText('Earlier tag')).toBeTruthy();
    expect(screen.getByText('Later tag')).toBeTruthy();
  });

  it('selects a tag from imported DOCX GML when only stale JSON links exist', () => {
    const tag = makeTag({
      uuid: '11111111-2222-3333-4444-555555555555',
      geometryIds: ['stale-json-1'],
    });
    const identitet = generateBookmarkName(tag);
    resetStore(
      [
        {
          ...makeDocxGmlGeometry('docx-1', 'Imported from DOCX'),
          properties: { identitet },
        },
      ],
      {
        tags: [tag],
      }
    );

    render(<GeometryPanel />);

    fireEvent.click(screen.getByText('map-select-docx-1'));

    expect(useDocumentStore.getState().selectedTagUuid).toBe(tag.uuid);
  });
});
