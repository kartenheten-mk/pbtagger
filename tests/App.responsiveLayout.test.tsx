/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from '../src/App';
import { useDocumentStore } from '../src/store/useDocumentStore';
import type { DocModel } from '../src/types';
import { buildDefaultAppConfig } from '../src/config/appConfig';

vi.mock('../src/components/Header', () => ({
  Header: () => <header data-testid="header" />,
}));

vi.mock('../src/components/Sidebar', () => ({
  Sidebar: () => <aside data-testid="sidebar" />,
}));

vi.mock('../src/editor/DocViewer', () => ({
  DocViewer: () => <section data-testid="doc-viewer" />,
}));

vi.mock('../src/geometry/GeometryPanel', () => ({
  GeometryPanel: () => <section data-testid="geometry-panel" />,
}));

const docModel: DocModel = {
  paragraphs: [],
};

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

function resetStore() {
  useDocumentStore.setState({
    documentId: 'doc-1',
    zipBuffer: null,
    docModel,
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

describe('App responsive editor layout', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    setViewportWidth(1280);
    resetStore();
  });

  afterEach(() => {
    cleanup();
    setViewportWidth(1280);
  });

  it('shows both side panels on wide screens', async () => {
    setViewportWidth(1280);

    render(<App />);

    expect(await screen.findByTestId('sidebar')).toBeTruthy();
    expect(await screen.findByTestId('geometry-panel')).toBeTruthy();
    expect(screen.getByTestId('doc-viewer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Öppna Taggar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Öppna Karta/i })).toBeNull();
  });

  it('collapses the map panel before the tag panel on medium widths', async () => {
    setViewportWidth(1000);

    render(<App />);

    expect(await screen.findByTestId('sidebar')).toBeTruthy();
    expect(screen.getByTestId('doc-viewer')).toBeTruthy();
    expect(screen.queryByTestId('geometry-panel')).toBeNull();
    expect(screen.queryByRole('button', { name: /Öppna Taggar/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Öppna Karta/i })).toBeTruthy();
  });

  it('collapses both side panels earlier on narrow widths while keeping the document visible', async () => {
    setViewportWidth(880);

    render(<App />);

    expect(await screen.findByTestId('doc-viewer')).toBeTruthy();
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.queryByTestId('geometry-panel')).toBeNull();
    expect(screen.getByRole('button', { name: /Öppna Taggar/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Öppna Karta/i })).toBeTruthy();
  });
});
