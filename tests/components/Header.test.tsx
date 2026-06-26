/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Header } from '../../src/components/Header';
import { buildDefaultAppConfig } from '../../src/config/appConfig';
import { DOCUMENTATION_URL } from '../../src/config/documentation';
import { useDocumentStore } from '../../src/store/useDocumentStore';

vi.mock('../../src/components/DataMenu', () => ({
  DataMenu: () => <button type="button">Data</button>,
}));

vi.mock('../../src/components/PlanbeskrivningValidityIndicator', () => ({
  PlanbeskrivningValidityIndicator: () => null,
}));

vi.mock('../../src/db/documentDb', () => ({
  getAllDocuments: vi.fn(async () => []),
}));

function resetStore() {
  useDocumentStore.setState({
    documentId: 'doc-1',
    zipBuffer: null,
    docModel: { paragraphs: [] },
    fileName: 'Planbeskrivning.docx',
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
  });
  useDocumentStore.temporal.getState().clear();
}

describe('Header documentation button', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    resetStore();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a button-styled external documentation link', () => {
    render(<Header onClearDocument={() => undefined} categories={[]} />);

    const documentationLink = screen.getByRole('link', { name: /Öppna dokumentation/i });
    expect(documentationLink.getAttribute('href')).toBe(DOCUMENTATION_URL);
    expect(documentationLink.getAttribute('target')).toBe('_blank');
    expect(documentationLink.getAttribute('rel')).toBe('noreferrer');
  });
});