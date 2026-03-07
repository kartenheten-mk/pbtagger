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
import { FileUpload } from './components/FileUpload';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DocumentList } from './components/DocumentList';
import { DocViewer } from './editor/DocViewer';
import { GeometryPanel } from './geometry/GeometryPanel';
import { useDocumentStore } from './store/useDocumentStore';
import { parseDocx } from './docx/DocxParser';
import type { Category, Tema } from './types';
import { flattenCategories } from './data/categoryUtils';

// Import hierarchical category data
import categoriesData from './data/categories.json';

const teman: Tema[] = (categoriesData as { teman: Tema[] }).teman;
const categories: Category[] = flattenCategories(teman);

export default function App() {
  const { docModel, setDocument, clearDocument } = useDocumentStore();
  const [isLoading, setIsLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (buffer: ArrayBuffer, fileName: string) => {
      setIsLoading(true);
      setParseError(null);
      try {
        const { zip, docModel: model } = await parseDocx(buffer);
        // Store the zip's raw bytes so the exporter can re-open it losslessly
        const zipBytes = zip.generate({ type: 'arraybuffer' });
        setDocument(zipBytes, model, fileName);
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
    [setDocument]
  );

  const handleClearDocument = useCallback(() => {
    if (window.confirm('Discard all tags and open a new file?')) {
      clearDocument();
    }
  }, [clearDocument]);

  // ── Upload view ──────────────────────────────────────────────────────────
  if (!docModel) {
    return (
      <div className="h-screen bg-gray-50 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto p-4">
          <FileUpload onFile={handleFile} isLoading={isLoading} />
          <DocumentList />
        </div>
        {parseError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm px-5 py-3 rounded-xl shadow-lg max-w-sm text-center">
            {parseError}
          </div>
        )}
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
        <Sidebar teman={teman} categories={categories} />

        {/* Centre: document viewer */}
        <main className="flex-1 overflow-y-auto bg-white">
          <DocViewer docModel={docModel} teman={teman} categories={categories} />
        </main>

        {/* Right: geometry panel */}
        <GeometryPanel />
      </div>
    </div>
  );
}
