/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DocumentList } from '../../src/components/DocumentList';
import { getAllDocuments } from '../../src/db/documentDb';
import type { SavedDocumentMeta } from '../../src/db/documentDb';

vi.mock('../../src/db/documentDb', () => ({
  getAllDocuments: vi.fn(),
  deleteDocument: vi.fn(),
}));

const mockGetAllDocuments = vi.mocked(getAllDocuments);

function hasExactText(expected: string) {
  return (_: string, element: Element | null) =>
    element?.textContent === expected &&
    Array.from(element.children).every((child) => child.textContent !== expected);
}

describe('DocumentList start page copy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the empty state in Swedish', async () => {
    mockGetAllDocuments.mockResolvedValue([]);

    render(<DocumentList />);

    expect(await screen.findByText('Inga projekt hittades. Skapa ett för att komma igång!')).toBeTruthy();
  });

  it('shows project list labels in Swedish', async () => {
    const doc: SavedDocumentMeta = {
      id: 'doc-1',
      fileName: 'Planbeskrivning.docx',
      tagCount: 3,
      geometryCount: 2,
      createdAt: '2026-05-15T10:00:00.000Z',
      updatedAt: '2026-05-15T11:00:00.000Z',
    };
    mockGetAllDocuments.mockResolvedValue([doc]);

    render(<DocumentList />);

    expect(await screen.findByText('Projektgalleri')).toBeTruthy();
    expect(screen.getByText('Projektstatistik')).toBeTruthy();
    expect(screen.getByText(hasExactText('3 taggar'))).toBeTruthy();
    expect(screen.getByText(hasExactText('2 geometrier'))).toBeTruthy();
    expect(screen.getByText(/Skapat:/)).toBeTruthy();
    expect(screen.getByTitle('Ta bort projekt')).toBeTruthy();
  });
});
