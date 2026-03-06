/**
 * Sidebar.tsx
 *
 * Left sidebar showing:
 *  - Tema filter tabs (colour-coded)
 *  - List of applied tags with remove / link-to-geometry actions
 *  - Tema legend at the bottom
 */

import React, { useState } from 'react';
import type { Category, Tag, Geometry, Tema } from '../types';
import { TagBadge } from './TagBadge';
import { getCategoryLabel } from '../data/categoryUtils';
import { useDocumentStore } from '../store/useDocumentStore';

interface SidebarProps {
  teman: Tema[];
  categories: Category[];
}

export const Sidebar: React.FC<SidebarProps> = ({ teman, categories }) => {
  const {
    tags,
    geometries,
    selectedTagUuid,
    selectTag,
    removeTag,
    startLinking,
    unlinkGeometry,
  } = useDocumentStore();

  const [filterTemaId, setFilterTemaId] = useState<string>('all');

  const filteredTags =
    filterTemaId === 'all'
      ? tags
      : tags.filter((t) => {
          const cat = categories.find((c) => c.id === t.categoryId);
          return cat?.temaId === filterTemaId;
        });

  const getCategoryById = (id: string): Category | undefined =>
    categories.find((c) => c.id === id);

  const getGeometryById = (id?: string): Geometry | undefined =>
    id ? geometries.find((g) => g.uuid === id) : undefined;

  // Count tags per tema
  const countForTema = (temaId: string) =>
    tags.filter((t) => {
      const cat = categories.find((c) => c.id === t.categoryId);
      return cat?.temaId === temaId;
    }).length;

  return (
    <aside className="w-72 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">Taggar</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {tags.length} totalt · {filteredTags.length} visas
        </p>
      </div>

      {/* Tema filter */}
      <div className="px-3 py-2 border-b border-gray-100 flex gap-1 flex-wrap">
        <button
          onClick={() => setFilterTemaId('all')}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            filterTemaId === 'all'
              ? 'bg-gray-800 text-white'
              : 'text-gray-500 hover:bg-gray-100'
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
              onClick={() => setFilterTemaId(tema.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                filterTemaId === tema.id ? 'text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
              style={filterTemaId === tema.id ? { backgroundColor: tema.color } : {}}
              title={tema.name}
            >
              {/* Show abbreviated tema name to save space */}
              {tema.name.split(' ').slice(0, 2).join(' ')}
              {count > 0 && (
                <span className="opacity-75 ml-1">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tag list */}
      <div className="flex-1 overflow-y-auto">
        {filteredTags.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">Inga taggar ännu</p>
            <p className="text-xs text-gray-400 mt-1">
              Markera text i dokumentet för att applicera en tagg
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50 py-1">
            {filteredTags.map((tag) => (
              <TagListItem
                key={tag.uuid}
                tag={tag}
                category={getCategoryById(tag.categoryId)}
                geometry={getGeometryById(tag.geometryId)}
                isSelected={selectedTagUuid === tag.uuid}
                onSelect={() => selectTag(tag.uuid === selectedTagUuid ? null : tag.uuid)}
                onRemove={() => removeTag(tag.uuid)}
                onLinkGeometry={() => startLinking(tag.uuid)}
                onUnlinkGeometry={() => unlinkGeometry(tag.uuid)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Tema legend */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
          Teman
        </p>
        <div className="space-y-1">
          {teman.map((tema) => (
            <div key={tema.id} className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: tema.color }}
              />
              <span className="text-xs text-gray-600">{tema.name}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};

// ─── Tag list item ────────────────────────────────────────────────────────────

interface TagListItemProps {
  tag: Tag;
  category?: Category;
  geometry?: Geometry;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onLinkGeometry: () => void;
  onUnlinkGeometry: () => void;
}

const TagListItem: React.FC<TagListItemProps> = ({
  tag,
  category,
  geometry,
  isSelected,
  onSelect,
  onRemove,
  onLinkGeometry,
  onUnlinkGeometry,
}) => {
  return (
    <li
      className={`px-3 py-2.5 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
      }`}
      onClick={onSelect}
    >
      {/* Category badge + remove button */}
      <div className="flex items-start justify-between gap-2 mb-1">
        {category ? (
          <TagBadge category={category} size="sm" />
        ) : (
          <span className="text-xs text-gray-400">Okänd</span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
          title="Ta bort tagg"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Breadcrumb path (tema › grupp › undergrupp) */}
      {category && (
        <p className="text-xs text-gray-400 mb-0.5 truncate" title={getCategoryLabel(category)}>
          {getCategoryLabel(category)}
        </p>
      )}

      {/* Tag text */}
      <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">
        "{tag.text}"
      </p>

      {/* Note */}
      {tag.note && (
        <p className="text-xs text-gray-400 italic mt-1 line-clamp-1">{tag.note}</p>
      )}

      {/* Geometry link */}
      <div className="mt-2 flex items-center gap-1.5">
        {geometry ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
            <span className="text-xs text-green-600 truncate font-medium">
              {geometry.name}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUnlinkGeometry();
              }}
              className="text-gray-300 hover:text-gray-500 ml-auto flex-shrink-0"
              title="Avlänka geometri"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLinkGeometry();
            }}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Länka till geometri
          </button>
        )}
      </div>

      {/* UUID (truncated, for debugging) */}
      {isSelected && (
        <p className="text-xs text-gray-300 mt-1 font-mono truncate">
          {tag.uuid}
        </p>
      )}
    </li>
  );
};
