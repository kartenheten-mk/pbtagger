import React, { useState, useEffect } from 'react';
import type { Tema, Category } from '../../types';
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
      const leafId = `${selectedTemaId}--${gruppId}`;
      setSelectedLeafId(leafId);
      if (pendingText) onApply(leafId, note);
    }
  };

  const handleUndergruppChange = (undergruppId: string) => {
    const leafId = `${selectedTemaId}--${selectedGruppId}--${undergruppId}`;
    setSelectedLeafId(leafId);
    if (pendingText) onApply(leafId, note);
  };

  const handleSearchResultClick = (categoryId: string) => {
    setSelectedLeafId(categoryId);
    if (pendingText) onApply(categoryId, note);
  };
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
          className="w-full px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
        >
          Avbryt
        </button>
      </div>
    </div>
  );
};
