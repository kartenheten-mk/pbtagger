import { describe, expect, it } from 'vitest';
import type { Geometry, Tag } from '../../src/types';
import {
  buildFocusLinkedGeometryIdsByTagUuidForMode,
  buildInspectionSelectedGeometryUuids,
  buildDisplayLinkedGeometryIdsByTagUuidForMode,
  resolveFocusedGeometryForSelectedTag,
  resolveActiveMapMainMode,
  selectVisibleGeometries,
} from '../../src/geometry/mapDataMode';

function makeGeometry(uuid: string, source: 'json' | 'docx_gml'): Geometry {
  return {
    uuid,
    name: uuid,
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
    source,
    featureType: source === 'json' ? 'detaljplan' : 'planbeskrivning',
    properties: {},
  };
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    uuid: 'tag-1',
    categoryId: 'detaljplanens-syfte--syfte',
    targetType: 'text',
    text: 'tag text',
    paragraphIndex: 0,
    startOffset: 0,
    endOffset: 8,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('mapDataMode view-model helpers', () => {
  it('selects correct dataset for JSON, GML-preview, and GML-imported', () => {
    const json = [makeGeometry('json-1', 'json')];
    const preview = [makeGeometry('preview-1', 'docx_gml')];
    const imported = [makeGeometry('imported-1', 'docx_gml')];

    const jsonVisible = selectVisibleGeometries('json', 'preview', json, preview, imported);
    const gmlPreviewVisible = selectVisibleGeometries('gml', 'preview', json, preview, imported);
    const gmlImportedVisible = selectVisibleGeometries(
      'gml',
      'imported_docx',
      json,
      preview,
      imported
    );

    expect(jsonVisible.map((g) => g.uuid)).toEqual(['json-1']);
    expect(gmlPreviewVisible.map((g) => g.uuid)).toEqual(['preview-1']);
    expect(gmlImportedVisible.map((g) => g.uuid)).toEqual(['imported-1']);
  });

  it('uses current explicit links only for Imported DOCX mode badges', () => {
    const tag = makeTag({
      uuid: 'tag-2',
      geometryIds: ['json-1', 'imported-1'],
    });

    const links = buildDisplayLinkedGeometryIdsByTagUuidForMode({
      tags: [tag],
      activeMainMode: 'gml',
      gmlViewMode: 'imported_docx',
      jsonGeometryIdSet: new Set(['json-1']),
      importedDocxGeometryIdSet: new Set(['imported-1']),
      previewLinkedGeometryIdsByTagUuid: new Map([['tag-2', new Set(['preview-1'])]]),
      importedDocxLinkedGeometryIdsByTagUuid: new Map(),
    });

    expect(Array.from(links.get('tag-2') ?? [])).toEqual(['imported-1']);
  });

  it('uses mirrored imported DOCX links when tag only stores JSON geometry ids', () => {
    const tag = makeTag({
      uuid: 'tag-2b',
      geometryIds: ['json-1'],
    });

    const links = buildDisplayLinkedGeometryIdsByTagUuidForMode({
      tags: [tag],
      activeMainMode: 'gml',
      gmlViewMode: 'imported_docx',
      jsonGeometryIdSet: new Set(['json-1']),
      importedDocxGeometryIdSet: new Set(['imported-1']),
      previewLinkedGeometryIdsByTagUuid: new Map(),
      importedDocxLinkedGeometryIdsByTagUuid: new Map([
        ['tag-2b', new Set(['imported-1'])],
      ]),
    });

    expect(Array.from(links.get('tag-2b') ?? [])).toEqual(['imported-1']);
  });

  it('uses preview-derived links as focus source in GML preview mode', () => {
    const tag = makeTag({
      uuid: 'tag-3',
      geometryIds: ['json-1', 'imported-1'],
    });

    const links = buildFocusLinkedGeometryIdsByTagUuidForMode({
      tags: [tag],
      activeMainMode: 'gml',
      gmlViewMode: 'preview',
      jsonGeometryIdSet: new Set(['json-1']),
      importedDocxGeometryIdSet: new Set(['imported-1']),
      previewLinkedGeometryIdsByTagUuid: new Map([['tag-3', new Set(['preview-1'])]]),
      importedDocxLinkedGeometryIdsByTagUuid: new Map(),
    });

    expect(Array.from(links.get('tag-3') ?? [])).toEqual(['preview-1']);
  });

  it('forces active map mode to JSON while linking', () => {
    expect(resolveActiveMapMainMode('gml', true)).toBe('json');
    expect(resolveActiveMapMainMode('json', true)).toBe('json');
    expect(resolveActiveMapMainMode('gml', false)).toBe('gml');
  });

  it('returns single selected geometry in inspection mode', () => {
    expect(buildInspectionSelectedGeometryUuids(false, 'geo-1')).toEqual(['geo-1']);
    expect(buildInspectionSelectedGeometryUuids(false, null)).toEqual([]);
    expect(buildInspectionSelectedGeometryUuids(true, 'geo-1')).toEqual([]);
  });

  it('resolves focused geometry for selected tag with deterministic preference', () => {
    const visible = [
      makeGeometry('geo-a', 'json'),
      makeGeometry('geo-b', 'json'),
      makeGeometry('geo-c', 'json'),
    ];
    const links = new Map<string, Set<string>>([
      ['tag-1', new Set(['geo-b', 'geo-c'])],
    ]);

    // Prefer previous focused geometry when still linked+visible.
    expect(
      resolveFocusedGeometryForSelectedTag({
        selectedTagUuid: 'tag-1',
        displayLinkedGeometryIdsByTagUuid: links,
        visibleGeometries: visible,
        previousFocusedGeometryUuid: 'geo-c',
      })
    ).toBe('geo-c');

    // Keep manual previous focus when requested, even if not linked.
    expect(
      resolveFocusedGeometryForSelectedTag({
        selectedTagUuid: 'tag-1',
        displayLinkedGeometryIdsByTagUuid: links,
        visibleGeometries: visible,
        previousFocusedGeometryUuid: 'geo-a',
        allowVisiblePreviousFocus: true,
      })
    ).toBe('geo-a');

    // Allow preserving previous focus even when tag has no linked geometry.
    expect(
      resolveFocusedGeometryForSelectedTag({
        selectedTagUuid: 'tag-1',
        displayLinkedGeometryIdsByTagUuid: new Map([['tag-1', new Set()]]),
        visibleGeometries: visible,
        previousFocusedGeometryUuid: 'geo-a',
        allowVisiblePreviousFocus: true,
      })
    ).toBe('geo-a');

    // GML preview mode: deterministic first visible linked geometry.
    expect(
      resolveFocusedGeometryForSelectedTag({
        selectedTagUuid: 'tag-1',
        displayLinkedGeometryIdsByTagUuid: links,
        visibleGeometries: visible,
        previousFocusedGeometryUuid: 'geo-c',
        prioritizeFirstVisibleLinked: true,
      })
    ).toBe('geo-b');

    // GML preview mode: previous unrelated focus must not block tag focus.
    expect(
      resolveFocusedGeometryForSelectedTag({
        selectedTagUuid: 'tag-1',
        displayLinkedGeometryIdsByTagUuid: links,
        visibleGeometries: visible,
        previousFocusedGeometryUuid: 'geo-a',
        prioritizeFirstVisibleLinked: true,
      })
    ).toBe('geo-b');

    // Otherwise select first linked geometry in visible order.
    expect(
      resolveFocusedGeometryForSelectedTag({
        selectedTagUuid: 'tag-1',
        displayLinkedGeometryIdsByTagUuid: links,
        visibleGeometries: visible,
        previousFocusedGeometryUuid: 'geo-x',
      })
    ).toBe('geo-b');

    // No linked visible geometry => null.
    expect(
      resolveFocusedGeometryForSelectedTag({
        selectedTagUuid: 'tag-1',
        displayLinkedGeometryIdsByTagUuid: new Map([['tag-1', new Set(['geo-z'])]]),
        visibleGeometries: visible,
        previousFocusedGeometryUuid: null,
      })
    ).toBeNull();

    // GML preview mode: no linked preview geometry => null.
    expect(
      resolveFocusedGeometryForSelectedTag({
        selectedTagUuid: 'tag-1',
        displayLinkedGeometryIdsByTagUuid: new Map([['tag-1', new Set()]]),
        visibleGeometries: visible,
        previousFocusedGeometryUuid: 'geo-a',
        prioritizeFirstVisibleLinked: true,
      })
    ).toBeNull();
  });
});
