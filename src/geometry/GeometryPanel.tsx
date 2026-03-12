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

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { Tag } from '../types';
import { useDocumentStore } from '../store/useDocumentStore';
import { MapView } from './MapView';
import type { PickerItem } from './MapView';

// ─── Feature type icons / colours ─────────────────────────────────────────────

const FEATURE_ICONS: Record<string, string> = {
  detaljplan: '🗺',
  'användningsbestämmelse': '🟩',
  'egenskapsbestämmelse': '🟣',
};

const FEATURE_COLORS: Record<string, string> = {
  detaljplan: '#3b82f6',
  'användningsbestämmelse': '#10b981',
  'egenskapsbestämmelse': '#8b5cf6',
};

function featureIcon(featureType?: string): string {
  return FEATURE_ICONS[featureType ?? ''] ?? '◼';
}
function featureColor(featureType?: string): string {
  return FEATURE_COLORS[featureType ?? ''] ?? '#6b7280';
}

// ─── Component ────────────────────────────────────────────────────────────────

export const GeometryPanel: React.FC = () => {
  const {
    geometries,
    tags,
    linkingTagUuid,
    selectedTagUuid,
    activeGeometryDocId,
    finishLinking,
    batchLinkGeometries,
    cancelLinking,
    selectTag,
    unlinkGeometry,
  } = useDocumentStore();

  const geometryListRef = useRef<HTMLDivElement>(null);
  /** Ref to the map wrapper div — used for picker positioning */
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const [expandedGeoUuid, setExpandedGeoUuid] = useState<string | null>(null);
  const [clickedGeoUuid, setClickedGeoUuid] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTypeFilters, setActiveTypeFilters] = useState<Set<string>>(new Set());

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
  const linkingTag = tags.find((t) => t.uuid === linkingTagUuid);

  // ── Initialise staged set when linking starts ─────────────────────────────
  useEffect(() => {
    if (linkingTagUuid) {
      const tag = tags.find((t) => t.uuid === linkingTagUuid);
      setStagedUuids(new Set(tag?.geometryIds ?? []));
    } else {
      setStagedUuids(new Set());
    }
    // Only run when linkingTagUuid changes (not every tag update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkingTagUuid]);

  // ── Derive unique feature types for filter chips ──────────────────────────
  const allFeatureTypes = Array.from(
    new Set(geometries.map((g) => g.featureType ?? 'okänd'))
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
  const filteredGeometries = geometries.filter((geo) => {
    if (activeTypeFilters.size > 0 && !activeTypeFilters.has(geo.featureType ?? 'okänd')) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = geo.name.toLowerCase();
      const type = (geo.featureType ?? '').toLowerCase();
      const kategori = String(geo.properties?.['kategori'] ?? '').toLowerCase();
      const bestammelse = String(geo.properties?.['bestammelseformulering'] ?? '').toLowerCase();
      if (!name.includes(q) && !type.includes(q) && !kategori.includes(q) && !bestammelse.includes(q)) {
        return false;
      }
    }
    return true;
  });

  // ── Derive which geometry UUIDs are "selected" from the selected tag ──────
  const tagDerivedGeoUuids: string[] = selectedTagUuid
    ? (tags.find((t) => t.uuid === selectedTagUuid)?.geometryIds ?? [])
    : [];

  // In normal mode: highlight tag-derived + user-clicked geometry
  // In linking mode: highlight staged (pending) geometries in green
  const selectedGeometryUuids = isLinking ? [] : [
    ...tagDerivedGeoUuids,
    ...(clickedGeoUuid && !tagDerivedGeoUuids.includes(clickedGeoUuid) ? [clickedGeoUuid] : []),
  ];
  const pendingGeometryUuids = isLinking ? Array.from(stagedUuids) : [];

  // ── Auto-expand and scroll to linked geometry when a tag is selected ───────
  useEffect(() => {
    if (!selectedTagUuid || isLinking) return;
    const tag = tags.find((t) => t.uuid === selectedTagUuid);
    const firstGeoId = tag?.geometryIds?.[0];
    if (firstGeoId) {
      const geo = geometries.find((g) => g.uuid === firstGeoId);
      if (geo && activeTypeFilters.size > 0 && !activeTypeFilters.has(geo.featureType ?? 'okänd')) {
        setActiveTypeFilters(new Set());
      }
      setExpandedGeoUuid(firstGeoId);
      const timer = setTimeout(() => {
        const el = geometryListRef.current?.querySelector<HTMLElement>(
          `[data-geometry-uuid="${firstGeoId}"]`
        );
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
      return () => clearTimeout(timer);
    }
    setClickedGeoUuid(null);
  }, [selectedTagUuid, tags, activeTypeFilters, geometries, isLinking]);

  // ── Toggle a geometry in the staged set (multi-select mode) ──────────────
  const toggleStaged = useCallback((uuid: string) => {
    setStagedUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
    // Also keep the store in sync so map reflects changes immediately
    finishLinking(linkingTagUuid!, uuid);
  }, [finishLinking, linkingTagUuid]);

  // ── Confirm batch link ────────────────────────────────────────────────────
  const handleConfirmBatch = useCallback(() => {
    if (!linkingTagUuid) return;
    batchLinkGeometries(linkingTagUuid, Array.from(stagedUuids));
  }, [linkingTagUuid, batchLinkGeometries, stagedUuids]);

  // ── Map feature click ──────────────────────────────────────────────────────
  const handleMapFeatureClick = useCallback(
    (uuid: string) => {
      if (isLinking) {
        toggleStaged(uuid);
        return;
      }
      const linkedTags = tags.filter((t) => t.geometryIds?.includes(uuid));
      if (linkedTags.length > 0) {
        selectTag(linkedTags[0].uuid);
      }
      setExpandedGeoUuid((prev) => (prev === uuid ? null : uuid));
    },
    [isLinking, toggleStaged, tags, selectTag]
  );

  // ── List item click ────────────────────────────────────────────────────────
  const handleListItemClick = useCallback(
    (uuid: string) => {
      if (isLinking) {
        toggleStaged(uuid);
        return;
      }
      setClickedGeoUuid((prev) => (prev === uuid ? null : uuid));
      setExpandedGeoUuid((prev) => (prev === uuid ? null : uuid));
    },
    [isLinking, toggleStaged]
  );

  const handleTagSubClick = useCallback(
    (e: React.MouseEvent, tag: Tag) => {
      e.stopPropagation();
      selectTag(tag.uuid);
    },
    [selectTag]
  );

  return (
    <div className="w-full bg-white flex flex-col h-full overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-700 truncate">Karta</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {geometries.length} geometrier
          </p>
        </div>
      </div>

      {/* ── Linking mode banner ──────────────────────────────────────────── */}
      {isLinking && (
        <div className="mx-3 mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
            <p className="text-xs text-blue-700 font-medium truncate">
              Väljer geometrier för: <span className="italic">"{linkingTag?.text?.slice(0, 20)}…"</span>
            </p>
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
          isLinking={isLinking}
          onFeatureClick={handleMapFeatureClick}
          onMultiFeatureClick={(items, pixelX, pixelY) => {
            // pixelX/Y are relative to the inner map div (inside 12px padding)
            setPicker({ items, x: pixelX + 12, y: pixelY + 12 });
          }}
        />

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
              <div className="absolute inset-0 z-40" onClick={() => setPicker(null)} />
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
                    onClick={() => setPicker(null)}
                    className="text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {/* Scrollable list */}
                <ul style={{ maxHeight: MAX_VISIBLE * ITEM_H, overflowY: 'auto' }}>
                  {picker.items.map((item) => (
                    <li key={item.uuid}>
                      <button
                        className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors hover:bg-gray-50 ${item.isChecked ? 'bg-blue-50' : ''}`}
                        style={{ height: ITEM_H }}
                        onClick={() => {
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
      {activeGeometryDocId && (
        <div className="mx-3 mb-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 flex items-center gap-2">
          <span className="text-xs">🗺</span>
          <p className="text-xs text-gray-600 truncate flex-1">
            {String(geometries.find((g) => g.sourceDocId === activeGeometryDocId)
              ?.properties?.['beteckning'] ?? 'Detaljplan inläst')}
          </p>
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
      {geometries.length > 0 && (
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
        {geometries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-3xl mb-2">🗺</div>
            <p className="text-xs text-gray-400 font-medium">Ingen geometri inläst</p>
            <p className="text-xs text-gray-300 mt-1">
              Använd Data-menyn för att importera en detaljplan
            </p>
          </div>
        ) : filteredGeometries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-2xl mb-2">🔍</div>
            <p className="text-xs text-gray-400 font-medium">Inga träffar</p>
            <p className="text-xs text-gray-300 mt-1">Prova ett annat sökord eller filter</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {filteredGeometries.map((geo) => {
              const linkedTags = tags.filter((t) => t.geometryIds?.includes(geo.uuid));
              const linkedCount = linkedTags.length;
              const color = featureColor(geo.featureType);
              const icon = featureIcon(geo.featureType);

              // In normal mode: highlight if tag or click-selected
              const isSelected = !isLinking && (
                tagDerivedGeoUuids.includes(geo.uuid) ||
                clickedGeoUuid === geo.uuid
              );
              // In linking mode: checked means staged
              const isChecked = isLinking && stagedUuids.has(geo.uuid);
              const isExpanded = expandedGeoUuid === geo.uuid;

              return (
                <li key={geo.uuid} className="group" data-geometry-uuid={geo.uuid}>
                  <div
                    onClick={() => handleListItemClick(geo.uuid)}
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
                        {geo.name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {geo.featureType ?? geo.type}
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
                      {linkedTags.map((tag) => (
                        <li
                          key={tag.uuid}
                          onClick={(e) => handleTagSubClick(e, tag)}
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
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              unlinkGeometry(tag.uuid, geo.uuid);
                            }}
                            className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 ml-auto"
                            title="Avlänka"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </li>
                      ))}
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

      {/* ── Footer (normal mode) ────────────────────────────────────────── */}
      {!isLinking && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400 text-center">
            OpenLayers · OSM · EPSG:3009→4326
          </p>
        </div>
      )}
    </div>
  );
};
