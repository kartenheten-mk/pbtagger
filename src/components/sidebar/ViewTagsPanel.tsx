import React, { useState } from 'react';
import type { Tema, Tag, Category, Geometry } from '../../types';
import { TagListItem } from './TagListItem';

export interface ViewTagsPanelProps {
  teman: Tema[];
  tags: Tag[];
  categories: Category[];
  selectedTagUuid: string | null;
  getCategoryById: (id: string) => Category | undefined;
  getGeometryById: (id?: string) => Geometry | undefined;
  onSelectTag: (uuid: string) => void;
  onRemoveTag: (uuid: string) => void;
  onLinkGeometry: (tagUuid: string) => void;
  onUnlinkGeometry: (tagUuid: string) => void;
}

export const ViewTagsPanel: React.FC<ViewTagsPanelProps> = ({
  teman,
  tags,
  categories,
  selectedTagUuid,
  getCategoryById,
  getGeometryById,
  onSelectTag,
  onRemoveTag,
  onLinkGeometry,
  onUnlinkGeometry,
}) => {
  const [filterTemaId, setFilterTemaId] = useState<string>('all');

  const filteredTags =
    filterTemaId === 'all'
      ? tags
      : tags.filter((t) => {
        const cat = categories.find((c) => c.id === t.categoryId);
        return cat?.temaId === filterTemaId;
      });

  const countForTema = (temaId: string) =>
    tags.filter((t) => {
      const cat = categories.find((c) => c.id === t.categoryId);
      return cat?.temaId === temaId;
    }).length;

  return (
    <>
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-100">
        <p className="text-xs text-gray-400">
          {tags.length} totalt · {filteredTags.length} visas
        </p>
      </div>

      {/* Tema filter */}
      <div className="px-3 py-2 border-b border-gray-100 flex gap-1 flex-wrap">
        <button
          onClick={() => setFilterTemaId('all')}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterTemaId === 'all'
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
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterTemaId === tema.id
                ? 'text-white'
                : 'text-gray-500 hover:bg-gray-100'
                }`}
              style={filterTemaId === tema.id ? { backgroundColor: tema.color } : {}}
              title={tema.name}
            >
              {tema.name.split(' ').slice(0, 2).join(' ')}
              <span className="opacity-75 ml-1">({count})</span>
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
                onSelect={() => onSelectTag(tag.uuid)}
                onRemove={() => onRemoveTag(tag.uuid)}
                onLinkGeometry={() => onLinkGeometry(tag.uuid)}
                onUnlinkGeometry={() => onUnlinkGeometry(tag.uuid)}
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
    </>
  );
};
