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

    if (docs.length === 0) return (
        <div className="w-full text-center py-12 text-gray-500">
            No projects found. Create one to get started!
        </div>
    );

    return (
        <div className="w-full mt-8 px-4">
            {/* Section header */}
            <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                <h2 className="text-base font-semibold text-gray-700 tracking-wide">
                    Project Gallery
                </h2>
            </div>

            {/* Document cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {docs.map((doc) => (
                    <div
                        key={doc.id}
                        className="relative group bg-white border border-gray-200 rounded-xl shadow-sm hover:border-blue-300 hover:shadow-md transition-all flex flex-col overflow-hidden"
                    >
                        {/* Hover Overlay for stats */}
                        <div className="absolute inset-0 bg-white/95 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-4 flex flex-col justify-center items-center text-center pointer-events-none">
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">Project Stats</p>
                            <div className="space-y-1">
                                <p className="text-sm text-gray-700"><span className="font-semibold text-gray-900">{doc.tagCount}</span> Tags</p>
                                <p className="text-sm text-gray-700"><span className="font-semibold text-gray-900">{doc.geometryCount || 0}</span> Geometries</p>
                            </div>
                            <div className="mt-4 text-xs text-gray-400">
                                Created: {formatDate(doc.createdAt)}
                            </div>
                        </div>

                        {/* Visible Card Content */}
                        <button
                            onClick={() => handleLoad(doc.id)}
                            disabled={loadingId !== null}
                            className="w-full text-left flex-1 p-4 flex flex-col disabled:opacity-50 disabled:cursor-wait"
                        >
                            {/* Icon & title */}
                            <div className="flex items-start gap-3 mb-3">
                                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                                    {loadingId === doc.id ? (
                                        <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                                    ) : (
                                        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                        </svg>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-semibold text-gray-800 line-clamp-2 leading-tight group-hover:text-blue-700 transition-colors">
                                        {doc.fileName}
                                    </h3>
                                </div>
                            </div>

                            {/* Footer stats */}
                            <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-100">
                                <span className="text-xs text-gray-500 font-medium">
                                    {formatDate(doc.updatedAt)}
                                </span>
                                <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                    </svg>
                                    {doc.tagCount}
                                </span>
                            </div>
                        </button>

                        {/* Delete button (Z-index above hover overlay to be clickable) */}
                        <button
                            onClick={(e) => handleDelete(e, doc.id, doc.fileName)}
                            className="absolute top-2 right-2 z-20 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Delete project"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
