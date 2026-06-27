import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Category, Tag, Tema } from '../../types';
import { useDocumentStore } from '../../store/useDocumentStore';
import { parseCategoryConfigFromAppConfig } from '../../config/appConfig';
import {
  createUniqueGroupId,
  createUniqueUndergroupId,
} from '../../data/categoryUtils';
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
    clearAllTags,
    startLinking,
    unlinkGeometry,
    addTags,
    setPendingSelection,
    addCustomGroup,
    addCustomUndergroup,
    setCategoryConfig,
  } = useDocumentStore();

  const categoryConfigInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<SidebarMode>('view');
  const [showLegend, setShowLegend] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [customType, setCustomType] = useState<'grupp' | 'undergrupp'>('grupp');
  const [customTemaId, setCustomTemaId] = useState('');
  const [customGruppId, setCustomGruppId] = useState('');
  const [customName, setCustomName] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [configImportStatus, setConfigImportStatus] = useState<string | null>(null);
  const [configImportError, setConfigImportError] = useState<string | null>(null);
  const [createdCategoryId, setCreatedCategoryId] = useState<string | null>(null);
  const [assignPickerSelection, setAssignPickerSelection] = useState({
    temaId: '',
    gruppId: '',
  });

  // ── Auto-switch to Assign mode when a new selection is created ────────────
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

  useEffect(() => {
    if (mode !== 'assign') {
      setAddModalOpen(false);
    }
  }, [mode]);

  const handleCancelAssign = () => {
    setPendingSelection(null);
    window.getSelection()?.removeAllRanges();
    setMode('view');
  };

  const handleApplyTag = (categoryId: string, note: string) => {
    if (!pendingSelection || pendingSelection.length === 0) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;

    // Partition selections: group consecutive text selections into one
    // multi-paragraph tag; keep non-text selections as individual tags.
    const newTags: Tag[] = [];
    const now = new Date().toISOString();

    // Separate text selections from object (image/graph/table) selections
    const textSelections = pendingSelection.filter((s) => s.type === 'text');
    const objectSelections = pendingSelection.filter((s) => s.type !== 'text');

    if (textSelections.length > 1) {
      // Merge all consecutive text selections into a single multi-paragraph tag.
      // Sort by paragraph index to ensure correct order.
      const sorted = [...textSelections].sort(
        (a, b) => a.paragraphIndex - b.paragraphIndex
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      newTags.push({
        uuid: uuidv4(),
        categoryId,
        targetType: 'text',
        text: sorted.map((s) => s.text).join('\n\n'),
        paragraphIndex: first.paragraphIndex,
        startOffset: first.startOffset,
        endOffset: last.endOffset,
        endParagraphIndex: last.paragraphIndex,
        note: note || undefined,
        createdAt: now,
      });
    } else if (textSelections.length === 1) {
      const sel = textSelections[0];
      newTags.push({
        uuid: uuidv4(),
        categoryId,
        targetType: 'text',
        text: sel.text,
        paragraphIndex: sel.paragraphIndex,
        startOffset: sel.startOffset,
        endOffset: sel.endOffset,
        note: note || undefined,
        createdAt: now,
      });
    }

    // Object selections each become their own tag (no merging applicable)
    for (const sel of objectSelections) {
      newTags.push({
        uuid: uuidv4(),
        categoryId,
        targetType: sel.type,
        text: sel.text,
        paragraphIndex: sel.paragraphIndex,
        startOffset: sel.startOffset,
        endOffset: sel.endOffset,
        runId: sel.runId,
        tableId: sel.tableId,
        note: note || undefined,
        createdAt: now,
      });
    }

    addTags(newTags);
    setPendingSelection(null);
    window.getSelection()?.removeAllRanges();
    setMode('view');
  };

  const getCategoryById = (id: string): Category | undefined =>
    categories.find((c) => c.id === id);

  const canAddCustomCategory = mode === 'assign' && !!addCustomGroup && !!addCustomUndergroup;
  const canImportCategoryConfig = mode === 'assign' && !!setCategoryConfig;
  const customTema = teman.find((t) => t.id === customTemaId);
  const customGrupp = customTema?.grupper.find((g) => g.id === customGruppId);
  const trimmedCustomName = customName.trim();
  const generatedCustomId =
    trimmedCustomName && customType === 'grupp'
      ? customTemaId
        ? createUniqueGroupId(teman, customTemaId, trimmedCustomName)
        : null
      : trimmedCustomName && customTemaId && customGruppId
        ? createUniqueUndergroupId(teman, customTemaId, customGruppId, trimmedCustomName)
        : null;
  const previewCategoryId =
    generatedCustomId && customTemaId
      ? customType === 'grupp'
        ? `${customTemaId}--${generatedCustomId}`
        : customGruppId
          ? `${customTemaId}--${customGruppId}--${generatedCustomId}`
          : ''
      : '';
  const canSaveCustomCategory =
    !!trimmedCustomName &&
    !!customTema &&
    (customType === 'grupp' || !!customGrupp) &&
    !!previewCategoryId;

  const openAddModal = () => {
    const defaultTemaId = assignPickerSelection.temaId || teman[0]?.id || '';
    const defaultTema = teman.find((tema) => tema.id === defaultTemaId);
    const defaultGruppId =
      assignPickerSelection.gruppId || defaultTema?.grupper[0]?.id || '';
    setCustomType(assignPickerSelection.gruppId ? 'undergrupp' : 'grupp');
    setCustomTemaId(defaultTemaId);
    setCustomGruppId(defaultGruppId);
    setCustomName('');
    setCustomError(null);
    setAddModalOpen(true);
  };

  const handleCustomTemaChange = (temaId: string) => {
    const tema = teman.find((item) => item.id === temaId);
    setCustomTemaId(temaId);
    setCustomGruppId(tema?.grupper[0]?.id ?? '');
    setCustomError(null);
  };

  const handleSaveCustomCategory = () => {
    if (!canAddCustomCategory) return;
    if (!trimmedCustomName) {
      setCustomError('Ange ett namn.');
      return;
    }
    if (!customTema) {
      setCustomError('Välj tema.');
      return;
    }
    if (customType === 'undergrupp' && !customGrupp) {
      setCustomError('Välj grupp.');
      return;
    }

    const categoryId =
      customType === 'grupp'
        ? addCustomGroup(customTemaId, trimmedCustomName)
        : addCustomUndergroup(customTemaId, customGruppId, trimmedCustomName);

    if (!categoryId) {
      setCustomError('Kunde inte skapa kategorin.');
      return;
    }

    setCreatedCategoryId(categoryId);
    setAddModalOpen(false);
    setCustomError(null);
  };

  const handleCategoryConfigFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setConfigImportStatus(null);
    setConfigImportError(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const categoryConfig = parseCategoryConfigFromAppConfig(parsed);
      setCategoryConfig(categoryConfig);
      setCreatedCategoryId(null);
      setConfigImportStatus('Taggkonfiguration importerad.');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Kunde inte läsa config.json.';
      setConfigImportError(`Kunde inte importera taggkonfiguration. ${message}`);
    } finally {
      if (categoryConfigInputRef.current) categoryConfigInputRef.current.value = '';
    }
  };

  return (
    <aside className="w-full bg-white flex flex-col h-full overflow-hidden">
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
          pendingText={pendingSelection ? pendingSelection.map((s) => s.text).join('\n\n') : null}
          onApply={handleApplyTag}
          onCancel={handleCancelAssign}
          createdCategoryId={createdCategoryId}
          onPickerSelectionChange={setAssignPickerSelection}
        />
      ) : (
        <ViewTagsPanel
          teman={teman}
          tags={tags}
          categories={categories}
          geometries={geometries}
          selectedTagUuid={selectedTagUuid}
          getCategoryById={getCategoryById}
          onSelectTag={(uuid) => selectTag(uuid === selectedTagUuid ? null : uuid)}
          onRemoveTag={removeTag}
          onClearAllTags={clearAllTags}
          onLinkGeometry={startLinking}
          onUnlinkGeometry={unlinkGeometry}
        />
      )}

      {(configImportStatus || configImportError) && (
        <div
          role={configImportError ? 'alert' : 'status'}
          className={`border-t px-3 py-2 text-xs font-medium ${
            configImportError
              ? 'border-red-100 bg-red-50 text-red-700'
              : 'border-green-100 bg-green-50 text-green-700'
          }`}
        >
          {configImportError ?? configImportStatus}
        </div>
      )}

      {/* ── Footer / Legend Toggle ────────────────────────────────────────── */}
      <footer className="p-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between relative">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
            Planbeskrivning
          </span>
        </div>

        <div className="flex items-center gap-2">
          {canImportCategoryConfig && (
            <button
              type="button"
              onClick={() => categoryConfigInputRef.current?.click()}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all bg-white text-blue-500 hover:text-blue-700 hover:bg-blue-50 border border-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
              title="Importera taggkonfiguration från config.json"
              aria-label="Importera taggkonfiguration"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12m0-12l-4 4m4-4l4 4" />
              </svg>
            </button>
          )}
          {canAddCustomCategory && (
            <button
              type="button"
              onClick={openAddModal}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all bg-white text-blue-500 hover:text-blue-700 hover:bg-blue-50 border border-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
              title="Lägg till kategori"
              aria-label="Lägg till kategori"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}

          <button
            onClick={() => setShowLegend(!showLegend)}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${showLegend
                ? 'bg-blue-600 text-white shadow-md rotate-180'
                : 'bg-white text-gray-400 hover:text-gray-600 border border-gray-200'
              }`}
            title="Visa teckenförklaring"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {showLegend ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              )}
            </svg>
          </button>
        </div>

        <input
          ref={categoryConfigInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          data-testid="category-config-file-input"
          onChange={handleCategoryConfigFileChange}
        />

        {/* Legend Popover */}
        {showLegend && (
          <div className="absolute bottom-full right-3 mb-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
            <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Teman</h4>
            </div>
            <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
              {teman.map((tema) => (
                <div key={tema.id} className="flex items-center gap-3 group">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm border border-white"
                    style={{ backgroundColor: tema.color }}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-gray-700">{tema.name}</span>
                    <span className="text-[10px] text-gray-400 line-clamp-1">{tema.grupper.length} grupper</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-2 border-t border-gray-50 bg-gray-50/30">
              <p className="text-[10px] text-gray-400 italic text-center">
                Teckenförklaring för taggkategorier
              </p>
            </div>
          </div>
        )}
      </footer>

      {addModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/30 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-category-title"
            className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 id="custom-category-title" className="text-sm font-semibold text-gray-800">
                Lägg till kategori
              </h2>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Stäng"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                  Typ
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomType('grupp');
                      setCustomError(null);
                    }}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      customType === 'grupp'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Grupp
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomType('undergrupp');
                      if (!customGruppId) {
                        setCustomGruppId(customTema?.grupper[0]?.id ?? '');
                      }
                      setCustomError(null);
                    }}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      customType === 'undergrupp'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Undergrupp
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="custom-category-tema" className="mb-1.5 block text-xs font-semibold text-gray-500">
                  Tema
                </label>
                <select
                  id="custom-category-tema"
                  value={customTemaId}
                  onChange={(event) => handleCustomTemaChange(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {teman.map((tema) => (
                    <option key={tema.id} value={tema.id}>
                      {tema.name}
                    </option>
                  ))}
                </select>
              </div>

              {customType === 'undergrupp' && (
                <div>
                  <label htmlFor="custom-category-grupp" className="mb-1.5 block text-xs font-semibold text-gray-500">
                    Grupp
                  </label>
                  <select
                    id="custom-category-grupp"
                    value={customGruppId}
                    onChange={(event) => {
                      setCustomGruppId(event.target.value);
                      setCustomError(null);
                    }}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {customTema?.grupper.map((grupp) => (
                      <option key={grupp.id} value={grupp.id}>
                        {grupp.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="custom-category-name" className="mb-1.5 block text-xs font-semibold text-gray-500">
                  Namn
                </label>
                <input
                  id="custom-category-name"
                  type="text"
                  value={customName}
                  onChange={(event) => {
                    setCustomName(event.target.value);
                    setCustomError(null);
                  }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Namn"
                  autoFocus
                />
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  ID
                </p>
                <p className="mt-0.5 break-all font-mono text-xs text-gray-700">
                  {previewCategoryId || '-'}
                </p>
              </div>

              {customError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {customError}
                </p>
              )}
            </div>

            <div className="flex gap-2 border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="w-full rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={handleSaveCustomCategory}
                disabled={!canSaveCustomCategory}
                className={`w-full rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  canSaveCustomCategory
                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                Spara
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;

