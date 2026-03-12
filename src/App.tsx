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

import React, { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DocumentList } from './components/DocumentList';
import { CreateProjectModal } from './components/CreateProjectModal';
import { DocViewer } from './editor/DocViewer';
import { GeometryPanel } from './geometry/GeometryPanel';
import { ResizablePanel } from './components/ResizablePanel';
import { useDocumentStore } from './store/useDocumentStore';
import { parseDocx } from './docx/DocxParser';
import { importProject } from './project/ProjectManager';
import type { Category, Tema } from './types';
import { flattenCategories } from './data/categoryUtils';

// Import hierarchical category data
import categoriesData from './data/categories.json';

const teman: Tema[] = (categoriesData as { teman: Tema[] }).teman;
const categories: Category[] = flattenCategories(teman);

export default function App() {
  const { docModel, setDocument, clearDocument, importGeometryJson, restoreProject } = useDocumentStore();
  const [isLoading, setIsLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportProject = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setParseError(null);

    try {
      const imported = await importProject(file);
      await restoreProject(
        imported.zipBuffer,
        imported.docModel,
        imported.fileName,
        imported.tags,
        imported.geometries,
        imported.activeGeometryDocId,
        imported.geometryDoc
      );
    } catch (err) {
      console.error('Failed to import project:', err);
      setParseError(err instanceof Error ? err.message : 'Failed to import the project.');
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
        const buffer = await docxFile.arrayBuffer();
        const { zip, docModel: model, tags: embeddedTags } = await parseDocx(buffer);

        // Store the zip's raw bytes so the exporter can re-open it losslessly
        const zipBytes = zip.generate({ type: 'arraybuffer' });

        // Use provided name or fallback to docx name
        const finalFileName = projectName.trim() !== '' ? projectName.trim() : docxFile.name;

        // setDocument triggers Zustand store to save to DB asynchronously
        setDocument(zipBytes, model, finalFileName, embeddedTags);

        // If a JSON file is provided, import its geometry
        if (jsonFile) {
            try {
                const text = await jsonFile.text();
                const json = JSON.parse(text);
                await importGeometryJson(json, jsonFile.name);
            } catch (err) {
                console.error('Failed to parse .json:', err);
                // We don't abort document loading if JSON fails, but we show a warning
                setParseError('Project created, but failed to load geometry file. You can try adding it again later.');
            }
        }

        setIsModalOpen(false);
      } catch (err) {
        console.error('Failed to parse .docx:', err);
        setParseError(
          err instanceof Error
            ? err.message
            : 'Failed to parse the document. Is it a valid .docx file?'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [setDocument, importGeometryJson]
  );

  const handleClearDocument = useCallback(() => {
    if (window.confirm('Discard all tags and open a new file?')) {
      clearDocument();
    }
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
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                <h1 className="text-3xl font-bold text-gray-800">Planbeskrivning Tagger</h1>
                <p className="text-gray-500 text-base mt-2 max-w-lg mx-auto">
                    Tag and link planning documents to spatial geometries.
                </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-6 w-full max-w-2xl justify-center">
                {/* Create Project Button */}
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex-1 group relative flex flex-col items-center justify-center bg-white border-2 border-dashed border-gray-300 rounded-2xl p-8 hover:border-blue-400 hover:bg-blue-50/50 transition-all focus:outline-none focus:ring-4 focus:ring-blue-500/20"
                >
                    <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors shadow-sm">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">Create New Project</h2>
                    <p className="text-sm text-gray-500 mt-2 text-center">
                        Upload your .docx file to get started
                    </p>
                </button>

                {/* Import Project Button */}
                <div className="flex-1 flex">
                    <input
                        type="file"
                        accept=".pbproject"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleImportProject}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading}
                        className="w-full group relative flex flex-col items-center justify-center bg-white border-2 border-dashed border-gray-300 rounded-2xl p-8 hover:border-green-400 hover:bg-green-50/50 transition-all focus:outline-none focus:ring-4 focus:ring-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4">
                                <div className="w-8 h-8 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
                            </div>
                        ) : (
                            <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-4 group-hover:bg-green-100 transition-colors shadow-sm">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                            </div>
                        )}
                        <h2 className="text-xl font-semibold text-gray-800 group-hover:text-green-700 transition-colors">Import Project</h2>
                        <p className="text-sm text-gray-500 mt-2 text-center">
                            Load a previously saved .pbproject file
                        </p>
                    </button>
                </div>
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
      <Header onClearDocument={handleClearDocument} />

      {/* Three-panel body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: tag list */}
        <ResizablePanel
          side="left"
          defaultWidth={288} // w-72 equivalent
          storageKey="sidebar_width"
        >
          <Sidebar teman={teman} categories={categories} />
        </ResizablePanel>

        {/* Centre: document viewer */}
        <main className="flex-1 overflow-y-auto bg-white border-l border-r border-gray-200">
          <DocViewer docModel={docModel} categories={categories} />
        </main>

        {/* Right: geometry panel */}
        <ResizablePanel
          side="right"
          defaultWidth={320} // w-80 equivalent
          storageKey="geometry_panel_width"
        >
          <GeometryPanel />
        </ResizablePanel>
      </div>
    </div>
  );
}

