/**
 * GeometryPanel.tsx
 *
 * Right-side panel showing an interactive canvas placeholder for geometries.
 *
 * This is the geometry management surface. Currently it renders:
 *  - A canvas placeholder grid representing the spatial surface
 *  - A list of existing geometries
 *  - Controls to add mock geometries (point / polygon / line)
 *
 * When `linkingTagUuid` is set in the store, the panel enters "linking mode"
 * where clicking a geometry completes the link.
 *
 * Replace the canvas with a real map (Leaflet / MapLibre / OpenLayers) when
 * ready — just fire `onGeometryClick(geometry.uuid)` from the map event handler.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Geometry, GeometryType, Tag } from '../types';
import { useDocumentStore } from '../store/useDocumentStore';

// ─── Mock geometry colours ────────────────────────────────────────────────────
const TYPE_COLORS: Record<GeometryType, string> = {
  point: '#3b82f6',
  polygon: '#10b981',
  line: '#f59e0b',
};

const TYPE_ICONS: Record<GeometryType, string> = {
  point: '●',
  polygon: '⬡',
  line: '—',
};

export const GeometryPanel: React.FC = () => {
  const {
    geometries,
    tags,
    linkingTagUuid,
    selectedTagUuid,
    addGeometry,
    removeGeometry,
    finishLinking,
    cancelLinking,
    selectTag,
  } = useDocumentStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredUuid, setHoveredUuid] = useState<string | null>(null);
  const [expandedGeoUuid, setExpandedGeoUuid] = useState<string | null>(null);

  const isLinking = !!linkingTagUuid;
  const linkingTag = tags.find((t) => t.uuid === linkingTagUuid);

  // ── Draw the canvas ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    const GRID = 40;
    for (let x = 0; x <= W; x += GRID) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += GRID) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Draw geometries as simple icons on the canvas
    geometries.forEach((geo, i) => {
      const col = (i % 4) * (W / 4) + W / 8;
      const row = Math.floor(i / 4) * 80 + 60;
      const color = TYPE_COLORS[geo.type];
      const isHovered = hoveredUuid === geo.uuid;
      const isSelected = selectedTagUuid && tags.find((t) => t.uuid === selectedTagUuid)?.geometryId === geo.uuid;

      ctx.fillStyle = isHovered || isSelected ? color + 'dd' : color + '55';
      ctx.strokeStyle = color;
      ctx.lineWidth = isHovered || isSelected ? 2 : 1.5;

      if (geo.type === 'point') {
        ctx.beginPath();
        ctx.arc(col, row, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (geo.type === 'polygon') {
        const size = 14;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const angle = (k * Math.PI) / 3 - Math.PI / 6;
          const px = col + size * Math.cos(angle);
          const py = row + size * Math.sin(angle);
          k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(col - 16, row);
        ctx.lineTo(col + 16, row);
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(col - 16, row, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(col + 16, row, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Label
      ctx.fillStyle = '#374151';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(geo.name.slice(0, 12), col, row + 26);
    });

    // Linking mode overlay
    if (isLinking) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.06)';
      ctx.fillRect(0, 0, W, H);
    }
  }, [geometries, hoveredUuid, isLinking]);

  // ── Add a mock geometry ─────────────────────────────────────────────────────
  const addMockGeometry = useCallback(
    (type: GeometryType) => {
      const names: Record<GeometryType, string> = {
        point: `Point ${geometries.filter((g) => g.type === 'point').length + 1}`,
        polygon: `Area ${geometries.filter((g) => g.type === 'polygon').length + 1}`,
        line: `Route ${geometries.filter((g) => g.type === 'line').length + 1}`,
      };
      addGeometry({
        uuid: uuidv4(),
        name: names[type],
        type,
        coordinates: [],
        color: TYPE_COLORS[type],
      });
    },
    [addGeometry, geometries]
  );

  const handleGeometryClick = useCallback(
    (geo: Geometry) => {
      if (isLinking && linkingTagUuid) {
        finishLinking(linkingTagUuid, geo.uuid);
        return;
      }
      // Toggle expansion to show linked tags
      const linkedTags = tags.filter((t) => t.geometryId === geo.uuid);
      if (linkedTags.length === 0) return;
      if (linkedTags.length === 1) {
        // Only one tag — pan directly to it
        selectTag(linkedTags[0].uuid);
        setExpandedGeoUuid(null);
        return;
      }
      // Multiple tags — toggle the dropdown
      setExpandedGeoUuid((prev) => (prev === geo.uuid ? null : geo.uuid));
    },
    [isLinking, linkingTagUuid, finishLinking, tags, selectTag]
  );

  const handleTagSubClick = useCallback(
    (e: React.MouseEvent, tag: Tag) => {
      e.stopPropagation();
      selectTag(tag.uuid);
    },
    [selectTag]
  );

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Geometries</h2>
          <p className="text-xs text-gray-400 mt-0.5">{geometries.length} items</p>
        </div>
        {/* Add geometry buttons */}
        <div className="flex gap-1">
          {(['point', 'polygon', 'line'] as GeometryType[]).map((type) => (
            <button
              key={type}
              onClick={() => addMockGeometry(type)}
              className="px-2 py-1 text-xs rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
              title={`Add ${type}`}
              style={{ color: TYPE_COLORS[type] }}
            >
              {TYPE_ICONS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Linking mode banner */}
      {isLinking && (
        <div className="mx-3 mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
            <p className="text-xs text-blue-700 font-medium truncate">
              Click a geometry to link "{linkingTag?.text?.slice(0, 30)}…"
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

      {/* Canvas */}
      <div className="px-3 py-3">
        <div className="relative rounded-xl overflow-hidden border border-gray-200">
          <canvas
            ref={canvasRef}
            width={288}
            height={200}
            className="block w-full"
            style={{ imageRendering: 'pixelated' }}
          />
          {geometries.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
              <p className="text-xs text-gray-400 font-medium">No geometries yet</p>
              <p className="text-xs text-gray-300 mt-1">
                Use the + buttons above to add geometries
              </p>
            </div>
          )}
          {/* Map placeholder badge */}
          <div className="absolute top-2 right-2 px-2 py-0.5 bg-white/80 backdrop-blur-sm rounded-md border border-gray-200">
            <span className="text-xs text-gray-400">Map placeholder</span>
          </div>
        </div>
      </div>

      {/* Geometry list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {geometries.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            Add geometries using the buttons above
          </p>
        ) : (
          <ul className="space-y-1">
            {geometries.map((geo) => {
              const linkedTags = tags.filter((t) => t.geometryId === geo.uuid);
              const linkedCount = linkedTags.length;
              const color = TYPE_COLORS[geo.type];
              const isSelected = selectedTagUuid && tags.find((t) => t.uuid === selectedTagUuid)?.geometryId === geo.uuid;
              const isExpanded = expandedGeoUuid === geo.uuid;
              const hasLinkedTags = linkedCount > 0;

              return (
                <li key={geo.uuid} className="group">
                  <div
                    onMouseEnter={() => setHoveredUuid(geo.uuid)}
                    onMouseLeave={() => setHoveredUuid(null)}
                    onClick={() => handleGeometryClick(geo)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${isLinking
                      ? 'cursor-pointer border-blue-200 hover:border-blue-400 hover:bg-blue-50'
                      : hasLinkedTags
                        ? isSelected
                          ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-500 cursor-pointer'
                          : 'border-transparent hover:bg-gray-50 cursor-pointer'
                        : 'border-transparent hover:bg-gray-50 cursor-default'
                      } ${hoveredUuid === geo.uuid && !isSelected ? 'bg-gray-50' : ''}`}
                  >
                    {/* Type icon */}
                    <span
                      className="text-base flex-shrink-0 w-6 text-center"
                      style={{ color }}
                    >
                      {TYPE_ICONS[geo.type]}
                    </span>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{geo.name}</p>
                      <p className="text-xs text-gray-400">
                        {geo.type} · {linkedCount} tag{linkedCount !== 1 ? 's' : ''}
                      </p>
                    </div>

                    {/* Expand chevron (only if multiple linked tags) */}
                    {linkedCount > 1 && (
                      <svg
                        className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''
                          }`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}

                    {/* Pan icon (only if exactly 1 tag) */}
                    {linkedCount === 1 && (
                      <span title="Pan to tag">
                        <svg
                          className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 transition-colors flex-shrink-0"
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                    )}

                    {/* Colour swatch */}
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />

                    {/* Remove */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeGeometry(geo.uuid);
                      }}
                      className="text-gray-200 hover:text-red-400 transition-colors flex-shrink-0"
                      title="Remove geometry"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  {/* ── Expanded sub-list of linked tags ─────────────────── */}
                  {isExpanded && linkedTags.length > 0 && (
                    <ul className="mt-1 ml-6 mr-2 space-y-0.5 border-l-2 border-gray-100 pl-3 pb-1">
                      {linkedTags.map((tag) => (
                        <li
                          key={tag.uuid}
                          onClick={(e) => handleTagSubClick(e, tag)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-all text-xs ${selectedTagUuid === tag.uuid
                            ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-300'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                            }`}
                        >
                          {/* Tag icon */}
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                          {/* Tag text preview */}
                          <span className="truncate">
                            {tag.text.length > 50 ? tag.text.slice(0, 50) + '…' : tag.text}
                          </span>
                          {/* Pan arrow */}
                          <svg className="w-3 h-3 flex-shrink-0 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
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

      {/* Footer note */}
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
        <p className="text-xs text-gray-400 text-center">
          Replace canvas with a real map (Leaflet / MapLibre)
        </p>
      </div>
    </div>
  );
};
