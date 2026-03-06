/**
 * TagPopover.tsx
 *
 * A floating popover that appears when the user has selected text in the
 * editor and wants to apply a tag. The user picks a category and optionally
 * adds a note, then clicks "Apply Tag".
 */

import React, { useState, useEffect, useRef } from 'react';
import type { Category } from '../types';

interface TagPopoverProps {
  /** Position (px) relative to the viewport */
  position: { top: number; left: number };
  /** Selected text content */
  selectedText: string;
  categories: Category[];
  onApply: (categoryId: string, note: string) => void;
  onCancel: () => void;
}

export const TagPopover: React.FC<TagPopoverProps> = ({
  position,
  selectedText,
  categories,
  onApply,
  onCancel,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    categories[0]?.id ?? ''
  );
  const [note, setNote] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onCancel]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  // Clamp position to stay inside viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(position.top, window.innerHeight - 280),
    left: Math.min(position.left, window.innerWidth - 320),
    zIndex: 1000,
  };

  return (
    <div
      ref={containerRef}
      style={style}
      className="w-72 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Apply Tag</h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Selected text preview */}
        <div>
          <p className="text-xs text-gray-500 mb-1 font-medium">Selected text</p>
          <p className="text-xs text-gray-700 bg-gray-50 rounded p-2 line-clamp-2 font-mono border border-gray-100">
            "{selectedText.length > 80 ? selectedText.slice(0, 80) + '…' : selectedText}"
          </p>
        </div>

        {/* Category picker */}
        <div>
          <p className="text-xs text-gray-500 mb-1.5 font-medium">Category</p>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                  selectedCategoryId === cat.id
                    ? 'bg-gray-100 ring-1 ring-offset-0'
                    : 'hover:bg-gray-50'
                }`}
                style={
                  selectedCategoryId === cat.id
                    ? { outline: `2px solid ${cat.color}`, outlineOffset: '0px' }
                    : {}
                }
              >
                {/* Colour swatch */}
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="font-medium text-gray-700">{cat.name}</span>
                {cat.description && (
                  <span className="text-gray-400 text-xs truncate ml-auto">
                    {cat.description.slice(0, 20)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="text-xs text-gray-500 font-medium block mb-1">
            Note <span className="font-normal">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Add a note..."
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700 placeholder-gray-300"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (selectedCategoryId) onApply(selectedCategoryId, note);
            }}
            disabled={!selectedCategoryId}
            className="flex-1 px-3 py-2 text-sm text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: selectedCategory?.color ?? '#3b82f6',
            }}
          >
            Apply Tag
          </button>
        </div>
      </div>
    </div>
  );
};
