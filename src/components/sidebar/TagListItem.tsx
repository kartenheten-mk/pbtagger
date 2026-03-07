import React from 'react';
import type { Category, Tag, Geometry } from '../../types';
import { TagBadge } from '../TagBadge';
import { getCategoryLabel } from '../../data/categoryUtils';

export interface TagListItemProps {
  tag: Tag;
  category?: Category;
  geometry?: Geometry;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onLinkGeometry: () => void;
  onUnlinkGeometry: () => void;
}

export const TagListItem: React.FC<TagListItemProps> = ({
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
      className={`px-3 py-2.5 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
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
            <span className="text-xs text-green-600 truncate font-medium">{geometry.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUnlinkGeometry();
              }}
              className="text-gray-300 hover:text-gray-500 ml-auto flex-shrink-0"
              title="Avlänka geometri"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            Länka till geometri
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
