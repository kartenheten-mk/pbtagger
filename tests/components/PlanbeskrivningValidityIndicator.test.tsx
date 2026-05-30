/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PlanbeskrivningValidityIndicator } from '../../src/components/PlanbeskrivningValidityIndicator';
import { useDocumentStore } from '../../src/store/useDocumentStore';
import type { Tag } from '../../src/types';

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    uuid: '2406238e-b2f0-4af5-953d-3cfcd7884694',
    categoryId: 'detaljplanens-syfte--syfte',
    targetType: 'text',
    text: 'Testad informationsrad',
    paragraphIndex: 0,
    startOffset: 0,
    endOffset: 24,
    createdAt: '2026-05-30T10:00:00.000Z',
    ...overrides,
  };
}

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
  });
  useDocumentStore.temporal.getState().clear();
}

describe('PlanbeskrivningValidityIndicator', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    resetStore();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('uses blue info status and lists informational fallback issues', () => {
    useDocumentStore.setState({
      tags: [makeTag()],
      geometries: [],
    });

    render(<PlanbeskrivningValidityIndicator />);

    act(() => {
      vi.advanceTimersByTime(600);
    });

    const button = screen.getByRole('button', {
      name: 'Inga fel eller varningar. 1 informationspost.',
    });
    expect(button.className).toContain('text-blue-600');

    fireEvent.click(button);

    expect(screen.getByText('Information (1)')).toBeTruthy();
    expect(screen.getByText(/will use <planomrade>Ja<\/planomrade> as fallback/)).toBeTruthy();
    expect(screen.queryByText(/Varningar/)).toBeNull();
  });

  it('lists motiv fallback issues under warnings', () => {
    useDocumentStore.setState({
      tags: [
        makeTag({
          categoryId: 'motiv-till-detaljplanens-regleringar--motiv-till-reglering',
          planbeskrivningImportedPlanomrade: true,
        }),
      ],
      geometries: [],
    });

    render(<PlanbeskrivningValidityIndicator />);

    act(() => {
      vi.advanceTimersByTime(600);
    });

    const button = screen.getByRole('button', {
      name: 'Inga blockerande exportfel. 1 varning(ar).',
    });
    expect(button.className).toContain('text-amber-600');

    fireEvent.click(button);

    expect(screen.getByText('Varningar (1)')).toBeTruthy();
    expect(screen.getByText(/imported DOCX Planbeskrivning XML/)).toBeTruthy();
    expect(screen.queryByText(/Information/)).toBeNull();
  });
});
