/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { GeometryPanel } from '../../src/geometry/GeometryPanel';
import { useDocumentStore } from '../../src/store/useDocumentStore';
import type { Geometry, Tag } from '../../src/types';
import { generateBookmarkName } from '../../src/docx/bookmarkUtils';

vi.mock('../../src/geometry/MapView', () => ({
  MapView: ({
    geometries,
    selectedGeometryUuids,
    previewGeometryUuid,
    onFeatureClick,
    onMultiFeatureClick,
  }: {
    geometries: Geometry[];
    selectedGeometryUuids: string[];
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
  }) => (
    <div
      data-testid="mock-map-view"
      data-geometry-uuids={geometries.map((geometry) => geometry.uuid).join(',')}
      data-selected-uuids={selectedGeometryUuids.join(',')}
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
                isChecked: selectedGeometryUuids.includes(geometry.uuid),
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
  ),
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
    tags = [],
    selectedTagUuid = null,
  }: {
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
  });
}

function getGeometryRow(uuid: string, container: HTMLElement): HTMLElement {
  const row = container.querySelector<HTMLElement>(`[data-geometry-uuid="${uuid}"] > div`);
  if (!row) {
    throw new Error(`Geometry row ${uuid} not found`);
  }
  return row;
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

describe('GeometryPanel unlinked geometry selection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
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

  it('highlights the list row when clicking an unlinked geometry in the map', () => {
    const { container } = render(<GeometryPanel />);

    fireEvent.click(screen.getByText('map-select-geo-b'));

    expect(screen.getByTestId('mock-map-view').getAttribute('data-selected-uuids')).toBe(
      'geo-b'
    );
    expect(getGeometryRow('geo-b', container).className).toContain('bg-blue-50');
    expect(useDocumentStore.getState().selectedTagUuid).toBeNull();
  });

  it('uses the overlap picker path for unlinked geometries just like a direct map click', () => {
    const { container } = render(<GeometryPanel />);

    fireEvent.click(screen.getByText('open-overlap-picker'));
    fireEvent.click(screen.getByRole('button', { name: /Unlinked B/ }));

    expect(screen.getByTestId('mock-map-view').getAttribute('data-selected-uuids')).toBe(
      'geo-b'
    );
    expect(getGeometryRow('geo-b', container).className).toContain('bg-blue-50');
    expect(useDocumentStore.getState().selectedTagUuid).toBeNull();
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

  it('shows a JSON linked summary using unique linked geometry count', () => {
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

    expect(screen.getByText(hasExactText('2 av 3 geometrier är länkade'))).toBeTruthy();
    expect(screen.getByText(hasExactText('JSON · 3 visade'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fler geometrier' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dokumentkontroll' })).toBeNull();
    expect(screen.queryByText('GML PREVIEW')).toBeNull();
    expect(screen.queryByText('GML DOCX')).toBeNull();
    expect(container.textContent).not.toContain('Delta');
    expect(container.textContent).not.toContain('JSON-länkar');
    expect(container.textContent).not.toContain('Vald tagg');
    expect(container.textContent).not.toContain('Preview-GML');
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
    expect(screen.getByText(hasExactText('JSON · 2 visade'))).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Otaggade\s*1$/ }));

    expect(screen.queryByText('Linked A')).toBeNull();
    expect(screen.queryByText('Linked B')).toBeNull();
    expect(screen.getByText('Unlinked C')).toBeTruthy();
    expect(getMapGeometryUuids()).toEqual(['geo-c']);
    expect(screen.getByText(hasExactText('JSON · 1 visade'))).toBeTruthy();

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
      screen.getByText(hasExactText('1 geometrier finns redan i dokumentet'))
    ).toBeTruthy();
  });

  it('auto-selects document-check mode when only imported DOCX GML exists', () => {
    resetStore([
      makeDocxGmlGeometry('docx-1', 'Imported A'),
    ]);

    render(<GeometryPanel />);

    expect(screen.queryByRole('button', { name: 'Tillgängliga geometrier' })).toBeNull();
    expect(screen.queryByText(hasExactText('0 av 0 geometrier är länkade'))).toBeNull();
    expect(screen.getByText(hasExactText('1 geometrier finns redan i dokumentet'))).toBeTruthy();
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

    expect(screen.getByText('Mirrored GML')).toBeTruthy();
    expect(screen.queryByText('Unlinked GML')).toBeNull();
    expect(getMapGeometryUuids()).toEqual(['docx-linked']);

    fireEvent.click(screen.getByRole('button', { name: /^Otaggade\s*1$/ }));

    expect(screen.queryByText('Mirrored GML')).toBeNull();
    expect(screen.getByText('Unlinked GML')).toBeTruthy();
    expect(getMapGeometryUuids()).toEqual(['docx-unlinked']);
  });

  it('shows imported-docx header copy when using document-check mode', () => {
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
      screen.getByText(hasExactText('1 geometrier finns redan i dokumentet'))
    ).toBeTruthy();
  });

  it('uses the same GML copy in the maximized modal header', () => {
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
      screen.getAllByText(hasExactText('1 geometrier finns redan i dokumentet'))
    ).toHaveLength(2);
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
