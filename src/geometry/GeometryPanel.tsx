/**
 * GeometryPanel.tsx
 *
 * Right-side panel showing:
 *  - An OpenLayers map (OSM background + detaljplan vector features)
 *  - JSON file upload button to import a detaljplan JSON
 *  - Export button to save the current geometry doc back to JSON
 *  - A list of geometry features with tag-linking support (multi-select batch mode)
 *
 * When `linkingTagUuid` is set in the store the panel enters multi-select mode:
 *   • Checkboxes appear on each geometry item (pre-checked = already linked)
 *   • The user can toggle as many items as desired
 *   • A floating action bar at the bottom confirms or cancels the batch
 */

import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import type { Geometry, Tag } from '../types';
import { useDocumentStore } from '../store/useDocumentStore';
import { MapView } from './MapView';
import type { PickerItem } from './MapView';
import { splitGeometriesBySource } from './geometrySource';
import { buildMirroredDisplayLinks } from './tagLinkMirror';
import { groupDocxGmlGeometries } from './docxGmlGrouping';
import {
  buildHighlightedGeometryUuids,
  buildFocusLinkedGeometryIdsByTagUuidForMode,
  buildDisplayLinkedGeometryIdsByTagUuidForMode,
  buildGeometryTagStatusIndex,
  filterGeometriesByTagStatusIndex,
  resolveActiveMapMainMode,
  resolveFocusedGeometryForSelectedTag,
  selectVisibleGeometries,
  type GeometryTagStatusFilter,
  type MapMainMode,
} from './mapDataMode';

// ─── Feature type icons / colours ─────────────────────────────────────────────

const FEATURE_ICONS: Record<string, string> = {
  detaljplan: '🗺',
  'användningsbestämmelse': '🟩',
  'egenskapsbestämmelse': '🟣',
  planbeskrivning: '🟧',
};

const FEATURE_COLORS: Record<string, string> = {
  detaljplan: '#3b82f6',
  'användningsbestämmelse': '#10b981',
  'egenskapsbestämmelse': '#8b5cf6',
  planbeskrivning: '#f97316',
};

const TAG_STATUS_FILTER_LABELS: Record<GeometryTagStatusFilter, string> = {
  all: 'Alla',
  tagged: 'Taggade',
  untagged: 'Otaggade',
};

const TAG_STATUS_FILTER_COLORS: Record<GeometryTagStatusFilter, string> = {
  all: '#6b7280',
  tagged: '#3b82f6',
  untagged: '#f97316',
};

function featureIcon(featureType?: string): string {
  return FEATURE_ICONS[featureType ?? ''] ?? '◼';
}
function featureColor(featureType?: string): string {
  return FEATURE_COLORS[featureType ?? ''] ?? '#6b7280';
}

function compareTagsByDocumentOrder(a: Tag, b: Tag): number {
  return (
    a.paragraphIndex - b.paragraphIndex ||
    a.startOffset - b.startOffset ||
    (a.endParagraphIndex ?? a.paragraphIndex) - (b.endParagraphIndex ?? b.paragraphIndex) ||
    a.endOffset - b.endOffset ||
    a.uuid.localeCompare(b.uuid)
  );
}

interface GeometryListRow {
  key: string;
  name: string;
  geometries: Geometry[];
  geometryUuids: string[];
  primaryGeometry: Geometry;
  isDocxGmlGroup: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const GeometryPanel: React.FC = () => {
  const {
    geometries,
    tags,
    linkingTagUuid,
    selectedTagUuid,
    activeGeometryDocId,
    batchLinkGeometries,
    cancelLinking,
    selectTag,
    unlinkGeometry,
  } = useDocumentStore(
    useShallow((state) => ({
      geometries: state.geometries,
      tags: state.tags,
      linkingTagUuid: state.linkingTagUuid,
      selectedTagUuid: state.selectedTagUuid,
      activeGeometryDocId: state.activeGeometryDocId,
      batchLinkGeometries: state.batchLinkGeometries,
      cancelLinking: state.cancelLinking,
      selectTag: state.selectTag,
      unlinkGeometry: state.unlinkGeometry,
    }))
  );

  const geometryListRef = useRef<HTMLDivElement>(null);
  const previousSelectedTagUuidRef = useRef<string | null>(null);
  const pendingManualFocusUuidRef = useRef<string | null>(null);
  const tagSelectionSourceRef = useRef<'geometry' | 'tag' | null>(null);
  /** Ref to the map wrapper div — used for picker positioning */
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const [expandedGeoUuids, setExpandedGeoUuids] = useState<Set<string>>(() => new Set());
  const [manualFocusedGeometryUuid, setManualFocusedGeometryUuid] = useState<string | null>(null);
  const [hoveredPickerGeometryUuid, setHoveredPickerGeometryUuid] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTypeFilters, setActiveTypeFilters] = useState<Set<string>>(new Set());
  const [tagStatusFilter, setTagStatusFilter] = useState<GeometryTagStatusFilter>('all');
  const [mapMainMode, setMapMainMode] = useState<MapMainMode>('json');

  // ── Map maximize state ────────────────────────────────────────────────────
  const [isMapMaximized, setIsMapMaximized] = useState(false);
  /** Ref to the modal map wrapper — used for modal picker positioning */
  const modalMapWrapperRef = useRef<HTMLDivElement>(null);
  const [modalPicker, setModalPicker] = useState<{
    items: PickerItem[];
    x: number;
    y: number;
  } | null>(null);

  // ── Disambiguation picker state (renders outside overflow-hidden map div) ─
  const [picker, setPicker] = useState<{
    items: PickerItem[];
    x: number;
    y: number;
  } | null>(null);

  // ── Multi-select state for batch linking ──────────────────────────────────
  // When in linking mode, staged is the working set of selected UUIDs.
  // Initialised from the current tag's geometryIds when linking starts.
  const [stagedUuids, setStagedUuids] = useState<Set<string>>(new Set());

