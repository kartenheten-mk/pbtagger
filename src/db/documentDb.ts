/**
 * documentDb.ts
 *
 * IndexedDB persistence layer for documents.
 * Uses the `idb` library for a clean Promise-based API.
 *
 * Each saved document contains the full state needed to restore a session:
 * zipBuffer, docModel, tags, and geometries.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { AppConfig, Tag, Geometry, DocModel } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Full document record stored in IndexedDB */
export interface SavedDocument {
    id: string;
    fileName: string;
    zipBuffer: ArrayBuffer;
    docModel: DocModel;
    tags: Tag[];
    geometries: Geometry[];
    appConfig?: AppConfig;
    createdAt: string;
    updatedAt: string;
}

/** Lightweight metadata for the document list (no binary data) */
export interface SavedDocumentMeta {
    id: string;
    fileName: string;
    tagCount: number;
    geometryCount: number;
    createdAt: string;
    updatedAt: string;
}

// ─── Database setup ───────────────────────────────────────────────────────────

const DB_NAME = 'pb-tagger-documents';
const DB_VERSION = 1;
const STORE_NAME = 'documents';
const META_CACHE_KEY = 'pb-tagger-document-meta-cache-v1';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('updatedAt', 'updatedAt');
                }
            },
        });
    }
    return dbPromise;
}

function toMeta(doc: SavedDocument): SavedDocumentMeta {
    return {
        id: doc.id,
        fileName: doc.fileName,
        tagCount: doc.tags.length,
        geometryCount: doc.geometries?.length || 0,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}

function sortMetas(metas: SavedDocumentMeta[]): SavedDocumentMeta[] {
    return [...metas].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
}

function readMetaCache(): SavedDocumentMeta[] | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(META_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SavedDocumentMeta[];
        if (!Array.isArray(parsed)) return null;
        return sortMetas(parsed);
    } catch {
        return null;
    }
}

function writeMetaCache(metas: SavedDocumentMeta[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(META_CACHE_KEY, JSON.stringify(sortMetas(metas)));
    } catch {
        // Metadata cache is an optimization; IndexedDB remains the source of truth.
    }
}

function updateCachedMeta(doc: SavedDocument): void {
    const cached = readMetaCache();
    if (!cached) return;
    const meta = toMeta(doc);
    const next = cached.filter((item) => item.id !== meta.id);
    next.push(meta);
    writeMetaCache(next);
}

function removeCachedMeta(id: string): void {
    const cached = readMetaCache();
    if (!cached) return;
    writeMetaCache(cached.filter((item) => item.id !== id));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Save (insert or update) a full document record */
export async function saveDocument(doc: SavedDocument): Promise<void> {
    const db = await getDb();
    await db.put(STORE_NAME, doc);
    updateCachedMeta(doc);
}

/** Retrieve a full document by ID */
export async function getDocument(id: string): Promise<SavedDocument | undefined> {
    const db = await getDb();
    return db.get(STORE_NAME, id);
}

/** List all documents as lightweight metadata, sorted by most recently updated */
export async function getAllDocuments(): Promise<SavedDocumentMeta[]> {
    const cached = readMetaCache();
    if (cached) return cached;

    const db = await getDb();
    const all: SavedDocument[] = await db.getAll(STORE_NAME);

    const metas = sortMetas(all.map(toMeta));
    writeMetaCache(metas);
    return metas;
}

/** Delete a document by ID */
export async function deleteDocument(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(STORE_NAME, id);
    removeCachedMeta(id);
}
