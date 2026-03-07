/**
 * DocumentList.tsx
 *
 * Lists all documents saved in IndexedDB.
 * Shown on the upload view so users can resume work on a previous document.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { getAllDocuments, deleteDocument, type SavedDocumentMeta } from '../db/documentDb';
import { useDocumentStore } from '../store/useDocumentStore';

export const DocumentList: React.FC = () => {
    const [docs, setDocs] = useState<SavedDocumentMeta[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const loadDocument = useDocumentStore((s) => s.loadDocument);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const list = await getAllDocuments();
            setDocs(list);
        } catch (err) {
            console.error('Failed to list documents:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleLoad = async (id: string) => {
        setLoadingId(id);
        try {
            await loadDocument(id);
        } catch (err) {
            console.error('Failed to load document:', err);
            setLoadingId(null);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string, fileName: string) => {
        e.stopPropagation();
        if (!window.confirm(`Delete "${fileName}" and all its tags? This cannot be undone.`)) return;
        try {
            await deleteDocument(id);
            setDocs((prev) => prev.filter((d) => d.id !== id));
        } catch (err) {
            console.error('Failed to delete document:', err);
        }
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (loading) {
        return (
            <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (docs.length === 0) return null;

    return (
        <div className="w-full max-w-lg mt-8">
            {/* Section header */}
            <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Recent Documents
                </h2>
            </div>

            {/* Document cards */}
            <div className="space-y-2">
                {docs.map((doc) => (
                    <button
                        key={doc.id}
                        onClick={() => handleLoad(doc.id)}
                        disabled={loadingId !== null}
                        className="w-full text-left group flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-blue-300 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-wait"
                    >
                        {/* Icon */}
                        <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                            {loadingId === doc.id ? (
                                <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                            ) : (
                                <svg className="w-4.5 h-4.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-700 transition-colors">
                                {doc.fileName}
                            </p>
                            <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs text-gray-400">
                                    {formatDate(doc.updatedAt)}
                                </span>
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                    </svg>
                                    {doc.tagCount} {doc.tagCount === 1 ? 'tag' : 'tags'}
                                </span>
                            </div>
                        </div>

                        {/* Delete button */}
                        <div
                            onClick={(e) => handleDelete(e, doc.id, doc.fileName)}
                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete document"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};
