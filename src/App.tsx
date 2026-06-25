/**
 * App.tsx
 *
 * Root component. Manages the two application states:
 *  1. Upload view — no document loaded yet
 *  2. Editor view — document loaded, full three-panel layout
 *
 * Layout (editor view):
 *  ┌──────────────────────────────────────────────────────┐
 *  │  Header (file name, tag count, export button)        │
 *  ├───────────┬──────────────────────────┬───────────────┤
 *  │  Sidebar  │  Document viewer         │  Geometry     │
 *  │  (tags)   │  (TipTap read-only)      │  panel        │
 *  │           │                          │  (canvas/map) │
 *  └───────────┴──────────────────────────┴───────────────┘
 */

import React, { Suspense, lazy, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { DocumentList } from './components/DocumentList';
import { CreateProjectModal } from './components/CreateProjectModal';
import { ResizablePanel } from './components/ResizablePanel';
import { useDocumentStore } from './store/useDocumentStore';
import type { Tema } from './types';
import { flattenCategories, mergeCustomCategories } from './data/categoryUtils';

// Import hierarchical category data
import categoriesData from './data/categories.json';

const builtInTeman: Tema[] = (categoriesData as { teman: Tema[] }).teman;

const Header = lazy(() =>
  import('./components/Header').then((mod) => ({ default: mod.Header }))
);
const Sidebar = lazy(() =>
  import('./components/Sidebar').then((mod) => ({ default: mod.Sidebar }))
);
const DocViewer = lazy(() =>
  import('./editor/DocViewer').then((mod) => ({ default: mod.DocViewer }))
);
const GeometryPanel = lazy(() =>
  import('./geometry/GeometryPanel').then((mod) => ({ default: mod.GeometryPanel }))
);

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center bg-white text-xs text-gray-400">
      {label}
    </div>
  );
}

