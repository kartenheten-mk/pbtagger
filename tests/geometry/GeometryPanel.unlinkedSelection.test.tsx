/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { GeometryPanel } from '../../src/geometry/GeometryPanel';
import { useDocumentStore } from '../../src/store/useDocumentStore';
import type { Geometry, Tag } from '../../src/types';

vi.mock('../../src/geometry/MapView', () => ({
  MapView: ({
    geometries,
    selectedGeometryUuids,
    onFeatureClick,
    onMultiFeatureClick,
  }: {
    geometries: Geometry[];
    selectedGeometryUuids: string[];
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
      data-selected-uuids={selectedGeometryUuids.join(',')}
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
    expect(screen.queryByText('GML PREVIEW')).toBeNull();
    expect(screen.queryByText('GML DOCX')).toBeNull();
    expect(container.textContent).not.toContain('Delta');
    expect(container.textContent).not.toContain('JSON-länkar');
    expect(container.textContent).not.toContain('Vald tagg');
    expect(container.textContent).not.toContain('Preview-GML');
  });

  it('hides the JSON linked summary in GML mode while keeping GML header controls intact', () => {
    resetStore(
      [
        makeGeometry('geo-a', 'Linked A'),
        makeGeometry('geo-b', 'Linked B'),
      ],
      {
        tags: [makeTag({ geometryIds: ['geo-a'] })],
      }
    );

    render(<GeometryPanel />);

    expect(screen.getByText(hasExactText('1 av 2 geometrier är länkade'))).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'GML' }));

    expect(screen.queryByText(hasExactText('1 av 2 geometrier är länkade'))).toBeNull();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Imported DOCX' })).toBeTruthy();
    expect(screen.getByText(hasExactText('GML-preview · 1 visade'))).toBeTruthy();
  });
});
