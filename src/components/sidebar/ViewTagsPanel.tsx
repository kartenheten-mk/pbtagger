import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Tema, Tag, Category, Geometry } from '../../types';
import { splitGeometriesBySource } from '../../geometry/geometrySource';
import { buildMirroredDisplayLinks } from '../../geometry/tagLinkMirror';
import { TagListItem, type LinkedGeometryView } from './TagListItem';
import { hexToRgba } from './utils';

export interface ViewTagsPanelProps {
  teman: Tema[];
  tags: Tag[];
  categories: Category[];
  geometries: Geometry[];
  selectedTagUuid: string | null;
  getCategoryById: (id: string) => Category | undefined;
  onSelectTag: (uuid: string) => void;
  onRemoveTag: (uuid: string) => void;
  onLinkGeometry: (tagUuid: string) => void;
  /** Unlink a specific geometry UUID from a tag */
  onUnlinkGeometry: (tagUuid: string, geometryUuid: string) => void;
}

interface BuildLinkedGeometryViewsArgs {
  tag: Tag;
  geometryByUuid: Map<string, Geometry>;
  jsonGeometryIdSet: Set<string>;
  docxGmlGeometryIdSet: Set<string>;
  mirroredDocxGeometryIds: Set<string>;
}

export function buildLinkedGeometryViewsForSidebar({
  tag,
  geometryByUuid,
  jsonGeometryIdSet,
  docxGmlGeometryIdSet,
  mirroredDocxGeometryIds,
}: BuildLinkedGeometryViewsArgs): LinkedGeometryView[] {
  const explicitGeometryIds = tag.geometryIds ?? [];

  const buildViews = (ids: string[], canUnlink: boolean): LinkedGeometryView[] => {
    const seen = new Set<string>();
    const views: LinkedGeometryView[] = [];

    for (const id of ids) {
      if (seen.has(id)) continue;
      const geometry = geometryByUuid.get(id);
      if (!geometry) continue;

      seen.add(id);
      views.push({ geometry, canUnlink });
    }

    return views;
  };

  const explicitJsonGeometryIds = explicitGeometryIds.filter((id) =>
    jsonGeometryIdSet.has(id)
  );
  if (explicitJsonGeometryIds.length > 0) {
    return buildViews(explicitJsonGeometryIds, true);
  }

  const explicitLoadedGeometryViews = buildViews(explicitGeometryIds, true);
  if (explicitLoadedGeometryViews.length > 0) {
    return explicitLoadedGeometryViews;
  }

  const mirroredDocxIds = Array.from(mirroredDocxGeometryIds).filter((id) =>
    docxGmlGeometryIdSet.has(id)
  );
  return buildViews(mirroredDocxIds, false);
}