export default function App() {
  const { docModel, setDocument, clearDocument, importGeometryJson, restoreProject, setPlanbeskrivningConfig, setDocxGmlGeometries, appConfig } = useDocumentStore();
  const [isLoading, setIsLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectMenuButtonRef = useRef<HTMLButtonElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  const { teman, categories } = useMemo(() => {
    const mergedTeman = mergeCustomCategories(builtInTeman, appConfig.categories);
    return {
      teman: mergedTeman,
      categories: flattenCategories(mergedTeman),
    };
  }, [appConfig.categories]);

  useEffect(() => {
    if (!projectMenuOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProjectMenuOpen(false);
    };

    const onMouse = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        projectMenuRef.current &&
        !projectMenuRef.current.contains(target) &&
        projectMenuButtonRef.current &&
        !projectMenuButtonRef.current.contains(target)
      ) {
        setProjectMenuOpen(false);
      }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouse);
    };
  }, [projectMenuOpen]);

  const handleImportProject = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setParseError(null);

    try {
      const { importProject } = await import('./project/ProjectManager');
      const imported = await importProject(file);
      await restoreProject(
        imported.zipBuffer,
        imported.docModel,
        imported.fileName,
        imported.tags,
        imported.geometries,
        imported.activeGeometryDocId,
        imported.geometryDoc,
        imported.appConfig
      );
    } catch (err) {
      console.error('Failed to import project:', err);
      setParseError(err instanceof Error ? err.message : 'Kunde inte importera projektet.');
    } finally {
      setIsLoading(false);
      // reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [restoreProject]);

  const handleCreateProject = useCallback(
    async (projectName: string, docxFile: File, jsonFile: File | null) => {
      setIsLoading(true);
      setParseError(null);
      try {
        const { parseDocx } = await import('./docx/DocxParser');
        const buffer = await docxFile.arrayBuffer();
        const { zip, docModel: model, tags: embeddedTags, planbeskrivning } = await parseDocx(buffer);

        // Store the zip's raw bytes so the exporter can re-open it losslessly
        const zipBytes = zip.generate({ type: 'arraybuffer' });

        // Use provided name or fallback to docx name
        const finalFileName = projectName.trim() !== '' ? projectName.trim() : docxFile.name;

        // setDocument triggers Zustand store to save to DB asynchronously
        setDocument(zipBytes, model, finalFileName, embeddedTags);

        // Restore Planbeskrivning config + GML geometries from embedded XML (if any)
        if (planbeskrivning) {
          setPlanbeskrivningConfig(planbeskrivning.config);
          setDocxGmlGeometries(planbeskrivning.geometries);
        } else {
          // Ensure stale GML comparison layer is cleared when no Planbeskrivning
          setDocxGmlGeometries([]);
        }

        // If a JSON file is provided, import its geometry
        if (jsonFile) {
            try {
                const text = await jsonFile.text();
                const json = JSON.parse(text);
                await importGeometryJson(json, jsonFile.name);
            } catch (err) {
                console.error('Failed to parse .json:', err);
                // We don't abort document loading if JSON fails, but we show a warning
                setParseError('Projektet skapades, men geometrifilen kunde inte läsas in. Du kan försöka lägga till den igen senare.');
            }
        }

        setIsModalOpen(false);
      } catch (err) {
        console.error('Failed to parse .docx:', err);
        setParseError(
          err instanceof Error
            ? err.message
            : 'Kunde inte läsa dokumentet. Är det en giltig .docx-fil?'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [setDocument, importGeometryJson, setPlanbeskrivningConfig, setDocxGmlGeometries]
  );

  const handleClearDocument = useCallback(() => {
    clearDocument();
  }, [clearDocument]);

  // ── Start Page View ────────────────────────────────────────────────────────
  if (!docModel) {
    return (
      <div className="h-screen bg-gray-50 flex flex-col overflow-y-auto">
        <div className="max-w-6xl mx-auto w-full px-4 py-12 flex flex-col items-center">

            {/* Logo / branding */}
            <div className="mb-8 text-center">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                </div>
                <h1 className="text-3xl font-bold text-gray-800">Planbeskrivning Tagger</h1>
                <p className="text-gray-500 text-base mt-2 max-w-lg mx-auto">
                    Tagga och länka planbeskrivningar till geometrier.
                </p>
            </div>

            {/* Project action */}
            <div className="relative w-full max-w-md">
                    <input
                        type="file"
                        accept=".pbproject"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleImportProject}
                    />
                    <button
                        ref={projectMenuButtonRef}
                        onClick={() => setProjectMenuOpen((open) => !open)}
                        disabled={isLoading}
                        aria-haspopup="menu"
                        aria-expanded={projectMenuOpen}
                        className="w-full group relative flex flex-col items-center justify-center bg-white border-2 border-dashed border-gray-300 rounded-2xl p-8 hover:border-blue-400 hover:bg-blue-50/50 transition-all focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4">
                                <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                            </div>
                        ) : (
                            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors shadow-sm">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">Skapa projekt</h2>
                            <svg
                                className={`w-4 h-4 text-gray-400 transition-transform ${projectMenuOpen ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                        <p className="text-sm text-gray-500 mt-2 text-center">
                            Starta nytt eller importera ett sparat projekt
                        </p>
                    </button>

                    {projectMenuOpen && (
                        <div
                            ref={projectMenuRef}
                            role="menu"
                            className="absolute left-0 right-0 top-full mt-3 bg-white border border-gray-200 rounded-2xl shadow-xl z-40 overflow-hidden"
                            style={{ animation: 'fadeSlideDown 0.15s ease-out' }}
                        >
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    setProjectMenuOpen(false);
                                    setIsModalOpen(true);
                                }}
                                className="w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-blue-50 focus:outline-none focus:bg-blue-50 transition-colors"
                            >
                                <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-blue-700">Skapa nytt projekt</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Ladda upp en .docx-fil och börja tagga.</p>
                                </div>
                            </button>

                            <div className="border-t border-gray-100" />

                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    setProjectMenuOpen(false);
                                    fileInputRef.current?.click();
                                }}
                                className="w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-green-50 focus:outline-none focus:bg-green-50 transition-colors"
                            >
                                <div className="w-9 h-9 rounded-lg bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-green-700">Importera existerande projekt</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Öppna en tidigare sparad .pbproject-fil.</p>
                                </div>
                            </button>
                        </div>
                    )}
                </div>

            <div className="w-full mt-12 border-t border-gray-200 pt-8">
                <DocumentList />
            </div>

            {/* Error Message */}
            {parseError && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm px-6 py-4 rounded-xl shadow-xl max-w-sm text-center z-50 animate-in fade-in slide-in-from-bottom-4">
                {parseError}
                <button
                    onClick={() => setParseError(null)}
                    className="absolute top-2 right-2 text-white/70 hover:text-white"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            )}

            <CreateProjectModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleCreateProject}
                isLoading={isLoading}
            />
        </div>
      </div>
    );
  }

  // ── Editor view ──────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-100">
      {/* Top header */}
      <Suspense fallback={<div className="h-14 shrink-0 bg-white border-b border-gray-200" />}>
            <Header onClearDocument={handleClearDocument} categories={categories} />
      </Suspense>

      {/* Three-panel body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: tag list */}
        <ResizablePanel
          side="left"
          label="Taggar"
          defaultWidth={288} // w-72 equivalent
          autoCollapseBelow={900}
          storageKey="sidebar_width"
        >
          <Suspense fallback={<LoadingPanel label="Laddar sidopanel..." />}>
            <Sidebar teman={teman} categories={categories} />
          </Suspense>
        </ResizablePanel>

        {/* Centre: document viewer */}
        <main className="min-w-0 flex-1 overflow-y-auto bg-white border-l border-r border-gray-200">
          <Suspense fallback={<LoadingPanel label="Laddar dokumentvy..." />}>
            <DocViewer docModel={docModel} categories={categories} />
          </Suspense>
        </main>

        {/* Right: geometry panel */}
        <ResizablePanel
          side="right"
          label="Karta"
          defaultWidth={320} // w-80 equivalent
          autoCollapseBelow={1200}
          storageKey="geometry_panel_width"
        >
          <Suspense fallback={<LoadingPanel label="Laddar karta..." />}>
            <GeometryPanel />
          </Suspense>
        </ResizablePanel>
      </div>
    </div>
  );
}

