/**
 * FileUpload.tsx
 *
 * Drag-and-drop / click-to-browse .docx file upload area.
 * Calls onFile with the raw ArrayBuffer when a valid file is selected.
 */

import React, { useCallback, useRef, useState } from 'react';

interface FileUploadProps {
  onFile: (buffer: ArrayBuffer, fileName: string) => void;
  isLoading?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFile, isLoading }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!file.name.toLowerCase().endsWith('.docx')) {
        setError('Only .docx files are supported.');
        return;
      }
      try {
        const buffer = await file.arrayBuffer();
        onFile(buffer, file.name);
      } catch {
        setError('Failed to read file. Please try again.');
      }
    },
    [onFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [processFile]
  );

  return (
    <div className="flex flex-col items-center justify-center p-8 w-full">
      {/* Logo / branding */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-800">Planbeskrivning Tagger</h1>
        <p className="text-gray-500 text-sm mt-1">
          Upload a .docx file to start tagging and linking to geometries
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`relative w-full max-w-lg border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${isDragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50'
          } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".docx"
          className="hidden"
          onChange={handleChange}
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-sm text-gray-500 font-medium">Parsing document…</p>
          </div>
        ) : (
          <>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors ${isDragOver ? 'bg-blue-100' : 'bg-white shadow-sm'
              }`}>
              <svg className={`w-7 h-7 transition-colors ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-700 mb-1">
              {isDragOver ? 'Drop your file here' : 'Drag & drop your .docx file'}
            </p>
            <p className="text-sm text-gray-400">
              or <span className="text-blue-500 font-medium">click to browse</span>
            </p>
            <p className="text-xs text-gray-300 mt-3">Supports .docx files only</p>
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 w-full max-w-lg flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
};