export const ViewTagsPanel: React.FC<ViewTagsPanelProps> = ({
  teman,
  tags,
  categories,
  geometries,
  selectedTagUuid,
  getCategoryById,
  onSelectTag,
  onRemoveTag,
  onLinkGeometry,
  onUnlinkGeometry,
}) => {
  const [filterTemaId, setFilterTemaId] = useState<string>('all');
  const [isFilterExpanded, setIsFilterExpanded] = useState(true);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const { json: jsonGeometries, docxGml: docxGmlGeometries } = useMemo(
    () => splitGeometriesBySource(geometries),
    [geometries]
  );

  const geometryByUuid = useMemo(
    () => new Map(geometries.map((geometry) => [geometry.uuid, geometry])),
    [geometries]
  );

  const jsonGeometryIdSet = useMemo(
    () => new Set(jsonGeometries.map((geometry) => geometry.uuid)),
    [jsonGeometries]
  );

  const docxGmlGeometryIdSet = useMemo(
    () => new Set(docxGmlGeometries.map((geometry) => geometry.uuid)),
    [docxGmlGeometries]
  );

  const mirroredDisplayLinksByTagUuid = useMemo(
    () => buildMirroredDisplayLinks(tags, jsonGeometryIdSet, docxGmlGeometries),
    [tags, jsonGeometryIdSet, docxGmlGeometries]
  );

  // ── Auto-scroll to selected tag ──────────────────────────────────────────
  useEffect(() => {
    if (!selectedTagUuid || !listContainerRef.current) return;

    // Small delay to ensure the item is rendered/filtered
    const timer = setTimeout(() => {
      const selectedEl = listContainerRef.current?.querySelector(`[data-tag-uuid="${selectedTagUuid}"]`);
      if (selectedEl) {
        selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [selectedTagUuid, filterTemaId]);

  // ── Auto-reset filter if selected tag is hidden ──────────────────────────
  useEffect(() => {
    if (!selectedTagUuid || filterTemaId === 'all') return;

    const tag = tags.find((t) => t.uuid === selectedTagUuid);
    if (!tag) return;

    const cat = categories.find((c) => c.id === tag.categoryId);
    if (cat && cat.temaId !== filterTemaId) {
      setFilterTemaId('all');
    }
  }, [selectedTagUuid, tags, categories, filterTemaId]);

  const filteredTags = (
    filterTemaId === 'all'
      ? tags
      : tags.filter((t) => {
        const cat = categories.find((c) => c.id === t.categoryId);
        return cat?.temaId === filterTemaId;
      })
  ).slice().sort((a, b) => a.paragraphIndex - b.paragraphIndex || a.startOffset - b.startOffset);

  const countForTema = (temaId: string) =>
    tags.filter((t) => {
      const cat = categories.find((c) => c.id === t.categoryId);
      return cat?.temaId === temaId;
    }).length;

  return (
    <>
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {tags.length} totalt · {filteredTags.length} visas
        </p>
        <button
          onClick={() => setIsFilterExpanded(!isFilterExpanded)}
          className="p-1 hover:bg-gray-100 rounded-md transition-colors text-gray-400 hover:text-gray-600"
          title={isFilterExpanded ? "Dölj filter" : "Visa filter"}
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${isFilterExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Tema filter */}
      <div
        className={`px-3 overflow-hidden transition-all duration-300 ease-in-out border-b border-gray-100 flex gap-1.5 flex-wrap ${isFilterExpanded ? 'py-2 opacity-100' : 'max-h-0 py-0 opacity-0 pointer-events-none border-b-0'
          }`}
      >
        <button
          onClick={() => setFilterTemaId('all')}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${filterTemaId === 'all'
            ? 'bg-gray-800 text-white shadow-sm'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
        >
          Alla
        </button>
        {teman.map((tema) => {
          const count = countForTema(tema.id);
          if (count === 0) return null;
          return (
            <button
              key={tema.id}
              onClick={() => {
                setFilterTemaId(tema.id);
                // If a tag is selected and it doesn't belong to this theme, deselect it
                if (selectedTagUuid) {
                  const tag = tags.find((t) => t.uuid === selectedTagUuid);
                  const cat = categories.find((c) => c.id === tag?.categoryId);
                  if (cat && cat.temaId !== tema.id) {
                    onSelectTag(selectedTagUuid); // Toggle off by passing current uuid (which triggers the toggle logic in Sidebar.tsx)
                  }
                }
              }}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${filterTemaId === tema.id
                ? 'text-white shadow-sm'
                : 'hover:brightness-95'
                }`}
              style={{
                backgroundColor: filterTemaId === tema.id ? tema.color : hexToRgba(tema.color, 0.1),
                color: filterTemaId === tema.id ? 'white' : tema.color
              }}
              title={tema.name}
            >
              <span className="truncate max-w-[120px] inline-block align-bottom">
                {tema.name}
              </span>
              <span className="opacity-75 ml-1">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Tag list */}
      <div className="flex-1 overflow-y-auto" ref={listContainerRef}>
        {filteredTags.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">Inga taggar ännu</p>
            <p className="text-xs text-gray-400 mt-1">
              Markera text, bild, diagram eller tabell för att applicera en tagg
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50 py-1">
            {filteredTags.map((tag) => {
              const linkedGeometries = buildLinkedGeometryViewsForSidebar({
                tag,
                geometryByUuid,
                jsonGeometryIdSet,
                docxGmlGeometryIdSet,
                mirroredDocxGeometryIds:
                  mirroredDisplayLinksByTagUuid.get(tag.uuid) ?? new Set<string>(),
              });

              return (
                <TagListItem
                  key={tag.uuid}
                  tag={tag}
                  category={getCategoryById(tag.categoryId)}
                  linkedGeometries={linkedGeometries}
                  isSelected={selectedTagUuid === tag.uuid}
                  onSelect={() => onSelectTag(tag.uuid)}
                  onRemove={() => onRemoveTag(tag.uuid)}
                  onLinkGeometry={() => onLinkGeometry(tag.uuid)}
                  onUnlinkGeometry={(geoUuid) => onUnlinkGeometry(tag.uuid, geoUuid)}
                />
              );
            })}
          </ul>
        )}
      </div>

    </>
  );
};
