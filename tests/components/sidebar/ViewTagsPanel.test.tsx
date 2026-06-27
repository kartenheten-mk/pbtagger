/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ViewTagsPanel } from '../../../src/components/sidebar/ViewTagsPanel';
import { flattenCategories } from '../../../src/data/categoryUtils';
import { generateBookmarkName } from '../../../src/docx/bookmarkUtils';
import type { Geometry, Tag, Tema } from '../../../src/types';

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

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    uuid: '11111111-2222-3333-4444-555555555555',
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

function makeDocxGmlGeometry(uuid: string, name: string, tag: Tag): Geometry {
  return {
    ...makeGeometry(uuid, name),
    source: 'docx_gml',
    featureType: 'planbeskrivning',
    properties: { identitet: generateBookmarkName(tag) },
  };
}

function renderPanel({
  tags,
  geometries,
  onClearAllTags = vi.fn(),
  onLinkGeometry = vi.fn(),
  onUnlinkGeometry = vi.fn(),
}: {
  tags: Tag[];
  geometries: Geometry[];
  onClearAllTags?: () => void;
  onLinkGeometry?: (tagUuid: string) => void;
  onUnlinkGeometry?: (tagUuid: string, geometryUuid: string) => void;
}) {
  return render(
    <ViewTagsPanel
      teman={teman}
      tags={tags}
      categories={categories}
      geometries={geometries}
      selectedTagUuid={null}
      getCategoryById={(id) => categories.find((category) => category.id === id)}
      onSelectTag={vi.fn()}
      onRemoveTag={vi.fn()}
      onClearAllTags={onClearAllTags}
      onLinkGeometry={onLinkGeometry}
      onUnlinkGeometry={onUnlinkGeometry}
    />
  );
}

describe('ViewTagsPanel clear all tags action', () => {
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

  it('confirms before clearing all tags', () => {
    const onClearAllTags = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPanel({
      tags: [makeTag()],
      geometries: [],
      onClearAllTags,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rensa alla taggar' }));

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('Rensa alla taggar?')
    );
    expect(onClearAllTags).toHaveBeenCalledTimes(1);
  });

  it('keeps tags when the clear-all confirmation is cancelled', () => {
    const onClearAllTags = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderPanel({
      tags: [makeTag()],
      geometries: [],
      onClearAllTags,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rensa alla taggar' }));

    expect(onClearAllTags).not.toHaveBeenCalled();
  });

  it('disables the clear-all action when there are no tags', () => {
    const onClearAllTags = vi.fn();

    renderPanel({
      tags: [],
      geometries: [],
      onClearAllTags,
    });

    const button = screen.getByRole('button', { name: 'Rensa alla taggar' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(onClearAllTags).not.toHaveBeenCalled();
  });
});

describe('ViewTagsPanel DOCX-GML geometry links', () => {
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

  it('shows a mirrored DOCX-GML chip when only a stale JSON geometry id exists', () => {
    const tag = makeTag({ geometryIds: ['stale-json-1'] });
    const docxGml = makeDocxGmlGeometry('docx-gml-1', 'Imported DOCX GML', tag);

    renderPanel({ tags: [tag], geometries: [docxGml] });

    expect(screen.getByText('Imported DOCX GML')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Länka till geometrier' })).toBeNull();
  });

  it('renders mirrored DOCX-GML chips without an unlink action', () => {
    const tag = makeTag({ geometryIds: ['stale-json-1'] });
    const docxGml = makeDocxGmlGeometry('docx-gml-1', 'Read-only DOCX GML', tag);
    const onUnlinkGeometry = vi.fn();

    renderPanel({ tags: [tag], geometries: [docxGml], onUnlinkGeometry });

    expect(screen.getByText('Read-only DOCX GML')).toBeTruthy();
    expect(screen.queryByTitle('Avlänka Read-only DOCX GML')).toBeNull();
    expect(onUnlinkGeometry).not.toHaveBeenCalled();
  });

  it('hides geometry link/edit actions when only DOCX-GML geometries are loaded', () => {
    const linkedTag = makeTag({ uuid: 'linked-tag', geometryIds: ['docx-gml-1'] });
    const unlinkedTag = makeTag({ uuid: 'unlinked-tag', text: 'Untagged selection' });
    const docxGml = makeDocxGmlGeometry('docx-gml-1', 'Read-only DOCX GML', linkedTag);
    const onLinkGeometry = vi.fn();

    renderPanel({
      tags: [linkedTag, unlinkedTag],
      geometries: [docxGml],
      onLinkGeometry,
    });

    expect(screen.getByText('Read-only DOCX GML')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ändra geometrier' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Länka till geometrier' })).toBeNull();
    expect(onLinkGeometry).not.toHaveBeenCalled();
  });

  it('prefers explicit JSON links over mirrored DOCX-GML fallback links', () => {
    const tag = makeTag({ geometryIds: ['json-1'] });
    const jsonGeometry = makeGeometry('json-1', 'JSON Geometry');
    const docxGml = makeDocxGmlGeometry('docx-gml-1', 'Mirrored DOCX GML', tag);
    const onUnlinkGeometry = vi.fn();

    renderPanel({
      tags: [tag],
      geometries: [jsonGeometry, docxGml],
      onUnlinkGeometry,
    });

    expect(screen.getByText('JSON Geometry')).toBeTruthy();
    expect(screen.queryByText('Mirrored DOCX GML')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ändra geometrier' })).toBeTruthy();

    fireEvent.click(screen.getByTitle('Avlänka JSON Geometry'));

    expect(onUnlinkGeometry).toHaveBeenCalledWith(tag.uuid, 'json-1');
  });
});
