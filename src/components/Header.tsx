/**
 * Header.tsx
 *
 * Top navigation bar showing the file name, tag count,
 * and the Export button.
 */

import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useDocumentStore } from '../store/useDocumentStore';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { DataMenu } from './DataMenu';
import { getAllDocuments } from '../db/documentDb';

interface HeaderProps {
  onClearDocument: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onClearDocument }) => {
  const { fileName, tags, showTags, toggleShowTags, documentId, setFileName } = useDocumentStore();

  // ─── Inline rename state ───────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(fileName);
    setNameError(null);
    setEditing(true);
  };

  useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  const commitEdit = useCallback(async () => {
    const trimmed = draft.trim();

    if (!trimmed) {
      setNameError('Name cannot be empty.');
      inputRef.current?.focus();
      return;
    }

    if (trimmed === fileName) {
      // No change
      setEditing(false);
      setNameError(null);
      return;
    }

    // Check uniqueness across other projects
    try {
      const all = await getAllDocuments();
      const conflict = all.some(
        (doc) => doc.fileName === trimmed && doc.id !== documentId
      );
      if (conflict) {
        setNameError(`"${trimmed}" is already used by another project.`);
        inputRef.current?.focus();
        return;
      }
    } catch {
      // If we can't check, allow the rename
    }

    setFileName(trimmed);
    setEditing(false);
    setNameError(null);
  }, [draft, fileName, documentId, setFileName]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setDraft('');
    setNameError(null);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  // ─── Undo / Redo via zundo temporal store ─────────────────────────────
  const { undo, redo, pastStates, futureStates } = useStoreWithEqualityFn(
    useDocumentStore.temporal,
    (state) => ({
      undo: state.undo,
      redo: state.redo,
      pastStates: state.pastStates,
      futureStates: state.futureStates,
    }),
  );
  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  const handleUndo = useCallback(() => { if (canUndo) undo(); }, [canUndo, undo]);
  const handleRedo = useCallback(() => { if (canRedo) redo(); }, [canRedo, redo]);

  // Ctrl+Z / Ctrl+Y keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-4 shrink-0">
      {/* Logo — click to return to start */}
      <button
        onClick={onClearDocument}
        title="Back to projects"
        className="flex items-center gap-2 mr-2 rounded-lg hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-gray-800 hidden sm:block">
          PB Tagger
        </span>
      </button>

      {/* Divider */}
      <div className="w-px h-6 bg-gray-200" />

      {/* File name — click to rename */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>

        {editing ? (
          <div className="flex flex-col min-w-0 flex-1">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setNameError(null); }}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              className={`text-sm font-medium text-gray-700 bg-white border rounded px-1 py-0.5 min-w-0 w-full focus:outline-none focus:ring-2 ${
                nameError
                  ? 'border-red-400 focus:ring-red-300'
                  : 'border-blue-400 focus:ring-blue-300'
              }`}
              aria-label="Rename project"
            />
            {nameError && (
              <span className="text-xs text-red-500 mt-0.5 leading-tight">{nameError}</span>
            )}
          </div>
        ) : (
          <button
            onClick={startEdit}
            title="Click to rename project"
            className="text-sm font-medium text-gray-700 truncate hover:text-blue-600 hover:underline cursor-text text-left min-w-0"
          >
            {fileName}
          </button>
        )}
      </div>

      {/* Tag count */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg">
        <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <span className="text-xs font-semibold text-gray-600">
          {tags.length} {tags.length === 1 ? 'tag' : 'tags'}
        </span>
      </div>

      {/* Toggle Tag Visibility */}
      <button
        onClick={toggleShowTags}
        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        title={showTags ? "Dölj taggar" : "Visa taggar"}
      >
        {showTags ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        )}
      </button>

      {/* Undo / Redo */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 disabled:text-gray-300 disabled:hover:bg-transparent rounded-lg transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
          </svg>
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 disabled:text-gray-300 disabled:hover:bg-transparent rounded-lg transition-colors"
          title="Redo (Ctrl+Y)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
          </svg>
        </button>
      </div>

      {/* ── Data menu (import + export) ── */}
      <DataMenu />

      {/* Close / new file button */}
      <button
        onClick={onClearDocument}
        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        title="Open a different file"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </header>
  );
};
