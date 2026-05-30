/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ResizablePanel } from '../../src/components/ResizablePanel';

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

function resizeViewport(width: number) {
  act(() => {
    setViewportWidth(width);
  });
}

function renderPanel() {
  return render(
    <div className="flex h-screen">
      <ResizablePanel
        side="left"
        label="Taggar"
        defaultWidth={288}
        autoCollapseBelow={800}
        storageKey="test_sidebar_width"
      >
        <div>Panelinnehåll</div>
      </ResizablePanel>
      <main>Dokumenttext</main>
    </div>
  );
}

describe('ResizablePanel responsive collapse', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewportWidth(1200);
  });

  afterEach(() => {
    cleanup();
    setViewportWidth(1200);
  });

  it('renders the full panel above the responsive threshold', () => {
    setViewportWidth(900);

    renderPanel();

    expect(screen.getByText('Panelinnehåll')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Öppna Taggar/i })).toBeNull();
  });

  it('auto-collapses below the threshold without saving a manual collapse', () => {
    window.localStorage.setItem('test_sidebar_width_collapsed', 'false');
    setViewportWidth(700);

    renderPanel();

    expect(screen.queryByText('Panelinnehåll')).toBeNull();
    expect(screen.getByRole('button', { name: /Öppna Taggar/i })).toBeTruthy();
    expect(window.localStorage.getItem('test_sidebar_width_collapsed')).toBe('false');
  });

  it('opens an auto-collapsed panel as an overlay and closes it from the backdrop', () => {
    setViewportWidth(700);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Öppna Taggar/i }));

    expect(screen.getByRole('dialog', { name: 'Taggar' })).toBeTruthy();
    expect(screen.getByText('Panelinnehåll')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Stäng Taggar'));

    expect(screen.queryByRole('dialog', { name: 'Taggar' })).toBeNull();
    expect(screen.queryByText('Panelinnehåll')).toBeNull();
  });

  it('closes an auto-collapsed overlay with Escape', () => {
    setViewportWidth(700);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Öppna Taggar/i }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Taggar' })).toBeNull();
  });

  it('restores the full panel when the viewport becomes wide again', () => {
    setViewportWidth(700);
    renderPanel();

    expect(screen.queryByText('Panelinnehåll')).toBeNull();

    resizeViewport(900);

    expect(screen.getByText('Panelinnehåll')).toBeTruthy();
  });
});
