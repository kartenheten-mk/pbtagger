/**
 * PlanbeskrivningConfigPanel.tsx
 *
 * A slide-in panel / modal for editing the Planbeskrivning v2.0 header
 * metadata that will be embedded in `omfattningar.xml` on export.
 *
 * Fields:
 *   objektidentitet      — UUID auto-generated, user-editable
 *   objektversion        — Integer (default 1)
 *   versionGiltigFran    — ISO datetime
 *   detaljplansreferens  — UUID, auto-populated from geometry import
 *   programvara          — read-only (app name)
 *   programvaruversion   — read-only (app version)
 *   arkividentitetKommun — free text, e.g. "MORA:2024/123"
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useDocumentStore } from '../store/useDocumentStore';
import { buildDefaultConfig } from '../docx/PlanbeskrivningXmlBuilder';

interface Props {
  onClose: () => void;
}

type DraftConfig = ReturnType<typeof buildDefaultConfig>;

// ─── Small helpers ────────────────────────────────────────────────────────────


function createDraftConfig(
  planbeskrivningConfig: DraftConfig | null,
  activeGeometryDocId: string | null
): DraftConfig {
  return planbeskrivningConfig ?? buildDefaultConfig(activeGeometryDocId ?? undefined);
}

function toDatetimeLocalValue(iso: string): string {
  return iso.slice(0, 16);
}

function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function isValidIso(s: string): boolean {
  if (!s) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function isValidVersion(v: number): boolean {
  return Number.isInteger(v) && v >= 1;
}

// ─── Field component ──────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, hint, error, children }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export const PlanbeskrivningConfigPanel: React.FC<Props> = ({ onClose }) => {
  const {
    planbeskrivningConfig,
    activeGeometryDocId,
    setPlanbeskrivningConfig,
    resetPlanbeskrivningConfig,
  } = useDocumentStore();

  // Initialize local draft from store (or defaults)
  const initialDraft = useMemo(
    () => createDraftConfig(planbeskrivningConfig, activeGeometryDocId),
    [planbeskrivningConfig, activeGeometryDocId]
  );

  const [draft, setDraft] = useState<DraftConfig>(initialDraft);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const savedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailPlanReference = planbeskrivningConfig?.detaljplansreferens ?? '';

  // Sync draft when store config changes externally (e.g. geometry import)
  useEffect(() => {
    if (!planbeskrivningConfig) return;
    setDraft((prev) => ({
      ...prev,
      detaljplansreferens: detailPlanReference,
    }));
  }, [planbeskrivningConfig, detailPlanReference]);

  useEffect(() => () => {
    if (savedResetTimerRef.current) {
      clearTimeout(savedResetTimerRef.current);
    }
  }, []);

  const update = useCallback(
    (key: keyof DraftConfig, value: string | number) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => ({ ...prev, [key]: '' }));
      setSaved(false);
    },
    []
  );

  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (!isValidUuid(draft.objektidentitet))
      e.objektidentitet = 'Måste vara ett giltigt UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)';
    if (!isValidVersion(draft.objektversion))
      e.objektversion = 'Måste vara ett heltal ≥ 1';
    if (!isValidIso(draft.versionGiltigFran))
      e.versionGiltigFran = 'Måste vara ett giltigt ISO 8601-datum';
    if (draft.detaljplansreferens && !isValidUuid(draft.detaljplansreferens))
      e.detaljplansreferens = 'Om angivet måste värdet vara ett giltigt UUID';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [draft]);

  const handleSave = useCallback(() => {
    if (!validate()) return;
    setPlanbeskrivningConfig(draft);
    setSaved(true);

    if (savedResetTimerRef.current) {
      clearTimeout(savedResetTimerRef.current);
    }

    savedResetTimerRef.current = setTimeout(() => {
      setSaved(false);
      savedResetTimerRef.current = null;
    }, 2000);
  }, [draft, validate, setPlanbeskrivningConfig]);

  const handleReset = useCallback(() => {
    const fresh = createDraftConfig(null, activeGeometryDocId);
    setDraft(fresh);
    resetPlanbeskrivningConfig(activeGeometryDocId ?? undefined);
    setErrors({});
    setSaved(false);
  }, [activeGeometryDocId, resetPlanbeskrivningConfig]);

  const generateNewUuid = useCallback(() => {
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(16)}-0000-0000-0000-000000000000`;
    update('objektidentitet', id);
  }, [update]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Planbeskrivning v2.0 – Inställningar</p>
              <p className="text-xs text-gray-400">Metadata för <code>omfattningar.xml</code></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* objektidentitet */}
          <Field
            label="Objektidentitet"
            hint="UUID som identifierar detta planbeskrivningsobjekt."
            error={errors.objektidentitet}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={draft.objektidentitet}
                onChange={(e) => update('objektidentitet', e.target.value)}
                className={`flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 font-mono ${
                  errors.objektidentitet
                    ? 'border-red-400 focus:ring-red-300'
                    : 'border-gray-200 focus:ring-blue-300'
                }`}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
              <button
                onClick={generateNewUuid}
                title="Generera nytt UUID"
                className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg border border-gray-200 transition-colors whitespace-nowrap"
              >
                Nytt UUID
              </button>
            </div>
          </Field>

          {/* objektversion */}
          <Field
            label="Objektversion"
            hint="Incrementerande heltal, börjar på 1."
            error={errors.objektversion}
          >
            <input
              type="number"
              min={1}
              step={1}
              value={draft.objektversion}
              onChange={(e) => update('objektversion', parseInt(e.target.value, 10) || 1)}
              className={`w-32 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${
                errors.objektversion
                  ? 'border-red-400 focus:ring-red-300'
                  : 'border-gray-200 focus:ring-blue-300'
              }`}
            />
          </Field>

          {/* versionGiltigFran */}
          <Field
            label="Version giltig från"
            hint="ISO 8601 datum/tid, t.ex. 2024-03-18T09:00:00+01:00"
            error={errors.versionGiltigFran}
          >
            <input
              type="datetime-local"
              value={toDatetimeLocalValue(draft.versionGiltigFran)}
              onChange={(e) => {
                // Convert datetime-local value back to a full ISO string with offset
                const iso = e.target.value
                  ? new Date(e.target.value).toISOString().replace('Z', '+00:00')
                  : draft.versionGiltigFran;
                update('versionGiltigFran', iso);
              }}
              className={`text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${
                errors.versionGiltigFran
                  ? 'border-red-400 focus:ring-red-300'
                  : 'border-gray-200 focus:ring-blue-300'
              }`}
            />
          </Field>

          {/* detaljplansreferens */}
          <Field
            label="Detaljplansreferens"
            hint={
              activeGeometryDocId
                ? 'Auto-ifyllt från importerad geometrifil.'
                : 'UUID för den detaljplan som planbeskrivningen avser.'
            }
            error={errors.detaljplansreferens}
          >
            <input
              type="text"
              value={draft.detaljplansreferens}
              onChange={(e) => update('detaljplansreferens', e.target.value)}
              className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 font-mono ${
                errors.detaljplansreferens
                  ? 'border-red-400 focus:ring-red-300'
                  : 'border-gray-200 focus:ring-blue-300'
              }`}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </Field>

          {/* arkividentitetKommun */}
          <Field
            label="Arkividentitet, kommun"
            hint="Kommunens diarienummer, t.ex. MORA:2024/12345"
          >
            <input
              type="text"
              value={draft.arkividentitetKommun}
              onChange={(e) => update('arkividentitetKommun', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="XXX:ÅÅÅÅ/NNNNN"
            />
          </Field>

          {/* programvara / programvaruversion — read-only */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Programvara (skrivskyddad)</p>
            <div className="flex gap-4 text-xs text-gray-500 font-mono">
              <span>{draft.programvara}</span>
              <span className="text-gray-300">|</span>
              <span>v{draft.programvaruversion}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <button
            onClick={handleReset}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Återställ standardvärden
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Avbryt
            </button>
            <button
              onClick={handleSave}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                saved
                  ? 'bg-green-500 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {saved ? '✓ Sparat' : 'Spara'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
