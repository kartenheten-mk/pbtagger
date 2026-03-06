/**
 * Sidebar.tsx
 *
 * Left sidebar with two toggleable modes:
 *
 *  1. "Tilldela tagg" (Assign Tags)
 *     - Shows when the user has selected text in the document
 *     - Contains the cascading Tema → Grupp → Undergrupp picker + note field
 *     - Replaces the old floating TagPopover
 *
 *  2. "Visa taggar" (View Tags)
 *     - Tema filter tabs (colour-coded)
 *     - List of applied tags with remove / link-to-geometry actions
 *     - Tema legend at the bottom
 *
 * The active mode is controlled by a toggle at the top. When text is selected
 * in the document (pendingSelection is set in the store), the sidebar
 * automatically switches to "Assign" mode.
 */

import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Category, Tag, Geometry, Tema } from '../types';
import { TagBadge } from './TagBadge';
import { getCategoryLabel } from '../data/categoryUtils';
import { useDocumentStore } from '../store/useDocumentStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type SidebarMode = 'assign' | 'view';

interface SidebarProps {
  teman: Tema[];
  categories: Category[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(100,100,100,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

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

// ─── Assign Tag Panel ─────────────────────────────────────────────────────────

interface AssignTagPanelProps {
  teman: Tema[];
  categories: Category[];
  pendingText: string | null;
  onApply: (categoryId: string, note: string) => void;
  onCancel: () => void;
}

const AssignTagPanel: React.FC<AssignTagPanelProps> = ({
  teman,
  categories,
  pendingText,
  onApply,
  onCancel,
}) => {
  const [selectedTemaId, setSelectedTemaId] = useState('');
  const [selectedGruppId, setSelectedGruppId] = useState('');
  const [selectedLeafId, setSelectedLeafId] = useState('');
  const [note, setNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Reset picker when a new selection arrives
  useEffect(() => {
    setSelectedTemaId('');
    setSelectedGruppId('');
    setSelectedLeafId('');
    setNote('');
    setSearchQuery('');
  }, [pendingText]);

  const selectedTema = teman.find((t) => t.id === selectedTemaId);
  const selectedGrupp = selectedTema?.grupper.find((g) => g.id === selectedGruppId);
  const hasUndergrupper = (selectedGrupp?.undergrupper.length ?? 0) > 0;
  const resolvedCategory = categories.find((c) => c.id === selectedLeafId);

  const searchResults = searchQuery
    ? categories.filter((c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.temaName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.gruppName.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : [];

  const handleTemaChange = (temaId: string) => {
    setSelectedTemaId(temaId);
    setSelectedGruppId('');
    setSelectedLeafId('');
  };

  const handleGruppChange = (gruppId: string) => {
    setSelectedGruppId(gruppId);
    setSelectedLeafId('');
    const tema = teman.find((t) => t.id === selectedTemaId);
    const grupp = tema?.grupper.find((g) => g.id === gruppId);
    if (grupp && grupp.undergrupper.length === 0) {
      setSelectedLeafId(`${selectedTemaId}--${gruppId}`);
    }
  };

  const handleUndergruppChange = (undergruppId: string) => {
    setSelectedLeafId(`${selectedTemaId}--${selectedGruppId}--${undergruppId}`);
  };

  const handleSearchResultClick = (categoryId: string) => {
    setSelectedLeafId(categoryId);
  };

  const canApply =
    !!selectedLeafId &&
    (searchQuery !== '' || !hasUndergrupper || selectedLeafId.split('--').length === 3) &&
    !!pendingText;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Selected text preview */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-100">
        <p className="text-xs text-gray-500 mb-1 font-medium">Markerad text</p>
        {pendingText ? (
          <p className="text-xs text-gray-700 bg-gray-50 rounded-lg p-2.5 line-clamp-3 font-mono border border-gray-100 leading-relaxed">
            "{pendingText.length > 120 ? pendingText.slice(0, 120) + '…' : pendingText}"
          </p>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3 border border-dashed border-gray-200 text-center">
            <p className="text-xs text-gray-400">Ingen text markerad</p>
            <p className="text-xs text-gray-400 mt-0.5">Markera text i dokumentet</p>
          </div>
        )}
      </div>

      {/* Scrollable picker area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Sök tagg..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value === '') {
                // If cleared, we can keep the previous leaf selection or clear it.
                // Keeping leaf selection to not disrupt the user.
              } else {
                // When we start a search, we don't necessarily clear leaf ID immediately,
                // but the hierarchy is hidden, so only search results show.
              }
            }}
            className="w-full text-xs border border-gray-200 rounded-lg pl-8 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700 placeholder-gray-300"
          />
          <svg className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {searchQuery ? (
          <div>
            <p className="text-xs text-gray-500 mb-2 font-semibold flex items-center gap-1.5">
              Sökresultat ({searchResults.length})
            </p>
            <div className="space-y-1">
              {searchResults.length === 0 ? (
                <p className="text-xs text-gray-400 py-2 text-center">Inga taggar matchade sökningen.</p>
              ) : (
                searchResults.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleSearchResultClick(cat.id)}
                    className={`w-full flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg transition-colors text-left border ${selectedLeafId === cat.id
                        ? 'font-semibold ring-1'
                        : 'text-gray-700 hover:opacity-80'
                      }`}
                    style={
                      selectedLeafId === cat.id
                        ? {
                          backgroundColor: hexToRgba(cat.color, 0.15),
                          color: cat.color,
                          borderColor: cat.color,
                          outlineColor: cat.color,
                        }
                        : {
                          backgroundColor: hexToRgba(cat.color, 0.08),
                          borderColor: hexToRgba(cat.color, 0.2),
                        }
                    }
                  >
                    <span className="text-xs">{cat.name}</span>
                    <span
                      className="text-[10px] opacity-80 truncate uppercase tracking-widest font-medium"
                      style={{ color: selectedLeafId === cat.id ? cat.color : hexToRgba(cat.color, 0.8) }}
                    >
                      {cat.temaName} › {cat.gruppName}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Step 1: Tema */}
            <div>
              <p className="text-xs text-gray-500 mb-2 font-semibold flex items-center gap-1.5">
                <span className="w-4 h-4 bg-gray-200 rounded-full inline-flex items-center justify-center text-gray-600 text-xs font-bold flex-shrink-0">
                  1
                </span>
                Tema
              </p>
              <div className="space-y-1">
                {teman.map((tema) => (
                  <button
                    key={tema.id}
                    onClick={() => handleTemaChange(tema.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${selectedTemaId === tema.id
                      ? 'text-white font-semibold'
                      : 'text-gray-600 hover:bg-gray-50 border border-gray-100'
                      }`}
                    style={selectedTemaId === tema.id ? { backgroundColor: tema.color } : {}}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          selectedTemaId === tema.id ? 'rgba(255,255,255,0.7)' : tema.color,
                      }}
                    />
                    {tema.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Grupp */}
            {selectedTema && (
              <div>
                <p className="text-xs text-gray-500 mb-2 font-semibold flex items-center gap-1.5">
                  <span className="w-4 h-4 bg-gray-200 rounded-full inline-flex items-center justify-center text-gray-600 text-xs font-bold flex-shrink-0">
                    2
                  </span>
                  Grupp
                </p>
                <div className="space-y-1">
                  {selectedTema.grupper.map((grupp) => (
                    <button
                      key={grupp.id}
                      onClick={() => handleGruppChange(grupp.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${selectedGruppId === grupp.id
                        ? 'font-semibold ring-1'
                        : 'text-gray-600 hover:bg-gray-50 border border-gray-100'
                        }`}
                      style={
                        selectedGruppId === grupp.id
                          ? {
                            backgroundColor: hexToRgba(selectedTema.color, 0.1),
                            color: selectedTema.color,
                            borderColor: selectedTema.color,
                            outlineColor: selectedTema.color,
                          }
                          : {}
                      }
                    >
                      {grupp.name}
                      {grupp.undergrupper.length > 0 && (
                        <span className="ml-auto text-gray-400 text-xs">
                          {grupp.undergrupper.length} val
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Undergrupp */}
            {selectedGrupp && hasUndergrupper && (
              <div>
                <p className="text-xs text-gray-500 mb-2 font-semibold flex items-center gap-1.5">
                  <span className="w-4 h-4 bg-gray-200 rounded-full inline-flex items-center justify-center text-gray-600 text-xs font-bold flex-shrink-0">
                    3
                  </span>
                  Undergrupp
                </p>
                <div className="space-y-1">
                  {selectedGrupp.undergrupper.map((ug) => {
                    const ugLeafId = `${selectedTemaId}--${selectedGruppId}--${ug.id}`;
                    return (
                      <button
                        key={ug.id}
                        onClick={() => handleUndergruppChange(ug.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${selectedLeafId === ugLeafId
                          ? 'font-semibold ring-1'
                          : 'text-gray-600 hover:bg-gray-50 border border-gray-100'
                          }`}
                        style={
                          selectedLeafId === ugLeafId && selectedTema
                            ? {
                              backgroundColor: hexToRgba(selectedTema.color, 0.1),
                              color: selectedTema.color,
                              borderColor: selectedTema.color,
                              outlineColor: selectedTema.color,
                            }
                            : {}
                        }
                      >
                        {ug.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Note */}
        <div>
          <label className="text-xs text-gray-500 font-semibold block mb-1.5">
            Notering <span className="font-normal text-gray-400">(valfri)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Lägg till en notering..."
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700 placeholder-gray-300"
          />
        </div>
      </div>

      {/* Action buttons — pinned at bottom */}
      <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
        >
          Avbryt
        </button>
        <button
          onClick={() => {
            if (canApply) onApply(selectedLeafId, note);
          }}
          disabled={!canApply}
          className="flex-1 px-3 py-2 text-sm text-white rounded-lg transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor:
              resolvedCategory?.color ?? selectedTema?.color ?? '#3b82f6',
          }}
        >
          Applicera
        </button>
      </div>
    </div>
  );
};

// ─── View Tags Panel ──────────────────────────────────────────────────────────

interface ViewTagsPanelProps {
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

const ViewTagsPanel: React.FC<ViewTagsPanelProps> = ({
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
