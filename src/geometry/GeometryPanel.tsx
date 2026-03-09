/**
 * GeometryPanel.tsx
 *
 * Right-side panel showing:
 *  - An OpenLayers map (OSM background + detaljplan vector features)
 *  - JSON file upload button to import a detaljplan JSON
 *  - Export button to save the current geometry doc back to JSON
 *  - A list of geometry features with tag-linking support
 *
 * When `linkingTagUuid` is set in the store, clicking a map feature or a list
 * item completes the geometry → tag link.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { Tag } from '../types';
import { useDocumentStore } from '../store/useDocumentStore';
import { MapView } from './MapView';

// ─── Feature type icons / colours ─────────────────────────────────────────────

const FEATURE_ICONS: Record<string, string> = {
  detaljplan: '🗺',
  'användningsbestämmelse': '🟩',
  'egenskapsbestämmelse': '🟧',
};

const FEATURE_COLORS: Record<string, string> = {
  detaljplan: '#3b82f6',
  'användningsbestämmelse': '#10b981',
  'egenskapsbestämmelse': '#f59e0b',
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
    cancelLinking,
    selectTag,
    unlinkGeometry,
    importGeometryJson,
    removeGeometryDoc,
    exportGeometryJson,
  } = useDocumentStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [expandedGeoUuid, setExpandedGeoUuid] = useState<string | null>(null);

  const isLinking = !!linkingTagUuid;
  const linkingTag = tags.find((t) => t.uuid === linkingTagUuid);

  // Derive which geometry UUID is "selected" from the selected tag's geometryId
  const selectedGeometryUuid = selectedTagUuid
    ? (tags.find((t) => t.uuid === selectedTagUuid)?.geometryId ?? null)
    : null;

  // ── Auto-expand when a linked tag is selected ──────────────────────────────
  useEffect(() => {
    if (!selectedTagUuid) return;
    const tag = tags.find((t) => t.uuid === selectedTagUuid);
    if (tag?.geometryId) setExpandedGeoUuid(tag.geometryId);
  }, [selectedTagUuid, tags]);

  // ── JSON file import ───────────────────────────────────────────────────────
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setImportError(null);
      setIsImporting(true);
      try {
        const text = await file.text();
        const rawJson = JSON.parse(text) as Record<string, unknown>;
        await importGeometryJson(rawJson, file.name);
      } catch (err) {
        setImportError(
          err instanceof Error ? err.message : 'Kunde inte importera filen.'
        );
      } finally {
        setIsImporting(false);
        // Reset so the same file can be re-imported if needed
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [importGeometryJson]
  );

  // ── Map feature click ──────────────────────────────────────────────────────
  const handleMapFeatureClick = useCallback(
    (uuid: string) => {
      if (isLinking && linkingTagUuid) {
        finishLinking(linkingTagUuid, uuid);
        return;
      }
      // Pan to this geometry by selecting the first linked tag
      const linkedTags = tags.filter((t) => t.geometryId === uuid);
      if (linkedTags.length > 0) {
        selectTag(linkedTags[0].uuid);
      }
      setExpandedGeoUuid((prev) => (prev === uuid ? null : uuid));
    },
    [isLinking, linkingTagUuid, finishLinking, tags, selectTag]
  );

  // ── List item click ────────────────────────────────────────────────────────
  const handleListItemClick = useCallback(
    (uuid: string) => {
      if (isLinking && linkingTagUuid) {
        finishLinking(linkingTagUuid, uuid);
        return;
      }
      setExpandedGeoUuid((prev) => (prev === uuid ? null : uuid));
    },
    [isLinking, linkingTagUuid, finishLinking]
  );

  const handleTagSubClick = useCallback(
    (e: React.MouseEvent, tag: Tag) => {
      e.stopPropagation();
      selectTag(tag.uuid);
    },
    [selectTag]
  );

  // ── Remove the loaded geometry document ────────────────────────────────────
  const handleRemoveDoc = useCallback(async () => {
    if (!activeGeometryDocId) return;
    if (!window.confirm('Ta bort inläst detaljplan och avlänka alla kopplingar?')) return;
    await removeGeometryDoc(activeGeometryDocId);
  }, [activeGeometryDocId, removeGeometryDoc]);

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-700 truncate">Karta</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {geometries.length} geometrier
          </p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Export button (only shown when a doc is loaded) */}
          {activeGeometryDocId && (
            <button
              onClick={exportGeometryJson}
              className="px-2 py-1 text-xs rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
              title="Exportera JSON"
            >
              ↓
            </button>
          )}

          {/* Remove doc button */}
          {activeGeometryDocId && (
            <button
              onClick={handleRemoveDoc}
              className="px-2 py-1 text-xs rounded-lg border border-gray-200 hover:bg-red-50 text-red-400 transition-colors"
              title="Ta bort inläst detaljplan"
            >
              ✕
            </button>
          )}

          {/* Import JSON button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="px-2 py-1 text-xs rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors disabled:opacity-50"
            title="Importera detaljplan-JSON"
          >
            {isImporting ? '…' : '＋ JSON'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* ── Import error ─────────────────────────────────────────────────── */}
      {importError && (
        <div className="mx-3 mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          <span className="font-medium">Fel: </span>{importError}
          <button
            onClick={() => setImportError(null)}
            className="ml-2 text-red-400 hover:text-red-600"
          >✕</button>
        </div>
      )}

      {/* ── Linking mode banner ──────────────────────────────────────────── */}
      {isLinking && (
        <div className="mx-3 mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
            <p className="text-xs text-blue-700 font-medium truncate">
              Klicka på ett område för att länka "{linkingTag?.text?.slice(0, 25)}…"
            </p>
          </div>
          <button
            onClick={cancelLinking}
            className="text-blue-400 hover:text-blue-600 flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2" style={{ height: '240px' }}>
        <MapView
          geometries={geometries}
          selectedGeometryUuid={selectedGeometryUuid}
          isLinking={isLinking}
          onFeatureClick={handleMapFeatureClick}
        />
      </div>

      {/* ── Active geometry doc info ─────────────────────────────────────── */}
      {activeGeometryDocId && (
        <div className="mx-3 mb-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 flex items-center gap-2">
          <span className="text-xs">🗺</span>
          <p className="text-xs text-gray-600 truncate flex-1">
            {geometries.find((g) => g.sourceDocId === activeGeometryDocId)
              ?.properties?.['beteckning'] as string
              ?? 'Detaljplan inläst'}
          </p>
        </div>
      )}

      {/* ── Geometry list ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {geometries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-3xl mb-2">🗺</div>
            <p className="text-xs text-gray-400 font-medium">Ingen geometri inläst</p>
            <p className="text-xs text-gray-300 mt-1">
              Klicka på "+ JSON" för att importera en detaljplan
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {geometries.map((geo) => {
              const linkedTags = tags.filter((t) => t.geometryId === geo.uuid);
              const linkedCount = linkedTags.length;
              const color = featureColor(geo.featureType);
              const icon = featureIcon(geo.featureType);
              const isSelected = selectedGeometryUuid === geo.uuid;
              const isExpanded = expandedGeoUuid === geo.uuid;

              return (
                <li key={geo.uuid} className="group">
                  <div
                    onClick={() => handleListItemClick(geo.uuid)}
                    className={`flex items-start gap-2 px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                      isLinking
                        ? 'border-blue-200 hover:border-blue-400 hover:bg-blue-50'
                        : isSelected
                          ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-400'
                          : 'border-transparent hover:bg-gray-50'
                    }`}
                  >
                    {/* Feature type icon */}
                    <span className="text-sm flex-shrink-0 mt-0.5">{icon}</span>

                    {/* Name & meta */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-medium truncate"
                        style={{ color: isSelected ? '#1d4ed8' : '#374151' }}
                      >
                        {geo.name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {geo.featureType ?? geo.type}
                        {linkedCount > 0 && (
                          <span className="ml-1 text-blue-500">· {linkedCount} tagg{linkedCount !== 1 ? 'ar' : ''}</span>
                        )}
                      </p>
                    </div>

                    {/* Expand chevron */}
                    {linkedCount > 0 && (
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

                  {/* ── Linked tags sub-list ──────────────────────────────── */}
                  {isExpanded && linkedTags.length > 0 && (
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
                              unlinkGeometry(tag.uuid);
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

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
        <p className="text-xs text-gray-400 text-center">
          OpenLayers · OSM · EPSG:3009→4326
        </p>
      </div>
    </div>
  );
};
