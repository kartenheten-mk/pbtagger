/**
 * DataMenu.tsx
 *
 * A single "Data" button in the Header that opens a popover with two sections:
 *   - Import (Upload): .docx replacement, Geometry JSON
 *   - Export (Download): .docx tagged, Geometry JSON, whole project
 *
 * Design goals:
 *   - All data operations in one discoverable place
 *   - Cards with icons, titles and short descriptions
 *   - Disabled states with tooltip hints when preconditions are not met
 *   - Click-outside / Escape to close
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import PizZip from 'pizzip';
import { useDocumentStore } from '../store/useDocumentStore';
import { exportDocx } from '../docx/DocxExporter';
import { exportProject } from '../project/ProjectManager';
import { parseDocx } from '../docx/DocxParser';
import { PlanbeskrivningConfigPanel } from './PlanbeskrivningConfigPanel';
import { buildDefaultConfig } from '../docx/PlanbeskrivningXmlBuilder';

// ─── helpers ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionLabel({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2 px-1">
      <span className="text-gray-400">{icon}</span>
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
    </div>
  );
}

// ─── Individual action card ───────────────────────────────────────────────────

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: 'blue' | 'green' | 'purple' | 'gray';
  disabled?: boolean;
  disabledReason?: string;
  loading?: boolean;
  onClick: () => void;
}

const COLOR_MAP = {
  blue:   { card: 'hover:bg-blue-50 hover:border-blue-300',   icon: 'bg-blue-100 text-blue-600',   title: 'text-blue-700'   },
  green:  { card: 'hover:bg-green-50 hover:border-green-300', icon: 'bg-green-100 text-green-600', title: 'text-green-700' },
  purple: { card: 'hover:bg-purple-50 hover:border-purple-300', icon: 'bg-purple-100 text-purple-600', title: 'text-purple-700' },
  gray:   { card: 'hover:bg-gray-100 hover:border-gray-300',  icon: 'bg-gray-100 text-gray-500',   title: 'text-gray-700'   },
};

function ActionCard({
  icon, title, description, color, disabled, disabledReason, loading, onClick,
}: ActionCardProps) {
  const c = COLOR_MAP[color];
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={disabled ? disabledReason : undefined}
      disabled={disabled || loading}
      className={`
        w-full flex items-start gap-3 px-3 py-3 rounded-xl border text-left
        transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400
        ${disabled
          ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50'
          : `cursor-pointer border-gray-200 bg-white ${c.card}`
        }
      `}
    >
      <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${c.icon}`}>
        {loading ? <Spinner /> : icon}
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-semibold leading-tight ${disabled ? 'text-gray-400' : c.title}`}>{title}</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-snug">{description}</p>
        {disabled && disabledReason && (
          <p className="text-xs text-amber-500 mt-0.5 leading-snug">{disabledReason}</p>
        )}
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const DataMenu: React.FC = () => {
  const {
    zipBuffer,
    docModel,
    fileName,
    tags,
    geometries,
    activeGeometryDocId,
    replaceDocument,
    importGeometryJson,
    exportGeometryJson,
    planbeskrivningConfig,
    exportPlanbeskrivning,
    toggleExportPlanbeskrivning,
    setPlanbeskrivningConfig,
    addGeometry,
  } = useDocumentStore();

  const [open, setOpen] = useState(false);
  const [showPbConfig, setShowPbConfig] = useState(false);

  // Loading states
  const [exportingDocx,    setExportingDocx]    = useState(false);
  const [exportingGeo,     setExportingGeo]      = useState(false);
  const [exportingProject, setExportingProject]  = useState(false);
  const [importingDocx,    setImportingDocx]    = useState(false);
  const [importingGeo,     setImportingGeo]      = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const buttonRef  = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);
  const geoInputRef  = useRef<HTMLInputElement>(null);

  // ── close on click-outside or Escape ──────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onMouse = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current  && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouse);
    };
  }, [open]);

  // Auto-clear banners
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [success]);

  // ── Export .docx ───────────────────────────────────────────────────────────
  const handleExportDocx = useCallback(async () => {
    if (!zipBuffer || !docModel) return;
    setExportingDocx(true);
    setError(null);
    try {
      const zip = new PizZip(zipBuffer);
      const pbOpts = exportPlanbeskrivning
        ? {
            config: planbeskrivningConfig ?? buildDefaultConfig(activeGeometryDocId ?? undefined),
            geometries,
          }
        : undefined;
      await exportDocx(zip, docModel, tags, fileName, pbOpts);
      setSuccess(exportPlanbeskrivning ? 'Taggad .docx med Planbeskrivning v2.0 nedladdad!' : 'Taggad .docx nedladdad!');
      setOpen(false);
    } catch (e) {
      setError('Export av .docx misslyckades. Försök igen.');
      console.error(e);
    } finally {
      setExportingDocx(false);
    }
  }, [zipBuffer, docModel, tags, fileName, exportPlanbeskrivning, planbeskrivningConfig, activeGeometryDocId, geometries]);

  // ── Export geometry JSON ───────────────────────────────────────────────────
  const handleExportGeo = useCallback(async () => {
    setExportingGeo(true);
    setError(null);
    try {
      await exportGeometryJson();
      setSuccess('Geometri-JSON nedladdad!');
      setOpen(false);
    } catch (e) {
      setError('Geometriexport misslyckades.');
      console.error(e);
    } finally {
      setExportingGeo(false);
    }
  }, [exportGeometryJson]);

  // ── Export whole project ───────────────────────────────────────────────────
  const handleExportProject = useCallback(async () => {
    if (!zipBuffer) return;
    setExportingProject(true);
    setError(null);
    try {
      const bufferCopy = zipBuffer.slice(0);
      await exportProject(fileName, bufferCopy, tags, geometries, activeGeometryDocId);
      setSuccess('Projekt exporterat!');
      setOpen(false);
    } catch (e) {
      setError('Projektexport misslyckades.');
      console.error(e);
    } finally {
      setExportingProject(false);
    }
  }, [zipBuffer, fileName, tags, geometries, activeGeometryDocId]);

  // ── Import replacement .docx ───────────────────────────────────────────────
  const handleDocxFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.docx')) {
        setError('Endast .docx-filer stöds.');
        return;
      }
      if (!window.confirm(
        'Ersätt det aktuella dokumentet med den nya filen?\n\n' +
        'Dina befintliga taggar och geometrilänkar bevaras i möjligaste mån.'
      )) {
        if (docxInputRef.current) docxInputRef.current.value = '';
        return;
      }
      setImportingDocx(true);
      setError(null);
      try {
        const buffer = await file.arrayBuffer();
        const { zip, docModel: newModel, tags: embeddedTags, planbeskrivning } = await parseDocx(buffer);
        const zipBytes = zip.generate({ type: 'arraybuffer' });
        // Keep current tags unless the new docx has its own embedded ones
        const finalTags = embeddedTags.length > 0 ? embeddedTags : tags;
        // Use replaceDocument to stay within the same project (same documentId)
        replaceDocument(zipBytes, newModel, file.name, finalTags);
        // Restore Planbeskrivning config + GML geometries from the embedded XML
        if (planbeskrivning) {
          setPlanbeskrivningConfig(planbeskrivning.config);
          for (const geo of planbeskrivning.geometries) {
            addGeometry(geo);
          }
        }
        setSuccess(planbeskrivning?.geometries.length
          ? `Dokument ersatt! ${planbeskrivning.geometries.length} geometri(er) återställda från Planbeskrivning-XML.`
          : 'Dokument ersatt!');
        setOpen(false);
      } catch (e) {
        setError('Kunde inte läsa den nya .docx-filen.');
        console.error(e);
      } finally {
        setImportingDocx(false);
        if (docxInputRef.current) docxInputRef.current.value = '';
      }
    },
    [tags, replaceDocument, setPlanbeskrivningConfig, addGeometry]
  );

  // ── Import geometry JSON ───────────────────────────────────────────────────
  const handleGeoFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setImportingGeo(true);
      setError(null);
      try {
        const text = await file.text();
        const rawJson = JSON.parse(text) as Record<string, unknown>;
        await importGeometryJson(rawJson, file.name);
        setSuccess('Geometri importerad!');
        setOpen(false);
      } catch (e) {
        setError('Kunde inte importera geometri-JSON. Är det en giltig fil?');
        console.error(e);
      } finally {
        setImportingGeo(false);
        if (geoInputRef.current) geoInputRef.current.value = '';
      }
    },
    [importGeometryJson]
  );

  const anyLoading = exportingDocx || exportingGeo || exportingProject || importingDocx || importingGeo;

  return (
    <div className="relative">
      {/* ── Trigger button ─────────────────────────────────────────────── */}
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 ${
          open
            ? 'bg-blue-600 border-blue-600 text-white shadow-md'
            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm'
        }`}
        title="Öppna import-/exportmenyn"
      >
        {/* Folder icon */}
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
        <span>Data</span>
        {/* Chevron */}
        <svg
          className={`w-3 h-3 text-current transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Popover ────────────────────────────────────────────────────── */}
      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden"
          style={{ animation: 'fadeSlideDown 0.15s ease-out' }}
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              <span className="text-sm font-semibold text-gray-700">Data</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded-md hover:bg-gray-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-4 space-y-5">

            {/* ──────────── IMPORT ──────────────────────────────────── */}
            <div>
              <SectionLabel
                label="Importera"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                }
              />

              <div className="space-y-2">
                {/* Import .docx */}
                <ActionCard
                  color="blue"
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  }
                  title="Ersätt dokument (.docx)"
                  description="Byt ut mot en ny .docx och behåll dina taggar och geometrilänkar."
                  loading={importingDocx}
                  onClick={() => docxInputRef.current?.click()}
                />

                {/* Import Geometry JSON */}
                <ActionCard
                  color="green"
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  }
                  title="Importera geometri (.json)"
                  description="Ladda en detaljplan-JSON-fil för att visa geometrier på kartan."
                  loading={importingGeo}
                  onClick={() => geoInputRef.current?.click()}
                />
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100" />

            {/* ──────────── EXPORT ──────────────────────────────────── */}
            <div>
              <SectionLabel
                label="Exportera"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                }
              />

              <div className="space-y-2">
                {/* Export .docx */}
                <ActionCard
                  color="blue"
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  }
                  title="Exportera taggat dokument (.docx)"
                  description="Ladda ner en .docx med innehållskontroller och bokmärken."
                  disabled={tags.length === 0}
                  disabledReason="Lägg till minst en tagg först."
                  loading={exportingDocx}
                  onClick={handleExportDocx}
                />

                {/* Export geometry JSON */}
                <ActionCard
                  color="green"
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  }
                  title="Exportera geometri (.json)"
                  description="Ladda ner geometridokumentet i originalformat."
                  disabled={!activeGeometryDocId}
                  disabledReason="Ingen geometrifil laddad."
                  loading={exportingGeo}
                  onClick={handleExportGeo}
                />

                {/* Export whole project */}
                <ActionCard
                  color="purple"
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  }
                  title="Exportera hela projektet (.pbproject)"
                  description="Allt i en fil — dokument, taggar och geometri."
                  loading={exportingProject}
                  onClick={handleExportProject}
                />
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100" />

            {/* ──────────── PLANBESKRIVNING v2.0 ────────────────────── */}
            <div>
              <SectionLabel
                label="Planbeskrivning v2.0"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                  </svg>
                }
              />
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 space-y-3">
                {/* Toggle row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-amber-900 leading-tight">
                        Inkludera <code className="font-mono text-[10px]">omfattningar.xml</code>
                      </p>
                      <p className="text-[10px] text-amber-700 leading-snug">
                        Bädda in Lantmäterivets Planbeskrivning-XML vid export.
                      </p>
                    </div>
                  </div>
                  {/* Toggle switch */}
                  <button
                    onClick={toggleExportPlanbeskrivning}
                    role="switch"
                    aria-checked={exportPlanbeskrivning}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 ${
                      exportPlanbeskrivning
                        ? 'border-amber-500 bg-amber-500'
                        : 'border-gray-300 bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform mt-px ${
                        exportPlanbeskrivning ? 'translate-x-4' : 'translate-x-px'
                      }`}
                    />
                  </button>
                </div>

                {/* Settings button (only when enabled) */}
                {exportPlanbeskrivning && (
                  <button
                    onClick={() => { setOpen(false); setShowPbConfig(true); }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 text-xs font-medium text-amber-700 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Redigera metadata…
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* ── Status banners ─────────────────────────────────────────── */}
          {(error || success) && (
            <div className={`mx-4 mb-4 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
              error
                ? 'bg-red-50 border border-red-200 text-red-700'
                : 'bg-green-50 border border-green-200 text-green-700'
            }`}>
              {error ? (
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span>{error ?? success}</span>
              <button
                onClick={() => { setError(null); setSuccess(null); }}
                className="ml-auto opacity-60 hover:opacity-100"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Loading overlay hint */}
          {anyLoading && (
            <div className="px-4 pb-4">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                <span>Arbetar…</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={docxInputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={handleDocxFileChange}
      />
      <input
        ref={geoInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleGeoFileChange}
      />

      {/* Planbeskrivning config modal */}
      {showPbConfig && (
        <PlanbeskrivningConfigPanel onClose={() => setShowPbConfig(false)} />
      )}
    </div>
  );
};
