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
import type { Tag, Geometry, DocModel } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Full document record stored in IndexedDB */
export interface SavedDocument {
    id: string;
    fileName: string;
    zipBuffer: ArrayBuffer;
    docModel: DocModel;
    tags: Tag[];
    geometries: Geometry[];
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

// ─── Public API ───────────────────────────────────────────────────────────────

/** Save (insert or update) a full document record */
export async function saveDocument(doc: SavedDocument): Promise<void> {
    const db = await getDb();
    await db.put(STORE_NAME, doc);
}

/** Retrieve a full document by ID */
export async function getDocument(id: string): Promise<SavedDocument | undefined> {
    const db = await getDb();
    return db.get(STORE_NAME, id);
}

/** List all documents as lightweight metadata, sorted by most recently updated */
export async function getAllDocuments(): Promise<SavedDocumentMeta[]> {
    const db = await getDb();
    const all: SavedDocument[] = await db.getAll(STORE_NAME);

    return all
        .map((doc) => ({
            id: doc.id,
            fileName: doc.fileName,
            tagCount: doc.tags.length,
            geometryCount: doc.geometries?.length || 0,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
        }))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/** Delete a document by ID */
export async function deleteDocument(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(STORE_NAME, id);
}
