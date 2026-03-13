/**
 * SearchBar.tsx
 *
 * Floating search bar for the document canvas.
 * Rendered inside DocViewer when search is open (Ctrl+F).
 */

import React, { useEffect, useRef } from 'react';

interface SearchBarProps {
  query: string;
  matchCount: number;
  currentMatch: number; // 0-based; -1 means no matches
  onQueryChange: (q: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  query,
  matchCount,
  currentMatch,
  onQueryChange,
  onNext,
  onPrevious,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input when the bar mounts
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onPrevious();
      } else {
        onNext();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const matchLabel =
    matchCount === 0
      ? 'Inga träffar'
      : `${currentMatch + 1} / ${matchCount}`;

  return (
    <div
      className="flex items-center gap-1.5 bg-white border border-gray-300 rounded-xl shadow-lg px-2 py-1.5 w-full max-w-sm"
      role="search"
      aria-label="Sök i dokument"
    >
      {/* Search icon */}
      <svg
        className="w-3.5 h-3.5 text-gray-400 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
        />
      </svg>

      {/* Text input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Sök i dokument…"
        aria-label="Söktext"
        className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 min-w-0"
      />

      {/* Match counter */}
      {query.length > 0 && (
        <span
          className={`text-xs font-medium whitespace-nowrap px-1 ${
            matchCount === 0 ? 'text-red-400' : 'text-gray-500'
          }`}
        >
          {matchLabel}
        </span>
      )}

      {/* Previous */}
      <button
        onClick={onPrevious}
        disabled={matchCount === 0}
        title="Föregående träff (Shift+Enter)"
        className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 disabled:text-gray-300 disabled:hover:bg-transparent rounded transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Next */}
      <button
        onClick={onNext}
        disabled={matchCount === 0}
        title="Nästa träff (Enter)"
        className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 disabled:text-gray-300 disabled:hover:bg-transparent rounded transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Divider */}
      <div className="w-px h-4 bg-gray-200 flex-shrink-0" />

      {/* Close */}
      <button
        onClick={onClose}
        title="Stäng sökning (Escape)"
        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};
