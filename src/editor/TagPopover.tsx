/**
 * TagPopover.tsx
 *
 * A floating popover that appears when the user has selected text in the
 * editor and wants to apply a tag. The user picks a category via a three-step
 * cascading picker (Tema → Grupp → Undergrupp) and optionally adds a note,
 * then clicks "Apply Tag".
 */

import React, { useState, useEffect, useRef } from 'react';
import type { Category, Tema } from '../types';

interface TagPopoverProps {
  /** Position (px) relative to the viewport */
  position: { top: number; left: number };
  /** Selected text content */
  selectedText: string;
  /** Full hierarchical data for the cascading picker */
  teman: Tema[];
  /** Flat category list for resolving the final selection */
  categories: Category[];
  onApply: (categoryId: string, note: string) => void;
  onCancel: () => void;
}

export const TagPopover: React.FC<TagPopoverProps> = ({
  position,
  selectedText,
  teman,
  categories,
  onApply,
  onCancel,
}) => {
  const [selectedTemaId, setSelectedTemaId] = useState<string>('');
  const [selectedGruppId, setSelectedGruppId] = useState<string>('');
  const [selectedLeafId, setSelectedLeafId] = useState<string>('');
  const [note, setNote] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Derived selections ─────────────────────────────────────────────────────
  const selectedTema = teman.find((t) => t.id === selectedTemaId);
  const selectedGrupp = selectedTema?.grupper.find((g) => g.id === selectedGruppId);
  const hasUndergrupper = (selectedGrupp?.undergrupper.length ?? 0) > 0;

  // The resolved Category leaf (for colour + final id)
  const resolvedCategory = categories.find((c) => c.id === selectedLeafId);

  // ── Reset downstream selections when parent changes ─────────────────────
  const handleTemaChange = (temaId: string) => {
    setSelectedTemaId(temaId);
    setSelectedGruppId('');
    setSelectedLeafId('');
  };

  const handleGruppChange = (gruppId: string) => {
    setSelectedGruppId(gruppId);
    setSelectedLeafId('');

    // If this grupp has no undergrupper, compute the leaf id immediately
    const tema = teman.find((t) => t.id === selectedTemaId);
    const grupp = tema?.grupper.find((g) => g.id === gruppId);
    if (grupp && grupp.undergrupper.length === 0) {
      setSelectedLeafId(`${selectedTemaId}--${gruppId}`);
    }
  };

  const handleUndergruppChange = (undergruppId: string) => {
    setSelectedLeafId(`${selectedTemaId}--${selectedGruppId}--${undergruppId}`);
  };

  // ── Close on outside click ────────────────────────────────────────────────
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

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  // ── Clamp position to stay inside viewport ────────────────────────────────
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(position.top, window.innerHeight - 420),
    left: Math.min(position.left, window.innerWidth - 360),
    zIndex: 1000,
  };

  const canApply = !!selectedLeafId && (!hasUndergrupper || selectedLeafId.split('--').length === 3);

  return (
    <div
      ref={containerRef}
      style={{ ...style, width: '22rem' }}
      className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Applicera tagg</h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Stäng"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Selected text preview */}
        <div>
          <p className="text-xs text-gray-500 mb-1 font-medium">Markerad text</p>
          <p className="text-xs text-gray-700 bg-gray-50 rounded p-2 line-clamp-2 font-mono border border-gray-100">
            "{selectedText.length > 80 ? selectedText.slice(0, 80) + '…' : selectedText}"
          </p>
        </div>

        {/* Step 1: Tema picker */}
        <div>
          <p className="text-xs text-gray-500 mb-1.5 font-medium flex items-center gap-1">
            <span className="w-4 h-4 bg-gray-200 rounded-full inline-flex items-center justify-center text-gray-600 text-xs font-bold flex-shrink-0">1</span>
            Tema
          </p>
          <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto pr-1">
            {teman.map((tema) => (
              <button
                key={tema.id}
                onClick={() => handleTemaChange(tema.id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors text-left ${
                  selectedTemaId === tema.id
                    ? 'text-white font-semibold'
                    : 'text-gray-600 hover:bg-gray-50 border border-gray-100'
                }`}
                style={selectedTemaId === tema.id ? { backgroundColor: tema.color } : {}}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: selectedTemaId === tema.id ? 'rgba(255,255,255,0.7)' : tema.color }}
                />
                {tema.name}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Grupp picker (shown once a tema is selected) */}
        {selectedTema && (
          <div>
            <p className="text-xs text-gray-500 mb-1.5 font-medium flex items-center gap-1">
              <span className="w-4 h-4 bg-gray-200 rounded-full inline-flex items-center justify-center text-gray-600 text-xs font-bold flex-shrink-0">2</span>
              Grupp
            </p>
            <div className="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto pr-1">
              {selectedTema.grupper.map((grupp) => (
                <button
                  key={grupp.id}
                  onClick={() => handleGruppChange(grupp.id)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors text-left ${
                    selectedGruppId === grupp.id
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

        {/* Step 3: Undergrupp picker (shown when grupp has undergrupper) */}
        {selectedGrupp && hasUndergrupper && (
          <div>
            <p className="text-xs text-gray-500 mb-1.5 font-medium flex items-center gap-1">
              <span className="w-4 h-4 bg-gray-200 rounded-full inline-flex items-center justify-center text-gray-600 text-xs font-bold flex-shrink-0">3</span>
              Undergrupp
            </p>
            <div className="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto pr-1">
              {selectedGrupp.undergrupper.map((ug) => {
                const ugLeafId = `${selectedTemaId}--${selectedGruppId}--${ug.id}`;
                return (
                  <button
                    key={ug.id}
                    onClick={() => handleUndergruppChange(ug.id)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors text-left ${
                      selectedLeafId === ugLeafId
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

        {/* Note */}
        <div>
          <label className="text-xs text-gray-500 font-medium block mb-1">
            Notering <span className="font-normal">(valfri)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Lägg till en notering..."
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700 placeholder-gray-300"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
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
              backgroundColor: resolvedCategory?.color ?? selectedTema?.color ?? '#3b82f6',
            }}
          >
            Applicera
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(100,100,100,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}