  const isLinking = !!linkingTagUuid;
  const linkingTag = useMemo(
    () => tags.find((t) => t.uuid === linkingTagUuid),
    [tags, linkingTagUuid]
  );
  const activeMainMode = resolveActiveMapMainMode(mapMainMode, isLinking);

  const { json: jsonGeometries, docxGml: importedDocxGeometries } =
    useMemo(() => splitGeometriesBySource(geometries), [geometries]);
  const shouldShowAvailableGeometries = jsonGeometries.length > 0;
  const shouldShowDocumentCheck = jsonGeometries.length === 0;
  const visibleGeometries = useMemo(
    () =>
      selectVisibleGeometries(
        activeMainMode,
        jsonGeometries,
        importedDocxGeometries
      ),
    [activeMainMode, jsonGeometries, importedDocxGeometries]
  );

  const jsonGeometryIdSet = useMemo(
    () => new Set(jsonGeometries.map((g) => g.uuid)),
    [jsonGeometries]
  );
  const importedDocxGeometryIdSet = useMemo(
    () => new Set(importedDocxGeometries.map((g) => g.uuid)),
    [importedDocxGeometries]
  );
  const importedDocxLinkedGeometryIdsByTagUuid = useMemo(() => {
    const mirrored = buildMirroredDisplayLinks(tags, jsonGeometryIdSet, importedDocxGeometries);
    const filtered = new Map<string, Set<string>>();

    for (const [tagUuid, geometryIds] of mirrored.entries()) {
      filtered.set(
        tagUuid,
        new Set(Array.from(geometryIds).filter((id) => importedDocxGeometryIdSet.has(id)))
      );
    }

    return filtered;
  }, [tags, jsonGeometryIdSet, importedDocxGeometries, importedDocxGeometryIdSet]);
  const displayLinkedGeometryIdsByTagUuid = useMemo(() => {
    return buildDisplayLinkedGeometryIdsByTagUuidForMode({
      tags,
      activeMainMode,
      jsonGeometryIdSet,
      importedDocxGeometryIdSet,
      importedDocxLinkedGeometryIdsByTagUuid,
    });
  }, [
    tags,
    activeMainMode,
    jsonGeometryIdSet,
    importedDocxGeometryIdSet,
    importedDocxLinkedGeometryIdsByTagUuid,
  ]);
  const focusLinkedGeometryIdsByTagUuid = useMemo(() => {
    return buildFocusLinkedGeometryIdsByTagUuidForMode({
      tags,
      activeMainMode,
      jsonGeometryIdSet,
      importedDocxGeometryIdSet,
      importedDocxLinkedGeometryIdsByTagUuid,
    });
  }, [
    tags,
    activeMainMode,
    jsonGeometryIdSet,
    importedDocxGeometryIdSet,
    importedDocxLinkedGeometryIdsByTagUuid,
  ]);
  const linkedTagsByGeometryUuid = useMemo(() => {
    const map = new Map<string, Tag[]>();
    const sortedTags = [...tags].sort(compareTagsByDocumentOrder);
    for (const tag of sortedTags) {
      const linkedIds = displayLinkedGeometryIdsByTagUuid.get(tag.uuid);
      if (!linkedIds) continue;
      for (const geoId of linkedIds) {
        const arr = map.get(geoId) ?? [];
        arr.push(tag);
        map.set(geoId, arr);
      }
    }
    return map;
  }, [tags, displayLinkedGeometryIdsByTagUuid]);
  const getLinkedTagsForGeometry = useCallback(
    (geometryUuid: string): Tag[] => linkedTagsByGeometryUuid.get(geometryUuid) ?? [],
    [linkedTagsByGeometryUuid]
  );
  const getLinkedTagsForGeometryUuids = useCallback(
    (geometryUuids: string[]): Tag[] => {
      const geometryUuidSet = new Set(geometryUuids);
      return [...tags].sort(compareTagsByDocumentOrder).filter((tag) => {
        const linkedIds = displayLinkedGeometryIdsByTagUuid.get(tag.uuid);
        if (!linkedIds) return false;
        return Array.from(linkedIds).some((id) => geometryUuidSet.has(id));
      });
    },
    [tags, displayLinkedGeometryIdsByTagUuid]
  );
  const gmlEmptyTitle = 'Ingen GML hittad i importerad DOCX';
  const gmlEmptySubtitle = 'Importera en DOCX med Planbeskrivning GML för att visa befintliga objekt';

