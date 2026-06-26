/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';
import { useDocumentStore } from '../src/store/useDocumentStore';
import { buildDefaultAppConfig } from '../src/config/appConfig';
import { DOCUMENTATION_URL } from '../src/config/documentation';

vi.mock('../src/components/DocumentList', () => ({
  DocumentList: () => <div data-testid="document-list" />,
}));

vi.mock('../src/components/Header', () => ({
  Header: () => <header data-testid="header" />,
}));

vi.mock('../src/components/Sidebar', () => ({
  Sidebar: () => <aside data-testid="sidebar" />,
}));

vi.mock('../src/editor/DocViewer', () => ({
  DocViewer: () => <main data-testid="doc-viewer" />,
}));

vi.mock('../src/geometry/GeometryPanel', () => ({
  GeometryPanel: () => <section data-testid="geometry-panel" />,
}));

vi.mock('../src/components/ResizablePanel', () => ({
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function resetStore() {
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
  });
  useDocumentStore.temporal.getState().clear();
}

describe('App start page project menu', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    resetStore();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows one project entry point and no separate import project card', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /Skapa projekt/i })).toBeTruthy();
    expect(screen.getByText('Tagga och länka planbeskrivningar till geometrier.')).toBeTruthy();
    const documentationLink = screen.getByRole('link', { name: /Öppna dokumentation/i });
    expect(documentationLink.getAttribute('href')).toBe(DOCUMENTATION_URL);
    expect(documentationLink.getAttribute('target')).toBe('_blank');
    expect(documentationLink.getAttribute('rel')).toBe('noreferrer');
    expect(screen.queryByText('Import Project')).toBeNull();
  });

  it('opens a dropdown from Skapa projekt', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Skapa projekt/i }));

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Skapa nytt projekt/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Importera existerande projekt/i })).toBeTruthy();
  });

  it('opens the create project modal from the dropdown', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Skapa projekt/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Skapa nytt projekt/i }));

    expect(screen.getByRole('heading', { name: 'Skapa nytt projekt' })).toBeTruthy();
  });

  it('triggers the hidden .pbproject input from the import dropdown item', () => {
    const inputClick = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Skapa projekt/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Importera existerande projekt/i }));

    expect(inputClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
