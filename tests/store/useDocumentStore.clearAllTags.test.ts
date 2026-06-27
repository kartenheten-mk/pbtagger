/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import { buildDefaultAppConfig } from '../../src/config/appConfig';
import { useDocumentStore } from '../../src/store/useDocumentStore';
import type { Geometry, Tag } from '../../src/types';

function makeTag(uuid: string, overrides: Partial<Tag> = {}): Tag {
  return {
    uuid,
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

function makeGeometry(uuid: string): Geometry {
  return {
    uuid,
    name: 'Planbestämmelse',
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

describe('useDocumentStore clearAllTags', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetStore();
  });

  it('removes every tag and exits selected/linking tag modes without removing geometries', () => {
    const geometries = [makeGeometry('geo-1')];
    resetStore({
      tags: [
        makeTag('tag-1', { geometryIds: ['geo-1'] }),
        makeTag('tag-2'),
      ],
      geometries,
      selectedTagUuid: 'tag-1',
      linkingTagUuid: 'tag-2',
    });

    useDocumentStore.getState().clearAllTags();

    const state = useDocumentStore.getState();
    expect(state.tags).toEqual([]);
    expect(state.geometries).toEqual(geometries);
    expect(state.selectedTagUuid).toBeNull();
    expect(state.linkingTagUuid).toBeNull();
  });

  it('can be undone through the existing tag history', () => {
    const tags = [
      makeTag('tag-1', { geometryIds: ['geo-1'] }),
      makeTag('tag-2'),
    ];
    resetStore({ tags, geometries: [makeGeometry('geo-1')] });

    useDocumentStore.getState().clearAllTags();
    useDocumentStore.temporal.getState().undo();

    expect(useDocumentStore.getState().tags).toEqual(tags);
  });
});
