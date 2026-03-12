import React from 'react';
import type { Category, Tag, Geometry } from '../../types';
import { TagBadge } from '../TagBadge';
import { getCategoryLabel } from '../../data/categoryUtils';

export interface TagListItemProps {
  tag: Tag;
  category?: Category;
  /** All geometries linked to this tag */
  linkedGeometries: Geometry[];
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onLinkGeometry: () => void;
  /** Unlink a specific geometry from this tag */
  onUnlinkGeometry: (geometryUuid: string) => void;
}

const TARGET_LABEL: Record<'text' | 'image' | 'graph' | 'table', string> = {
  text: 'TEXT',
  image: 'BILD',
  graph: 'DIAGRAM',
  table: 'TABELL',
};

export const TagListItem: React.FC<TagListItemProps> = ({
  tag,
  category,
  linkedGeometries,
  isSelected,
  onSelect,
  onRemove,
  onLinkGeometry,
  onUnlinkGeometry,
}) => {
  const targetType = tag.targetType ?? 'text';
  const hasGeometries = linkedGeometries.length > 0;

  // Show first 2 chips inline, rest collapsed
  const visibleGeos = linkedGeometries.slice(0, 2);
  const hiddenCount = linkedGeometries.length - visibleGeos.length;

  return (
    <li
      className={`px-3 py-2.5 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
      }`}
      onClick={onSelect}
      data-tag-uuid={tag.uuid}
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      {/* Breadcrumb path */}
      {category && (
        <p className="text-xs text-gray-400 mb-0.5 truncate" title={getCategoryLabel(category)}>
          {getCategoryLabel(category)}
        </p>
      )}

      {/* Target type */}
      <div className="mb-1">
        <span className="text-[10px] font-semibold tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
          {TARGET_LABEL[targetType]}
        </span>
      </div>

      {/* Tag text */}
      <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">
        {targetType === 'text' ? `"${tag.text}"` : tag.text}
      </p>

      {/* Note */}
      {tag.note && (
        <p className="text-xs text-gray-400 italic mt-1 line-clamp-1">{tag.note}</p>
      )}

      {/* Geometry links */}
      <div className="mt-2">
        {hasGeometries ? (
          <div className="space-y-1">
            {/* Linked geometry chips */}
            <div className="flex flex-wrap gap-1">
              {visibleGeos.map((geo) => (
                <div
                  key={geo.uuid}
                  className="flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 rounded-full max-w-full"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                  <span className="text-xs text-green-700 font-medium truncate max-w-[120px]">
                    {geo.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnlinkGeometry(geo.uuid);
                    }}
                    className="text-green-300 hover:text-red-400 transition-colors flex-shrink-0 ml-0.5"
                    title={`Avlänka ${geo.name}`}
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {hiddenCount > 0 && (
                <div className="flex items-center px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-full">
                  <span className="text-xs text-gray-500 font-medium">+{hiddenCount}</span>
                </div>
              )}
            </div>

            {/* Edit geometry links button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLinkGeometry();
              }}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors mt-0.5"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Ändra geometrier
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            Länka till geometrier
          </button>
        )}
      </div>

      {/* UUID debug info */}
      {isSelected && (
        <p className="text-xs text-gray-300 mt-1 font-mono truncate">{tag.uuid}</p>
      )}
    </li>
  );
};
