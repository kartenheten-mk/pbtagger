/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Sidebar } from '../../../src/components/sidebar/Sidebar';
import { buildDefaultAppConfig } from '../../../src/config/appConfig';
import { flattenCategories, mergeCustomCategories } from '../../../src/data/categoryUtils';
import { useDocumentStore } from '../../../src/store/useDocumentStore';
import type { PendingSelection, Tema } from '../../../src/types';

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
});
