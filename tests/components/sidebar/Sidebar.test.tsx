/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Sidebar } from '../../../src/components/sidebar/Sidebar';
import { buildDefaultAppConfig } from '../../../src/config/appConfig';
import { flattenCategories, mergeCustomCategories } from '../../../src/data/categoryUtils';
import { useDocumentStore } from '../../../src/store/useDocumentStore';
import type { AppConfig, PendingSelection, Tag, Tema } from '../../../src/types';

const builtInTeman: Tema[] = [
  {
    id: 'genomforandefragor',
    name: 'Genomförandefrågor',
    color: '#8b5cf6',
    grupper: [
      {
        id: 'fastighetsrattsliga-fragor',
        name: 'Fastighetsrättsliga frågor',
        undergrupper: [
          { id: 'rattigheter', name: 'Rättigheter' },
        ],
      },
    ],
  },
];

function makePendingSelection(): PendingSelection[] {
  return [
    {
      type: 'text',
      text: 'Markerad text',
      paragraphIndex: 0,
      startOffset: 0,
      endOffset: 13,
    },
  ];
}

function makeTag(uuid: string): Tag {
  return {
    uuid,
    categoryId: 'genomforandefragor--fastighetsrattsliga-fragor',
    targetType: 'text',
    text: 'Markerad text',
    paragraphIndex: 0,
    startOffset: 0,
    endOffset: 13,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function resetStore(overrides: Partial<ReturnType<typeof useDocumentStore.getState>> = {}) {
  useDocumentStore.setState({
    documentId: null,
    zipBuffer: null,
    docModel: null,
    fileName: '',
    tags: [],
    geometries: [],
    selectedTagUuid: null,
    linkingTagUuid: null,
    pendingSelection: null,
    showTags: true,
    activeGeometryDocId: null,
    planbeskrivningConfig: null,
    enforcePlanbeskrivningCompliance: true,
    appConfig: buildDefaultAppConfig(),
    ...overrides,
  });
  useDocumentStore.temporal.getState().clear();
}

function SidebarHarness() {
  const appConfig = useDocumentStore((state) => state.appConfig);
  const teman = mergeCustomCategories(builtInTeman, appConfig.categories);
  const categories = flattenCategories(teman);
  return <Sidebar teman={teman} categories={categories} />;
}

describe('Sidebar custom category footer action', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
    resetStore();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the add category button only on the assign tab', () => {
    render(<SidebarHarness />);

    expect(screen.queryByRole('button', { name: 'Lägg till kategori' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Tilldela tagg/ }));

    expect(screen.getByRole('button', { name: 'Lägg till kategori' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Visa taggar/ }));

    expect(screen.queryByRole('button', { name: 'Lägg till kategori' })).toBeNull();
  });

  it('opens the custom category modal from the footer add button', () => {
    render(<SidebarHarness />);

    fireEvent.click(screen.getByRole('button', { name: /Tilldela tagg/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till kategori' }));

    expect(screen.getByRole('dialog', { name: 'Lägg till kategori' })).toBeTruthy();
  });

  it('clears all tags from the view tab after confirmation', () => {
    resetStore({
      tags: [makeTag('tag-1'), makeTag('tag-2')],
      selectedTagUuid: 'tag-1',
      linkingTagUuid: 'tag-2',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SidebarHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Rensa alla taggar' }));

    expect(useDocumentStore.getState().tags).toEqual([]);
    expect(useDocumentStore.getState().selectedTagUuid).toBeNull();
    expect(useDocumentStore.getState().linkingTagUuid).toBeNull();
  });

  it('selects a newly created custom group for the pending tag', async () => {
    resetStore({ pendingSelection: makePendingSelection() });
    render(<SidebarHarness />);

    const addButton = await screen.findByRole('button', { name: 'Lägg till kategori' });
    fireEvent.click(addButton);
    fireEvent.change(screen.getByLabelText('Namn'), {
      target: { value: 'Egen grupp' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Spara' }));

    await waitFor(() => {
      expect(screen.getByText('Genomförandefrågor › Egen grupp')).toBeTruthy();
    });

    const assignButtons = screen.getAllByRole('button', { name: 'Tilldela tagg' });
    fireEvent.click(assignButtons[assignButtons.length - 1]);

    expect(useDocumentStore.getState().tags[0].categoryId).toBe(
      'genomforandefragor--egen-grupp'
    );
  });

  it('imports only custom category config from config.json', async () => {
    const existingConfig: AppConfig = {
      ...buildDefaultAppConfig(),
      map: {
        activeBackgroundMapId: 'existing-wms',
        backgroundMaps: [
          {
            id: 'existing-wms',
            type: 'wms',
            name: 'Befintlig WMS',
            url: 'https://example.test/existing-wms',
            layers: ['existing_layer'],
          },
        ],
      },
      categories: {
        customGroups: [
          {
            temaId: 'genomforandefragor',
            id: 'gammal-grupp',
            name: 'Gammal grupp',
            undergrupper: [],
          },
        ],
        customUndergroups: [],
      },
    };
    resetStore({
      fileName: 'Keep.docx',
      pendingSelection: makePendingSelection(),
      appConfig: existingConfig,
    });
    const { container } = render(<SidebarHarness />);

    const input = container.querySelector<HTMLInputElement>('[data-testid="category-config-file-input"]');
    expect(input).toBeTruthy();

    fireEvent.change(input!, {
      target: {
        files: [
          new File([
            JSON.stringify({
              version: 1,
              map: {
                activeBackgroundMapId: null,
                backgroundMaps: [
                  {
                    id: 'invalid-map',
                    type: 'wms',
                    name: 'Invalid map',
                    url: 'ftp://example.test/wms',
                    layers: [],
                  },
                ],
              },
              categories: {
                customGroups: [
                  {
                    temaId: 'genomforandefragor',
                    id: 'importerad-grupp',
                    name: 'Importerad grupp',
                    undergrupper: [],
                  },
                ],
                customUndergroups: [],
              },
            }),
          ], 'config.json', { type: 'application/json' }),
        ],
      },
    });

    await waitFor(() => {
      expect(useDocumentStore.getState().appConfig.categories.customGroups[0].id).toBe(
        'importerad-grupp'
      );
    });

    expect(useDocumentStore.getState().appConfig.map).toEqual(existingConfig.map);
    expect(useDocumentStore.getState().fileName).toBe('Keep.docx');
    expect(screen.getByText('Taggkonfiguration importerad.')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Sök tagg...'), {
      target: { value: 'importerad' },
    });
    expect(screen.getByText('Importerad grupp')).toBeTruthy();
  });
});
