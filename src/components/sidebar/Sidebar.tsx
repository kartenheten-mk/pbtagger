import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Category, Tag, Geometry, Tema } from '../../types';
import { useDocumentStore } from '../../store/useDocumentStore';
import { AssignTagPanel } from './AssignTagPanel';
import { ViewTagsPanel } from './ViewTagsPanel';

type SidebarMode = 'assign' | 'view';

interface SidebarProps {
  teman: Tema[];
  categories: Category[];
}

export const Sidebar: React.FC<SidebarProps> = ({ teman, categories }) => {
  const {
    tags,
    geometries,
    selectedTagUuid,
    pendingSelection,
    selectTag,
    removeTag,
    startLinking,
    unlinkGeometry,
    addTags,
    setPendingSelection,
  } = useDocumentStore();

  const [mode, setMode] = useState<SidebarMode>('view');

  // ── Auto-switch to Assign mode when text is selected ─────────────────────
  useEffect(() => {
    if (pendingSelection && pendingSelection.length > 0) {
      setMode('assign');
    }
  }, [pendingSelection]);

  // ── Auto-switch to View mode when an existing tag is selected ─────────────
  useEffect(() => {
    if (selectedTagUuid) {
      setMode('view');
    }
  }, [selectedTagUuid]);

  const handleCancelAssign = () => {
    setPendingSelection(null);
    window.getSelection()?.removeAllRanges();
    setMode('view');
  };

  const handleApplyTag = (categoryId: string, note: string) => {
    if (!pendingSelection || pendingSelection.length === 0) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;

    const newTags: Tag[] = pendingSelection.map((sel) => ({
      uuid: uuidv4(),
      categoryId,
      text: sel.text,
      paragraphIndex: sel.paragraphIndex,
      startOffset: sel.startOffset,
      endOffset: sel.endOffset,
      note: note || undefined,
      createdAt: new Date().toISOString(),
    }));

    addTags(newTags);
    setPendingSelection(null);
    window.getSelection()?.removeAllRanges();
    setMode('view');
  };

  const getCategoryById = (id: string): Category | undefined =>
    categories.find((c) => c.id === id);

  const getGeometryById = (id?: string): Geometry | undefined =>
    id ? geometries.find((g) => g.uuid === id) : undefined;

  return (
    <aside className="w-72 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
      {/* ── Mode toggle ─────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        <button
          onClick={() => setMode('assign')}
          className={`flex-1 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${mode === 'assign'
            ? 'bg-white text-blue-600 border-b-2 border-blue-500'
            : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          Tilldela tagg
          {pendingSelection && pendingSelection.length > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          )}
        </button>
        <button
          onClick={() => setMode('view')}
          className={`flex-1 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${mode === 'view'
            ? 'bg-white text-blue-600 border-b-2 border-blue-500'
            : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          Visa taggar
          {tags.length > 0 && (
            <span className="bg-gray-200 text-gray-600 rounded-full px-1.5 text-xs leading-4">
              {tags.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Content based on mode ─────────────────────────────────────────── */}
      {mode === 'assign' ? (
        <AssignTagPanel
          teman={teman}
          categories={categories}
          pendingText={pendingSelection ? pendingSelection.map(s => s.text).join('\n\n') : null}
          onApply={handleApplyTag}
          onCancel={handleCancelAssign}
        />
      ) : (
        <ViewTagsPanel
          teman={teman}
          tags={tags}
          categories={categories}
          selectedTagUuid={selectedTagUuid}
          getCategoryById={getCategoryById}
          getGeometryById={getGeometryById}
          onSelectTag={(uuid) => selectTag(uuid === selectedTagUuid ? null : uuid)}
          onRemoveTag={removeTag}
          onLinkGeometry={startLinking}
          onUnlinkGeometry={unlinkGeometry}
        />
      )}
    </aside>
  );
};
