/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DocViewer } from '../../src/editor/DocViewer';
import { flattenCategories } from '../../src/data/categoryUtils';
import { useDocumentStore } from '../../src/store/useDocumentStore';
import { buildDefaultAppConfig } from '../../src/config/appConfig';
import type { DocModel, Geometry, Tag, Tema } from '../../src/types';

const teman: Tema[] = [
  {
    id: 'detaljplanens-syfte',
    name: 'Detaljplanens syfte',
    color: '#3b82f6',
    grupper: [
      {
        id: 'syfte',
        name: 'Syfte',
        undergrupper: [],
      },
    ],
  },
];

const categories = flattenCategories(teman);

const docModel: DocModel = {
  paragraphs: [
    {
      index: 0,
      headingLevel: 0,
      runs: [{ id: 'p0_r0', text: 'Markerad tagg i dokumentet' }],
    },
  ],
};

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    uuid: 'tag-1',
    categoryId: 'detaljplanens-syfte--syfte',
    targetType: 'text',
    text: 'Markerad tagg',
    paragraphIndex: 0,
    startOffset: 0,
    endOffset: 13,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeGeometry(overrides: Partial<Geometry> = {}): Geometry {
  return {
    uuid: 'geo-1',
    name: 'Geometri 1',
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
    ...overrides,
  };
}

function resetStore(tags: Tag[], geometries: Geometry[]) {
  useDocumentStore.setState({
    documentId: 'doc-1',
    zipBuffer: null,
    docModel,
    fileName: 'test.docx',
    tags,
    geometries,
    selectedTagUuid: null,
    linkingTagUuid: null,
    pendingSelection: null,
    showTags: true,
    activeGeometryDocId: null,
    planbeskrivningConfig: null,
    enforcePlanbeskrivningCompliance: true,
    appConfig: buildDefaultAppConfig(),
  });
  useDocumentStore.temporal.getState().clear();
}

async function findTagMark(tagUuid: string): Promise<HTMLElement> {
  let mark: HTMLElement | null = null;
  await waitFor(() => {
    mark = document.querySelector<HTMLElement>(`.tag-mark[data-tag-uuid="${tagUuid}"]`);
    expect(mark).toBeTruthy();
  });
  return mark!;
}

async function findTagBadge(tagUuid: string): Promise<HTMLElement> {
  let badge: HTMLElement | null = null;
  await waitFor(() => {
    badge = document.querySelector<HTMLElement>(`.tag-badge-widget[data-tag-uuid="${tagUuid}"]`);
    expect(badge).toBeTruthy();
  });
  return badge!;
}

describe('DocViewer inline geometry link action', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the link action inside the tag badge and starts linking only after click', async () => {
    const tag = makeTag();
    resetStore([tag], [makeGeometry()]);

    render(<DocViewer docModel={docModel} categories={categories} />);

    fireEvent.mouseOver(await findTagMark(tag.uuid));
    expect(document.querySelector('.tag-link-action')).toBeNull();

    const badge = await findTagBadge(tag.uuid);
    const button = within(badge).getByRole('button', { name: 'Länka geometri' });
    expect(within(badge).getByRole('button', { name: 'Ta bort tagg' })).toBeTruthy();
    expect(button.getAttribute('title')).toBe('Länka geometri');
    expect(useDocumentStore.getState().linkingTagUuid).toBeNull();

    fireEvent.mouseDown(button);

    await waitFor(() => {
      expect(useDocumentStore.getState().selectedTagUuid).toBe(tag.uuid);
      expect(useDocumentStore.getState().linkingTagUuid).toBe(tag.uuid);
    });
  });

  it('labels the action as edit for a tag that already has geometry links', async () => {
    const tag = makeTag({ geometryIds: ['geo-1'] });
    resetStore([tag], [makeGeometry()]);

    render(<DocViewer docModel={docModel} categories={categories} />);

    const badge = await findTagBadge(tag.uuid);
    const button = within(badge).getByRole('button', { name: 'Ändra geometrier' });

    expect(button).toBeTruthy();
    expect(button.getAttribute('title')).toBe('Ändra geometrier');
  });

  it('hides only the link action when only DOCX-GML geometries are available', async () => {
    const tag = makeTag({ geometryIds: ['docx-gml-1'] });
    resetStore([
      tag,
    ], [
      makeGeometry({
        uuid: 'docx-gml-1',
        name: 'Importerad DOCX-GML',
        source: 'docx_gml',
        featureType: 'planbeskrivning',
        properties: { identitet: 'Tag_1' },
      }),
    ]);

    render(<DocViewer docModel={docModel} categories={categories} />);

    const badge = await findTagBadge(tag.uuid);

    expect(within(badge).queryByRole('button', { name: 'Ändra geometrier' })).toBeNull();
    expect(within(badge).queryByRole('button', { name: 'Länka geometri' })).toBeNull();
    expect(within(badge).getByRole('button', { name: 'Ta bort tagg' })).toBeTruthy();
    expect(useDocumentStore.getState().linkingTagUuid).toBeNull();
  });
});

describe('DocViewer search controls', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders a compact search button without the canvas hint text', async () => {
    resetStore([], []);

    render(<DocViewer docModel={docModel} categories={categories} />);

    expect(await screen.findByRole('button', { name: 'Sök i dokument' })).toBeTruthy();
    expect(screen.queryByText('Markera text och klicka bild för att skapa en tagg.')).toBeNull();
    expect(screen.queryByRole('search', { name: 'Sök i dokument' })).toBeNull();
  });

  it('opens the search bar from the compact search button', async () => {
    resetStore([], []);

    render(<DocViewer docModel={docModel} categories={categories} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Sök i dokument' }));

    expect(screen.getByRole('search', { name: 'Sök i dokument' })).toBeTruthy();
    expect(screen.getByLabelText('Söktext')).toBeTruthy();
  });

  it('opens the search bar with Ctrl+F', async () => {
    resetStore([], []);

    render(<DocViewer docModel={docModel} categories={categories} />);

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByRole('search', { name: 'Sök i dokument' })).toBeTruthy();
    });
  });
});