  // ── Initialise staged set when linking starts ─────────────────────────────
  useEffect(() => {
    if (linkingTagUuid) {
      const tag = tags.find((t) => t.uuid === linkingTagUuid);
      const jsonLinked = (tag?.geometryIds ?? []).filter((id) => jsonGeometryIdSet.has(id));
      setStagedUuids(new Set(jsonLinked));
    } else {
      setStagedUuids(new Set());
    }
    // Only run when linkingTagUuid changes (not every tag update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkingTagUuid]);

  // Linking mode only edits JSON geometries.
  useEffect(() => {
    if (isLinking && mapMainMode !== 'json') {
      setMapMainMode('json');
    }
  }, [isLinking, mapMainMode]);

  // If the document has imported GML but no JSON layer, show the document check.
  useEffect(() => {
    if (isLinking) return;
    if (jsonGeometries.length > 0 && mapMainMode !== 'json') {
      setMapMainMode('json');
      return;
    }
    if (shouldShowDocumentCheck && importedDocxGeometries.length > 0 && mapMainMode !== 'gml') {
      setMapMainMode('gml');
    }
    if (shouldShowDocumentCheck && importedDocxGeometries.length === 0 && mapMainMode !== 'json') {
      setMapMainMode('json');
    }
  }, [isLinking, shouldShowDocumentCheck, jsonGeometries.length, importedDocxGeometries.length, mapMainMode]);

  // Reset type chips when source mode changes to avoid hidden stale filters.
  useEffect(() => {
    setActiveTypeFilters(new Set());
    setTagStatusFilter('all');
    setExpandedGeoUuids(new Set());
    setManualFocusedGeometryUuid(null);
    setHoveredPickerGeometryUuid(null);
    setPicker(null);
    setModalPicker(null);
  }, [activeMainMode]);

  const tagStatusIndex = useMemo(
    () => buildGeometryTagStatusIndex(visibleGeometries, displayLinkedGeometryIdsByTagUuid),
    [visibleGeometries, displayLinkedGeometryIdsByTagUuid]
  );
  const tagStatusCounts = tagStatusIndex.counts;
  const statusFilteredGeometries = useMemo(
    () =>
      filterGeometriesByTagStatusIndex(
        visibleGeometries,
        tagStatusIndex.linkedGeometryIds,
        tagStatusFilter
      ),
    [visibleGeometries, tagStatusIndex, tagStatusFilter]
  );
  const tagStatusFilterOptions: Array<{
    value: GeometryTagStatusFilter;
    label: string;
    count: number;
  }> = [
    { value: 'all', label: TAG_STATUS_FILTER_LABELS.all, count: tagStatusCounts.all },
    { value: 'tagged', label: TAG_STATUS_FILTER_LABELS.tagged, count: tagStatusCounts.tagged },
    { value: 'untagged', label: TAG_STATUS_FILTER_LABELS.untagged, count: tagStatusCounts.untagged },
  ];
  // ── Derive unique feature types for filter chips ──────────────────────────
  const allFeatureTypes = useMemo(
    () => Array.from(new Set(visibleGeometries.map((g) => g.featureType ?? 'okänd'))),
    [visibleGeometries]
  );

  // ── Toggle a type filter chip ─────────────────────────────────────────────
  const toggleTypeFilter = (type: string) => {
    setActiveTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // ── Filtered geometries (used for both list and map) ──────────────────────
  const filteredGeometries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return statusFilteredGeometries.filter((geo) => {
      if (activeTypeFilters.size > 0 && !activeTypeFilters.has(geo.featureType ?? 'okänd')) {
        return false;
      }
      if (query) {
        const name = geo.name.toLowerCase();
        const type = (geo.featureType ?? '').toLowerCase();
        const kategori = String(geo.properties?.['kategori'] ?? '').toLowerCase();
        const bestammelse = String(geo.properties?.['bestammelseformulering'] ?? '').toLowerCase();
        if (!name.includes(query) && !type.includes(query) && !kategori.includes(query) && !bestammelse.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [statusFilteredGeometries, activeTypeFilters, searchQuery]);

  const docxGmlGroups = useMemo(
    () => activeMainMode === 'gml' ? groupDocxGmlGeometries(filteredGeometries) : [],
    [activeMainMode, filteredGeometries]
  );
  const gmlGroupByPrimaryUuid = useMemo(() => {
    const map = new Map<string, GeometryListRow>();
    for (const group of docxGmlGroups) {
      const primaryGeometry = group.geometries[0];
      if (!primaryGeometry) continue;
      map.set(group.key, {
        key: group.key,
        name: group.label,
        geometries: group.geometries,
        geometryUuids: group.geometryUuids,
        primaryGeometry,
        isDocxGmlGroup: group.geometryUuids.length > 1,
      });
    }
    return map;
  }, [docxGmlGroups]);
  const gmlPrimaryUuidByGeometryUuid = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of docxGmlGroups) {
      for (const uuid of group.geometryUuids) {
        map.set(uuid, group.key);
      }
    }
    return map;
  }, [docxGmlGroups]);
  const listRows = useMemo<GeometryListRow[]>(() => {
    if (activeMainMode === 'gml') {
      return Array.from(gmlGroupByPrimaryUuid.values());
    }

    return filteredGeometries.map((geometry) => ({
      key: geometry.uuid,
      name: geometry.name,
      geometries: [geometry],
      geometryUuids: [geometry.uuid],
      primaryGeometry: geometry,
      isDocxGmlGroup: false,
    }));
  }, [activeMainMode, filteredGeometries, gmlGroupByPrimaryUuid]);
  const getDisplayGeometryUuid = useCallback(
    (geometryUuid: string): string => {
      if (activeMainMode !== 'gml') return geometryUuid;
      return gmlPrimaryUuidByGeometryUuid.get(geometryUuid) ?? geometryUuid;
    },
    [activeMainMode, gmlPrimaryUuidByGeometryUuid]
  );

  const baseSelectedGeometryUuids = useMemo(
    () =>
      buildHighlightedGeometryUuids({
        isLinking,
        manualFocusedGeometryUuid,
        selectedTagUuid,
        displayLinkedGeometryIdsByTagUuid,
        visibleGeometries,
      }),
    [
      isLinking,
      manualFocusedGeometryUuid,
      selectedTagUuid,
      displayLinkedGeometryIdsByTagUuid,
      visibleGeometries,
    ]
  );
  const selectedGeometryUuids = useMemo(() => {
    const selected = new Set(baseSelectedGeometryUuids);
    if (!isLinking && activeMainMode === 'gml') {
      for (const expandedGeoUuid of expandedGeoUuids) {
        const group = gmlGroupByPrimaryUuid.get(expandedGeoUuid);
        for (const uuid of group?.geometryUuids ?? []) selected.add(uuid);
      }
    }
    return Array.from(selected);
  }, [
    activeMainMode,
    baseSelectedGeometryUuids,
    expandedGeoUuids,
    gmlGroupByPrimaryUuid,
    isLinking,
  ]);
  const selectedGeometryUuidSet = useMemo(
    () => new Set(selectedGeometryUuids),
    [selectedGeometryUuids]
  );
  const pendingGeometryUuids = useMemo(
    () => (isLinking ? Array.from(stagedUuids) : []),
    [isLinking, stagedUuids]
  );

  const selectTagFromExplicitAction = useCallback(
    (tagUuid: string, geometryUuid: string) => {
      pendingManualFocusUuidRef.current = geometryUuid;
      tagSelectionSourceRef.current = 'tag';
      setManualFocusedGeometryUuid(null);
      selectTag(tagUuid);
    },
    [selectTag]
  );
  const selectTagFromGeometry = useCallback(
    (tagUuid: string, geometryUuid: string) => {
      setManualFocusedGeometryUuid(geometryUuid);
      if (selectedTagUuid !== tagUuid) {
        tagSelectionSourceRef.current = 'geometry';
        selectTag(tagUuid);
      }
    },
    [selectedTagUuid, selectTag]
  );

  const scrollGeometryRowIntoView = useCallback((geometryUuid: string) => {
    const container = geometryListRef.current;
    if (!container) return;
    const displayGeometryUuid = getDisplayGeometryUuid(geometryUuid);
    const el = Array.from(
      container.querySelectorAll<HTMLElement>('[data-geometry-uuid]')
    ).find((row) => row.dataset.geometryUuid === displayGeometryUuid);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [getDisplayGeometryUuid]);

  const primaryExpandedGeoUuid = useMemo(() => {
    const first = expandedGeoUuids.values().next();
    return first.done ? null : first.value;
  }, [expandedGeoUuids]);

  const getExpandedDisplayGeoIdsForTag = useCallback(
    (tagUuid: string, fallbackDisplayGeoUuid?: string): Set<string> => {
      const linkedIds = focusLinkedGeometryIdsByTagUuid.get(tagUuid) ?? new Set<string>();
      const expandedDisplayGeoIds = new Set(
        visibleGeometries
          .filter((geometry) => linkedIds.has(geometry.uuid))
          .map((geometry) => getDisplayGeometryUuid(geometry.uuid))
      );

      if (fallbackDisplayGeoUuid) {
        expandedDisplayGeoIds.add(fallbackDisplayGeoUuid);
      }

      return expandedDisplayGeoIds;
    },
    [focusLinkedGeometryIdsByTagUuid, getDisplayGeometryUuid, visibleGeometries]
  );

  // ── Auto-expand and scroll to linked geometry when a tag is selected ───────
  useEffect(() => {
    const selectionSource = tagSelectionSourceRef.current;

    if (!selectedTagUuid) {
      if (selectionSource !== 'geometry') {
        setManualFocusedGeometryUuid(null);
      }
      previousSelectedTagUuidRef.current = null;
      return;
    }

    tagSelectionSourceRef.current = null;
    const didTagChange = previousSelectedTagUuidRef.current !== selectedTagUuid;
    previousSelectedTagUuidRef.current = selectedTagUuid;
    if (selectionSource !== 'geometry') {
      setManualFocusedGeometryUuid(null);
    }
    if (isLinking) return;

    const pendingManualFocusUuid = pendingManualFocusUuidRef.current;
    if (pendingManualFocusUuid) {
      const isStillVisible = visibleGeometries.some((g) => g.uuid === pendingManualFocusUuid);
      pendingManualFocusUuidRef.current = null;
      if (isStillVisible) {
        const displayFocusUuid = getDisplayGeometryUuid(pendingManualFocusUuid);
        const expandedDisplayGeoIds = getExpandedDisplayGeoIdsForTag(
          selectedTagUuid,
          displayFocusUuid
        );
        setExpandedGeoUuids(expandedDisplayGeoIds);
        const timer = setTimeout(() => {
          scrollGeometryRowIntoView(displayFocusUuid);
        }, 100);
        return () => clearTimeout(timer);
      }
    }

    const focusGeoId = resolveFocusedGeometryForSelectedTag({
      selectedTagUuid,
      displayLinkedGeometryIdsByTagUuid: focusLinkedGeometryIdsByTagUuid,
      visibleGeometries,
      previousFocusedGeometryUuid: primaryExpandedGeoUuid,
      allowVisiblePreviousFocus: !didTagChange,
    });

    if (focusGeoId) {
      const selectedLinkedIds = focusLinkedGeometryIdsByTagUuid.get(selectedTagUuid) ?? new Set<string>();
      const linkedVisibleGeometries = visibleGeometries.filter((geometry) =>
        selectedLinkedIds.has(geometry.uuid)
      );
      const geo = visibleGeometries.find((g) => g.uuid === focusGeoId);
      const displayFocusGeoId = getDisplayGeometryUuid(focusGeoId);
      const expandedDisplayGeoIds = getExpandedDisplayGeoIdsForTag(
        selectedTagUuid,
        geo ? displayFocusGeoId : undefined
      );

      if (
        activeTypeFilters.size > 0 &&
        linkedVisibleGeometries.some((geometry) => !activeTypeFilters.has(geometry.featureType ?? 'okänd'))
      ) {
        setActiveTypeFilters(new Set());
      }
      if (
        tagStatusFilter !== 'all' &&
        linkedVisibleGeometries.some(
          (geometry) => !statusFilteredGeometries.some((g) => g.uuid === geometry.uuid)
        )
      ) {
        setTagStatusFilter('all');
      }
      if (searchQuery.trim()) {
        const filteredGeometryIds = new Set(filteredGeometries.map((g) => g.uuid));
        const allSelectedLinksStillVisible = linkedVisibleGeometries.every((geometry) =>
          filteredGeometryIds.has(geometry.uuid)
        );
        if (!allSelectedLinksStillVisible) {
          setSearchQuery('');
        }
      }
      setExpandedGeoUuids(expandedDisplayGeoIds.size > 0 ? expandedDisplayGeoIds : new Set([displayFocusGeoId]));
      const timer = setTimeout(() => {
        scrollGeometryRowIntoView(displayFocusGeoId);
      }, 100);
      return () => clearTimeout(timer);
    }
    setExpandedGeoUuids(new Set());
  }, [
    selectedTagUuid,
    focusLinkedGeometryIdsByTagUuid,
    activeTypeFilters,
    activeMainMode,
    visibleGeometries,
    statusFilteredGeometries,
    filteredGeometries,
    isLinking,
    tagStatusFilter,
    searchQuery,
    primaryExpandedGeoUuid,
    getExpandedDisplayGeoIdsForTag,
    getDisplayGeometryUuid,
    scrollGeometryRowIntoView,
  ]);

  // ── Toggle a geometry in the staged set (multi-select mode) ──────────────
  const toggleStaged = useCallback((uuid: string) => {
    setStagedUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }, []);

  // ── Confirm batch link ────────────────────────────────────────────────────
  const handleConfirmBatch = useCallback(() => {
    if (!linkingTagUuid) return;
    batchLinkGeometries(linkingTagUuid, Array.from(stagedUuids));
  }, [linkingTagUuid, batchLinkGeometries, stagedUuids]);

  const focusGeometryFromInspection = useCallback(
    (uuid: string) => {
      const displayUuid = getDisplayGeometryUuid(uuid);
      tagSelectionSourceRef.current = 'geometry';
      setManualFocusedGeometryUuid(uuid);
      setExpandedGeoUuids(new Set([displayUuid]));
      const group = activeMainMode === 'gml'
        ? gmlGroupByPrimaryUuid.get(displayUuid)
        : undefined;
      const linkedTags = group
        ? getLinkedTagsForGeometryUuids(group.geometryUuids)
        : getLinkedTagsForGeometry(uuid);
      if (linkedTags.length > 0) {
        selectTagFromGeometry(linkedTags[0].uuid, uuid);
      }
    },
    [
      activeMainMode,
      getDisplayGeometryUuid,
      getLinkedTagsForGeometry,
      getLinkedTagsForGeometryUuids,
      gmlGroupByPrimaryUuid,
      selectTagFromGeometry,
    ]
  );

  const focusGeometryRowFromInspection = useCallback(
    (row: GeometryListRow) => {
      const focusUuid = row.primaryGeometry.uuid;
      tagSelectionSourceRef.current = 'geometry';
      setManualFocusedGeometryUuid(focusUuid);
      setExpandedGeoUuids(new Set([row.key]));
      const linkedTags = getLinkedTagsForGeometryUuids(row.geometryUuids);
      if (linkedTags.length > 0) {
        selectTagFromGeometry(linkedTags[0].uuid, focusUuid);
      }
    },
    [getLinkedTagsForGeometryUuids, selectTagFromGeometry]
  );

  // ── Map feature click ──────────────────────────────────────────────────────
  const handleMapFeatureClick = useCallback(
    (uuid: string) => {
      if (isLinking) {
        if (activeMainMode !== 'json') return;
        toggleStaged(uuid);
        scrollGeometryRowIntoView(uuid);
        return;
      }
      focusGeometryFromInspection(uuid);
      scrollGeometryRowIntoView(getDisplayGeometryUuid(uuid));
    },
    [
      isLinking,
      activeMainMode,
      getDisplayGeometryUuid,
      toggleStaged,
      focusGeometryFromInspection,
      scrollGeometryRowIntoView,
    ]
  );

  // ── List item click ────────────────────────────────────────────────────────
  const handleListRowClick = useCallback(
    (row: GeometryListRow) => {
      const uuid = row.primaryGeometry.uuid;
      if (isLinking) {
        if (activeMainMode !== 'json') return;
        toggleStaged(uuid);
        return;
      }
      focusGeometryRowFromInspection(row);
    },
    [
      isLinking,
      activeMainMode,
      toggleStaged,
      focusGeometryRowFromInspection,
    ]
  );

  const handleTagSubClick = useCallback(
    (e: React.MouseEvent, tag: Tag, geometryUuid: string, displayGeometryUuid = geometryUuid) => {
      e.stopPropagation();
      const expandedDisplayGeoIds = getExpandedDisplayGeoIdsForTag(tag.uuid, displayGeometryUuid);
      setExpandedGeoUuids(expandedDisplayGeoIds);
      selectTagFromExplicitAction(tag.uuid, geometryUuid);
    },
    [getExpandedDisplayGeoIdsForTag, selectTagFromExplicitAction]
  );

  const handleMapMultiFeatureClick = useCallback(
    (items: PickerItem[], pixelX: number, pixelY: number) => {
      // pixelX/Y are relative to the inner map div (inside 12px padding)
      setHoveredPickerGeometryUuid(null);
      setPicker({ items, x: pixelX + 12, y: pixelY + 12 });
    },
    []
  );

  const handleModalMapMultiFeatureClick = useCallback(
    (items: PickerItem[], pixelX: number, pixelY: number) => {
      setHoveredPickerGeometryUuid(null);
      setModalPicker({ items, x: pixelX + 12, y: pixelY + 12 });
    },
    []
  );

  return (
    <div className="w-full bg-white flex flex-col h-full overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-100 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-700 truncate">Karta</h2>
          </div>

          <div className="flex items-center gap-1">
            {shouldShowAvailableGeometries && (
              <button
                onClick={() => setMapMainMode('json')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeMainMode === 'json'
                    ? 'border border-blue-100 bg-blue-50 text-blue-700'
                    : 'border border-gray-200 bg-white text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
                title="Visa importerad JSON-geometri"
              >
                Tillgängliga geometrier
              </button>
            )}
            {shouldShowDocumentCheck && (
              <button
                onClick={() => setMapMainMode('gml')}
                disabled={isLinking || importedDocxGeometries.length === 0}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                  activeMainMode === 'gml'
                    ? 'border-gray-300 bg-gray-100 text-gray-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-gray-600`}
                title={
                  isLinking
                    ? 'Länkning sker mot JSON-lagret'
                    : 'Kontrollera geometrier i importerad DOCX'
                }
              >
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m5 2a8 8 0 11-16 0 8 8 0 0116 0z" />
                </svg>
                Dokumentkontroll
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Linking mode banner ──────────────────────────────────────────── */}
      {isLinking && (
        <div className="mx-3 mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-blue-700 font-medium truncate">
                Väljer geometrier för: <span className="italic">"{linkingTag?.text?.slice(0, 20)}…"</span>
              </p>
              <p className="text-[10px] text-blue-600 mt-0.5">
                Klicka geometrier i kartan eller listan och bekräfta med Länka.
              </p>
            </div>
          </div>
          <button
            onClick={cancelLinking}
            className="text-blue-400 hover:text-blue-600 flex-shrink-0"
            title="Avbryt"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Map + disambiguation picker ──────────────────────────────────── */}
      {/* The wrapper is `relative` so the picker popup can escape the map's
          `overflow-hidden` constraint and still be positioned correctly. */}
      <div
        ref={mapWrapperRef}
        className="px-3 pt-3 pb-2 relative"
        style={{ height: '240px' }}
      >
        <MapView
          geometries={filteredGeometries}
          selectedGeometryUuids={selectedGeometryUuids}
          pendingGeometryUuids={pendingGeometryUuids}
          previewGeometryUuid={hoveredPickerGeometryUuid}
          isLinking={isLinking}
          emptyStateTitle={
            activeMainMode === 'json'
              ? 'Ingen JSON-geometri inläst'
              : gmlEmptyTitle
          }
          emptyStateSubtitle={
            activeMainMode === 'json'
              ? 'Ladda upp en detaljplan-JSON'
              : gmlEmptySubtitle
          }
          onFeatureClick={handleMapFeatureClick}
          onMultiFeatureClick={handleMapMultiFeatureClick}
        />

        {/* Maximize button */}
        <button
          onClick={() => setIsMapMaximized(true)}
          className="absolute top-5 right-5 z-10 w-7 h-7 flex items-center justify-center rounded-lg bg-white/90 border border-gray-200 shadow-sm text-gray-500 hover:text-gray-700 hover:bg-white hover:shadow-md transition-all"
          title="Maximera karta"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>

        {/* Picker popup — rendered here, OUTSIDE the overflow-hidden map div */}
        {picker && (() => {
          const POPUP_W = 180;
          const ITEM_H = 28;
          const HEADER_H = 26;
          const MAX_VISIBLE = 5;
          const listH = Math.min(picker.items.length, MAX_VISIBLE) * ITEM_H;
          const POPUP_H = HEADER_H + listH;
          const wrapperW = mapWrapperRef.current?.clientWidth ?? 260;
          const wrapperH = mapWrapperRef.current?.clientHeight ?? 240;
          const left = Math.min(picker.x + 6, wrapperW - POPUP_W - 4);
          const top = picker.y + POPUP_H > wrapperH
            ? picker.y - POPUP_H - 4
            : picker.y + 4;

          return (
            <>
              {/* Backdrop */}
              <div
                className="absolute inset-0 z-40"
                onClick={() => {
                  setHoveredPickerGeometryUuid(null);
                  setPicker(null);
                }}
              />
              <div
                className="absolute z-50 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden"
                style={{ left, top, width: POPUP_W }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-2.5 py-1 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    {picker.items.length} geometrier
                  </span>
                  <button
                    onClick={() => {
                      setHoveredPickerGeometryUuid(null);
                      setPicker(null);
                    }}
                    aria-label="Stäng geometriväljare"
                    className="text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {/* Scrollable list */}
                <ul
                  style={{ maxHeight: MAX_VISIBLE * ITEM_H, overflowY: 'auto' }}
                  onPointerLeave={() => setHoveredPickerGeometryUuid(null)}
                >
                  {picker.items.map((item) => (
                    <li key={item.uuid}>
                      <button
                        className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors hover:bg-gray-50 ${item.isChecked ? 'bg-blue-50' : ''}`}
                        style={{ height: ITEM_H }}
                        onPointerEnter={() => setHoveredPickerGeometryUuid(item.uuid)}
                        onPointerLeave={() => setHoveredPickerGeometryUuid(null)}
                        onFocus={() => setHoveredPickerGeometryUuid(item.uuid)}
                        onBlur={() => setHoveredPickerGeometryUuid(null)}
                        onClick={() => {
                          setHoveredPickerGeometryUuid(null);
                          handleMapFeatureClick(item.uuid);
                          setPicker(null);
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm flex-shrink-0">{featureIcon(item.featureType)}</span>
                        <span
                          className="text-xs font-medium truncate flex-1"
                          style={{ color: item.isChecked ? '#1d4ed8' : '#374151' }}
                        >
                          {item.name}
                        </span>
                        {item.isChecked && (
                          <svg className="w-3 h-3 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          );
        })()}
      </div>

      {/* ── Active geometry doc info ─────────────────────────────────────── */}
      {activeMainMode === 'json' && activeGeometryDocId && (
        <div className="mx-3 mb-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 flex items-center gap-2">
          <span className="text-xs">🗺</span>
          <p className="text-xs text-gray-600 truncate flex-1">
            {String(geometries.find((g) => g.sourceDocId === activeGeometryDocId)
              ?.properties?.['beteckning'] ?? 'Detaljplan inläst')}
          </p>
        </div>
      )}

      {/* ── Tag status filter ─────────────────────────────────────────────── */}
      {visibleGeometries.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {tagStatusFilterOptions.map((option) => {
            const active = tagStatusFilter === option.value;
            const color = TAG_STATUS_FILTER_COLORS[option.value];
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setTagStatusFilter(option.value)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all ${
                  active
                    ? 'text-white border-transparent'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
                style={active ? { backgroundColor: color, borderColor: color } : {}}
                title={`Visa ${option.label.toLowerCase()} geometrier`}
              >
                <span>{option.label}</span>
                <span className={active ? 'text-white/90' : 'text-gray-400'}>
                  {option.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Type filter chips ───────────────────────────────────────────── */}
      {allFeatureTypes.length > 1 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {allFeatureTypes.map((type) => {
            const active = activeTypeFilters.has(type);
            const color = featureColor(type);
            const icon = featureIcon(type);
            return (
              <button
                key={type}
                onClick={() => toggleTypeFilter(type)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all ${
                  active
                    ? 'text-white border-transparent'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
                style={active ? { backgroundColor: color, borderColor: color } : {}}
                title={type}
              >
                <span>{icon}</span>
                <span className="truncate max-w-[100px]">{type}</span>
              </button>
            );
          })}
          {activeTypeFilters.size > 0 && (
            <button
              onClick={() => setActiveTypeFilters(new Set())}
              className="px-2 py-0.5 rounded-full text-xs border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 bg-white transition-all"
              title="Rensa filter"
            >
              ✕ Rensa
            </button>
          )}
        </div>
      )}

      {/* ── Search input ────────────────────────────────────────────────── */}
      {visibleGeometries.length > 0 && (
        <div className="px-3 pb-2">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Sök namn, typ, kategori…"
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200 placeholder-gray-300"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Geometry list ────────────────────────────────────────────────── */}
      <div
        className="overflow-y-auto px-3 pb-3"
        style={{ flex: isLinking ? '1 1 0' : '1 1 0' }}
        ref={geometryListRef}
      >
        {visibleGeometries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-3xl mb-2">🗺</div>
            <p className="text-xs text-gray-400 font-medium">
              {activeMainMode === 'json' ? 'Ingen JSON-geometri inläst' : gmlEmptyTitle}
            </p>
            <p className="text-xs text-gray-300 mt-1">
              {activeMainMode === 'json'
                ? 'Använd Data-menyn för att importera en detaljplan'
                : gmlEmptySubtitle}
            </p>
          </div>
        ) : listRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-2xl mb-2">🔍</div>
            <p className="text-xs text-gray-400 font-medium">Inga träffar</p>
            <p className="text-xs text-gray-300 mt-1">Prova ett annat sökord eller filter</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {listRows.map((row) => {
              const geo = row.primaryGeometry;
              const linkedTags = getLinkedTagsForGeometryUuids(row.geometryUuids);
              const linkedCount = linkedTags.length;
              const color = featureColor(geo.featureType);
              const icon = featureIcon(geo.featureType);

              const isSelected = !isLinking && row.geometryUuids.some((uuid) => selectedGeometryUuidSet.has(uuid));
              // In linking mode: checked means staged
              const isChecked = isLinking && stagedUuids.has(geo.uuid);
              const isExpanded = expandedGeoUuids.has(row.key);

              return (
                <li key={row.key} className="group" data-geometry-uuid={row.key}>
                  <div
                    onClick={() => handleListRowClick(row)}
                    className={`flex items-start gap-2 px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                      isLinking
                        ? isChecked
                          ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-400'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                        : isSelected
                          ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-400'
                          : 'border-transparent hover:bg-gray-50'
                    }`}
                  >
                    {/* Checkbox (linking mode) or feature icon (normal mode) */}
                    {isLinking ? (
                      <div
                        className={`w-4 h-4 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border-2 transition-all ${
                          isChecked
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'border-gray-300 bg-white'
                        }`}
                      >
                        {isChecked && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm flex-shrink-0 mt-0.5">{icon}</span>
                    )}

                    {/* Name & meta */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-medium truncate"
                        style={{
                          color: isLinking
                            ? isChecked ? '#065f46' : '#374151'
                            : isSelected ? '#1d4ed8' : '#374151'
                        }}
                      >
                        {row.name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {geo.featureType ?? geo.type}
                        {row.isDocxGmlGroup && (
                          <span className="ml-1 text-orange-500">
                            · {row.geometryUuids.length} GML-objekt
                          </span>
                        )}
                        {linkedCount > 0 && (
                          <span className="ml-1 text-blue-500">
                            · {linkedCount} tagg{linkedCount !== 1 ? 'ar' : ''}
                          </span>
                        )}
                      </p>
                      {!!geo.properties?.['kategori'] && (
                        <p className="text-xs text-gray-400 truncate italic">
                          {String(geo.properties['kategori'])}
                        </p>
                      )}
                    </div>

                    {/* Expand chevron (normal mode only) */}
                    {!isLinking && linkedCount > 0 && (
                      <svg
                        className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 mt-0.5 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}

                    {/* Colour dot */}
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
                      style={{ backgroundColor: color }}
                    />
                  </div>

                  {/* ── Linked tags sub-list (normal mode) ───────────────── */}
                  {!isLinking && isExpanded && linkedTags.length > 0 && (
                    <ul className="mt-1 ml-6 mr-2 space-y-0.5 border-l-2 border-gray-100 pl-3 pb-1">
                      {linkedTags.map((tag) => {
                        const linkedIdsForTag = displayLinkedGeometryIdsByTagUuid.get(tag.uuid) ?? new Set<string>();
                        const rowGeometryUuidForTag =
                          row.geometryUuids.find((uuid) => linkedIdsForTag.has(uuid)) ??
                          row.primaryGeometry.uuid;
                        const isExplicitLink = row.geometryUuids.some((uuid) =>
                          (tag.geometryIds ?? []).includes(uuid)
                        );
                        const canUnlink = activeMainMode === 'json' && isExplicitLink;
                        return (
                          <li
                            key={tag.uuid}
                            onClick={(e) => handleTagSubClick(e, tag, rowGeometryUuidForTag, row.key)}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-all text-xs ${
                              selectedTagUuid === tag.uuid
                                ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-300'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                            }`}
                          >
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                            <span className="truncate flex-1">
                              {tag.text.length > 50 ? tag.text.slice(0, 50) + '…' : tag.text}
                            </span>
                            {!isExplicitLink && (
                              <span className="text-[10px] text-orange-500 font-medium">
                                Länk
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (canUnlink) {
                                  unlinkGeometry(tag.uuid, geo.uuid);
                                }
                              }}
                              disabled={!canUnlink}
                              className="text-gray-300 hover:text-red-400 disabled:text-gray-200 disabled:cursor-not-allowed transition-colors flex-shrink-0 ml-auto"
                              title={
                                canUnlink
                                  ? 'Avlänka'
                                  : 'Redigera länkar i JSON-läge'
                              }
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Batch-link action bar (shown in linking mode) ────────────────── */}
      {isLinking && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100 bg-white">
          <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-700">
                {stagedUuids.size === 0
                  ? 'Ingen geometri vald'
                  : `${stagedUuids.size} geometri${stagedUuids.size !== 1 ? 'er' : ''} vald${stagedUuids.size !== 1 ? 'a' : ''}`}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">Kryssa i geometrier i listan eller kartan</p>
            </div>
            <button
              onClick={cancelLinking}
              className="px-3 py-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              Avbryt
            </button>
            <button
              onClick={handleConfirmBatch}
              className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors font-semibold shadow-sm"
            >
              Länka
            </button>
          </div>
        </div>
      )}

      {/* ── Maximized map modal ──────────────────────────────────────────── */}
      {isMapMaximized && createPortal(
        <div className="fixed inset-0 z-[1000] flex flex-col bg-black/60 backdrop-blur-sm">
          {/* Modal panel */}
          <div className="flex flex-col m-4 rounded-2xl overflow-hidden shadow-2xl bg-white flex-1 min-h-0">

            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-base">🗺</span>
                <div>
                  <h2 className="text-sm font-semibold text-gray-700">Karta</h2>
                </div>
              </div>
              {isLinking && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                  <p className="text-xs text-blue-700 font-medium">
                    Väljer geometrier · <span className="italic">"{linkingTag?.text?.slice(0, 30)}…"</span>
                  </p>
                </div>
              )}
              <button
                onClick={() => {
                  setHoveredPickerGeometryUuid(null);
                  setIsMapMaximized(false);
                  setModalPicker(null);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                title="Stäng"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal map */}
            <div
              ref={modalMapWrapperRef}
              className="flex-1 min-h-0 relative p-3"
            >
              <MapView
                geometries={filteredGeometries}
                selectedGeometryUuids={selectedGeometryUuids}
                pendingGeometryUuids={pendingGeometryUuids}
                previewGeometryUuid={hoveredPickerGeometryUuid}
                isLinking={isLinking}
                emptyStateTitle={
                  activeMainMode === 'json'
                    ? 'Ingen JSON-geometri inläst'
                    : gmlEmptyTitle
                }
                emptyStateSubtitle={
                  activeMainMode === 'json'
                    ? 'Ladda upp en detaljplan-JSON'
                    : gmlEmptySubtitle
                }
                onFeatureClick={handleMapFeatureClick}
                onMultiFeatureClick={handleModalMapMultiFeatureClick}
              />

              {/* Modal disambiguation picker */}
              {modalPicker && (() => {
                const POPUP_W = 200;
                const ITEM_H = 32;
                const HEADER_H = 30;
                const MAX_VISIBLE = 8;
                const listH = Math.min(modalPicker.items.length, MAX_VISIBLE) * ITEM_H;
                const POPUP_H = HEADER_H + listH;
                const wrapperW = modalMapWrapperRef.current?.clientWidth ?? 800;
                const wrapperH = modalMapWrapperRef.current?.clientHeight ?? 600;
                const left = Math.min(modalPicker.x + 6, wrapperW - POPUP_W - 4);
                const top = modalPicker.y + POPUP_H > wrapperH
                  ? modalPicker.y - POPUP_H - 4
                  : modalPicker.y + 4;

                return (
                  <>
                    <div
                      className="absolute inset-0 z-40"
                      onClick={() => {
                        setHoveredPickerGeometryUuid(null);
                        setModalPicker(null);
                      }}
                    />
                    <div
                      className="absolute z-50 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden"
                      style={{ left, top, width: POPUP_W }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                          {modalPicker.items.length} geometrier
                        </span>
                        <button
                          onClick={() => {
                            setHoveredPickerGeometryUuid(null);
                            setModalPicker(null);
                          }}
                          aria-label="Stäng geometriväljare"
                          className="text-gray-300 hover:text-gray-500 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <ul
                        style={{ maxHeight: MAX_VISIBLE * ITEM_H, overflowY: 'auto' }}
                        onPointerLeave={() => setHoveredPickerGeometryUuid(null)}
                      >
                        {modalPicker.items.map((item) => (
                          <li key={item.uuid}>
                            <button
                              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-50 ${item.isChecked ? 'bg-blue-50' : ''}`}
                              style={{ height: ITEM_H }}
                              onPointerEnter={() => setHoveredPickerGeometryUuid(item.uuid)}
                              onPointerLeave={() => setHoveredPickerGeometryUuid(null)}
                              onFocus={() => setHoveredPickerGeometryUuid(item.uuid)}
                              onBlur={() => setHoveredPickerGeometryUuid(null)}
                              onClick={() => {
                                setHoveredPickerGeometryUuid(null);
                                handleMapFeatureClick(item.uuid);
                                setModalPicker(null);
                              }}
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="text-sm flex-shrink-0">{featureIcon(item.featureType)}</span>
                              <span
                                className="text-xs font-medium truncate flex-1"
                                style={{ color: item.isChecked ? '#1d4ed8' : '#374151' }}
                              >
                                {item.name}
                              </span>
                              {item.isChecked && (
                                <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Modal linking action bar */}
            {isLinking && (
              <div className="px-4 py-3 border-t border-gray-100 bg-white flex-shrink-0">
                <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-700">
                      {stagedUuids.size === 0
                        ? 'Ingen geometri vald'
                        : `${stagedUuids.size} geometri${stagedUuids.size !== 1 ? 'er' : ''} vald${stagedUuids.size !== 1 ? 'a' : ''}`}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Klicka på geometrier i kartan för att markera</p>
                  </div>
                  <button
                    onClick={cancelLinking}
                    className="px-3 py-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors font-medium"
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={handleConfirmBatch}
                    className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors font-semibold shadow-sm"
                  >
                    Länka
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
