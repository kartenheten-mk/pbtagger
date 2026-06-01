import React, { useState, useEffect, useRef } from 'react';
import type { Tema, Category } from '../../types';
import { getCategoryLabel } from '../../data/categoryUtils';
import { hexToRgba } from './utils';

export interface AssignTagPanelProps {
  teman: Tema[];
  categories: Category[];
  pendingText: string | null;
  onApply: (categoryId: string, note: string) => void;
  onCancel: () => void;
}

export const AssignTagPanel: React.FC<AssignTagPanelProps> = ({
  teman,
  categories,
  pendingText,
  onApply,
  onCancel,
}) => {
  const [selectedTemaId, setSelectedTemaId] = useState('');
  const [selectedGruppId, setSelectedGruppId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const gruppSectionRef = useRef<HTMLDivElement>(null);
  const undergruppSectionRef = useRef<HTMLDivElement>(null);

  // Reset picker when a new selection arrives
  useEffect(() => {
    setSelectedTemaId('');
    setSelectedGruppId('');
    setSelectedCategoryId('');
    setNote('');
    setSearchQuery('');
  }, [pendingText]);

  const selectedTema = teman.find((t) => t.id === selectedTemaId);
  const selectedGrupp = selectedTema?.grupper.find((g) => g.id === selectedGruppId);
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const hasUndergrupper = (selectedGrupp?.undergrupper.length ?? 0) > 0;
  const canApply = !!pendingText && !!selectedCategoryId;

  // Auto-scroll to Grupp section when a Tema is selected
  useEffect(() => {
    if (selectedTemaId && gruppSectionRef.current) {
      setTimeout(() => {
        gruppSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  }, [selectedTemaId]);

  // Auto-scroll to Undergrupp section when a Grupp with undergrupper is selected
  useEffect(() => {
    if (selectedGruppId && hasUndergrupper && undergruppSectionRef.current) {
      setTimeout(() => {
        undergruppSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  }, [selectedGruppId, hasUndergrupper]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const searchResults = normalizedSearch
    ? categories.filter((c) =>
      c.name.toLowerCase().includes(normalizedSearch) ||
      c.temaName.toLowerCase().includes(normalizedSearch) ||
      c.gruppName.toLowerCase().includes(normalizedSearch) ||
      (c.undergruppName ?? '').toLowerCase().includes(normalizedSearch) ||
      getCategoryLabel(c).toLowerCase().includes(normalizedSearch)
    )
    : [];

  const handleTemaChange = (temaId: string) => {
    const tema = teman.find((t) => t.id === temaId);
    const onlyGrupp = tema?.grupper.length === 1 ? tema.grupper[0] : undefined;

    setSelectedTemaId(temaId);

    if (onlyGrupp) {
      setSelectedGruppId(onlyGrupp.id);
      setSelectedCategoryId(`${temaId}--${onlyGrupp.id}`);
      return;
    }

    setSelectedGruppId('');
    setSelectedCategoryId('');
  };

  const handleGruppChange = (gruppId: string) => {
    const categoryId = `${selectedTemaId}--${gruppId}`;
    setSelectedGruppId(gruppId);
    setSelectedCategoryId(categoryId);
  };

  const handleUndergruppChange = (undergruppId: string) => {
    setSelectedCategoryId(`${selectedTemaId}--${selectedGruppId}--${undergruppId}`);
  };

  const handleSearchResultClick = (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;

    setSelectedTemaId(category.temaId);
    setSelectedGruppId(category.gruppId);
    setSelectedCategoryId(category.id);
  };

  const handleApply = () => {
    if (!canApply) return;
    onApply(selectedCategoryId, note);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Selected text preview */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-100">
        <p className="text-xs text-gray-500 mb-1 font-medium">Markerat innehåll</p>
        {pendingText ? (
          <p className="text-xs text-gray-700 bg-gray-50 rounded-lg p-2.5 line-clamp-3 font-mono border border-gray-100 leading-relaxed">
            "{pendingText.length > 120 ? pendingText.slice(0, 120) + '…' : pendingText}"
          </p>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3 border border-dashed border-gray-200 text-center">
            <p className="text-xs text-gray-400">Inget innehåll markerat</p>
            <p className="text-xs text-gray-400 mt-0.5">Markera text, bild, diagram eller tabell</p>
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
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg pl-8 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700 placeholder-gray-300"
          />
          <svg className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
              title="Rensa sökning"
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
                    type="button"
                    onClick={() => handleSearchResultClick(cat.id)}
                    className={`w-full flex flex-col items-start gap-1 px-3 py-2 rounded-lg transition-colors text-left border ${selectedCategoryId === cat.id
                      ? 'font-semibold ring-1'
                      : 'text-gray-700 hover:opacity-80'
                      }`}
                    style={
                      selectedCategoryId === cat.id
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
                    <span className="flex w-full items-center gap-2">
                      <span className="text-xs truncate">{cat.name}</span>
                      <span className="ml-auto rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        {cat.level === 'grupp' ? 'Grupp' : 'Undergrupp'}
                      </span>
                    </span>
                    <span
                      className="text-[10px] opacity-80 truncate uppercase tracking-widest font-medium"
                      style={{ color: selectedCategoryId === cat.id ? cat.color : hexToRgba(cat.color, 0.8) }}
                    >
                      {getCategoryLabel(cat)}
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
                    type="button"
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
              <div ref={gruppSectionRef}>
                <p className="text-xs text-gray-500 mb-2 font-semibold flex items-center gap-1.5">
                  <span className="w-4 h-4 bg-gray-200 rounded-full inline-flex items-center justify-center text-gray-600 text-xs font-bold flex-shrink-0">
                    2
                  </span>
                  Grupp
                </p>
                <div className="space-y-1">
                  {selectedTema.grupper.map((grupp) => {
                    const groupCategoryId = `${selectedTema.id}--${grupp.id}`;
                    const isSelectedGroup = selectedGruppId === grupp.id;
                    const isSelectedCategory = selectedCategoryId === groupCategoryId;

                    return (
                      <button
                        key={grupp.id}
                        type="button"
                        onClick={() => handleGruppChange(grupp.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${isSelectedGroup
                          ? 'font-semibold ring-1'
                          : 'text-gray-600 hover:bg-gray-50 border border-gray-100'
                          }`}
                        style={
                          isSelectedGroup
                            ? {
                              backgroundColor: hexToRgba(selectedTema.color, isSelectedCategory ? 0.15 : 0.08),
                              color: selectedTema.color,
                              borderColor: selectedTema.color,
                              outlineColor: selectedTema.color,
                            }
                            : {}
                        }
                      >
                        <span className="truncate">{grupp.name}</span>
                        {isSelectedCategory && (
                          <span className="ml-auto rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                            Grupp vald
                          </span>
                        )}
                        {!isSelectedCategory && grupp.undergrupper.length > 0 && (
                          <span className="ml-auto text-gray-400 text-xs">
                            {grupp.undergrupper.length} undergrupper
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Undergrupp */}
            {selectedGrupp && hasUndergrupper && (
              <div ref={undergruppSectionRef}>
                <p className="text-xs text-gray-500 mb-2 font-semibold flex items-center gap-1.5">
                  <span className="w-4 h-4 bg-gray-200 rounded-full inline-flex items-center justify-center text-gray-600 text-xs font-bold flex-shrink-0">
                    3
                  </span>
                  Undergrupp <span className="font-normal text-gray-400">(valfri)</span>
                </p>
                <div className="space-y-1">
                  {selectedGrupp.undergrupper.map((ug) => {
                    const ugCategoryId = `${selectedTemaId}--${selectedGruppId}--${ug.id}`;
                    return (
                      <button
                        key={ug.id}
                        type="button"
                        onClick={() => handleUndergruppChange(ug.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${selectedCategoryId === ugCategoryId
                          ? 'font-semibold ring-1'
                          : 'text-gray-600 hover:bg-gray-50 border border-gray-100'
                          }`}
                        style={
                          selectedCategoryId === ugCategoryId && selectedTema
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

        {selectedCategory && (
          <div
            className="rounded-lg border px-3 py-2"
            style={{
              backgroundColor: hexToRgba(selectedCategory.color, 0.08),
              borderColor: hexToRgba(selectedCategory.color, 0.25),
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Valt
            </p>
            <p className="mt-0.5 text-xs font-medium text-gray-700">
              {getCategoryLabel(selectedCategory)}
            </p>
          </div>
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
          type="button"
          onClick={onCancel}
          className="w-full px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
        >
          Avbryt
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!canApply}
          className={`w-full px-3 py-2 text-sm rounded-lg transition-colors font-semibold ${canApply
            ? 'bg-gray-900 text-white hover:bg-gray-800'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
        >
          Tilldela tagg
        </button>
      </div>
    </div>
  );
};
