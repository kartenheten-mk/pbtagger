/**
 * geometryDb.ts
 *
 * IndexedDB persistence for raw geometry JSON documents.
 * Each uploaded detaljplan JSON is stored verbatim here, keyed by
 * the detaljplan UUID, enabling lossless export back to the original format.
 *
 * Uses a separate DB from documentDb.ts to keep concerns clean.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { GeometryDoc } from '../types';

// ─── DB setup ─────────────────────────────────────────────────────────────────

const DB_NAME = 'pb-tagger-geometry';
const DB_VERSION = 1;
const STORE_NAME = 'geometryDocs';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      },
    });
  }
  return dbPromise;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Save (insert or update) a geometry document */
export async function saveGeometryDoc(doc: GeometryDoc): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, doc);
}

/** Retrieve a geometry document by its detaljplan UUID */
export async function getGeometryDoc(id: string): Promise<GeometryDoc | undefined> {
  const db = await getDb();
  return db.get(STORE_NAME, id);
}

/** List all geometry documents, most recently created first */
export async function getAllGeometryDocs(): Promise<GeometryDoc[]> {
  const db = await getDb();
  const all: GeometryDoc[] = await db.getAll(STORE_NAME);
  return all.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** Delete a geometry document by ID */
export async function deleteGeometryDoc(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}
