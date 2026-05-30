import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { temporal } from 'zundo';
import { v4 as uuidv4 } from 'uuid';
import type { Tag, Geometry, DocModel, AppState, PendingSelection, PlanbeskrivningConfig } from '../types';
import { buildDefaultConfig } from '../docx/PlanbeskrivningXmlBuilder';
import {
  saveDocument as dbSave,
  getDocument as dbGet,
  deleteDocument as dbDelete,
  type SavedDocument,
} from '../db/documentDb';
import {
  saveGeometryDoc,
  getGeometryDoc,
  deleteGeometryDoc,
} from '../geometry/geometryDb';
import { parseDetaljplanJson } from '../geometry/detaljplanParser';
import {
  exportGeometryDocAsString,
  exportGeometryDocWithMotivAsString,
} from '../geometry/geoJsonConverter';
import { normalizeGeometrySource } from '../geometry/geometrySource';
import { replaceDocxGmlGeometriesInState } from './geometryMerge';
import { saveAs } from 'file-saver';

interface DocumentActions {
  // ─── Document lifecycle ─────────────────────────────────────────────────
  setFileName: (name: string) => void;
  setDocument: (
    zipBuffer: ArrayBuffer,
    docModel: DocModel,
    fileName: string,
    initialTags?: Tag[]
  ) => void;
  /**
   * Replace the document content (zip + parsed model) inside the *current*
   * project without resetting the documentId, geometries or geometry links.
   * Use this when the user wants to swap out the .docx file mid-session.
   */
  replaceDocument: (
    zipBuffer: ArrayBuffer,
    docModel: DocModel,
    fileName: string,
    tags: Tag[]
  ) => void;
  clearDocument: () => void;

  // ─── IndexedDB persistence ────────────────────────────────────────────
  loadDocument: (id: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  restoreProject: (
    zipBuffer: ArrayBuffer,
    docModel: DocModel,
    fileName: string,
    tags: Tag[],
    geometries: Geometry[],
    activeGeometryDocId: string | null,
    geometryDoc: import('../types').GeometryDoc | null
  ) => Promise<void>;

  // ─── Tag management ─────────────────────────────────────────────────────
  addTag: (tag: Tag) => void;
  addTags: (tags: Tag[]) => void;
  updateTag: (uuid: string, changes: Partial<Tag>) => void;
  removeTag: (uuid: string) => void;
  selectTag: (uuid: string | null) => void;

  // ─── Geometry management ────────────────────────────────────────────────
  addGeometry: (geometry: Geometry) => void;
  /** Replace all DOCX-derived GML geometries with a fresh import set */
  setDocxGmlGeometries: (geometries: Geometry[]) => void;
  updateGeometry: (uuid: string, changes: Partial<Geometry>) => void;
  removeGeometry: (uuid: string) => void;

  // ─── Geometry document import / export ──────────────────────────────────
  /**
   * Parse a raw detaljplan JSON object, persist it to IndexedDB,
   * and load its features into the geometry store.
   */
  importGeometryJson: (rawJson: Record<string, unknown>, fileName: string) => Promise<void>;
  /**
   * Remove all geometries belonging to the active geometry document
   * and delete the document from IndexedDB.
   */
  removeGeometryDoc: (docId: string) => Promise<void>;
  /**
   * Download the active geometry document back to disk in its original format.
   */
  exportGeometryJson: () => Promise<void>;
  /**
   * Download a cloned geometry document with linked motiv text written into
   * planbestämmelsebeskrivning.motiv for planbestämmelse features.
   */
  exportGeometryJsonWithMotiv: () => Promise<void>;

  // ─── Geometry linking ───────────────────────────────────────────────────
  startLinking: (tagUuid: string) => void;
  /** Append a single geometry UUID to the tag's geometryIds array */
  finishLinking: (tagUuid: string, geometryUuid: string) => void;
  /** Replace the tag's geometryIds with a full new set (batch assignment) */
  batchLinkGeometries: (tagUuid: string, geometryUuids: string[]) => void;
  cancelLinking: () => void;
  /** Remove a specific geometry UUID from the tag's geometryIds array */
  unlinkGeometry: (tagUuid: string, geometryUuid: string) => void;
  /** Remove all geometry links from a tag */
  unlinkAllGeometries: (tagUuid: string) => void;

  // ─── Pending selection (text selected in editor, awaiting tag) ──────────
  setPendingSelection: (selection: PendingSelection[] | null) => void;

  // ─── UI State ───────────────────────────────────────────────────────────
  toggleShowTags: () => void;

  // ─── Planbeskrivning config ──────────────────────────────────────────────
  /** Update one or more fields of the Planbeskrivning export config */
  setPlanbeskrivningConfig: (config: Partial<PlanbeskrivningConfig>) => void;
  /** Reset config to defaults (e.g. after loading a new document) */
  resetPlanbeskrivningConfig: (detaljplansreferens?: string) => void;
  /** Toggle whether compliance errors should block export */
  togglePlanbeskrivningCompliance: () => void;
}

const initialState: AppState = {
  documentId: null,
  zipBuffer: null,
  docModel: null,
  fileName: '',
  tags: [],
  geometries: [],
  selectedTagUuid: null,
  linkingTagUuid: null,
  pendingSelection: null,
  showTags: true,
  activeGeometryDocId: null,
  planbeskrivningConfig: null,
  enforcePlanbeskrivningCompliance: true,
};

// ─── Debounced auto-save to IndexedDB ──────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSave(state: AppState) {
  if (!state.documentId || !state.zipBuffer || !state.docModel) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const doc: SavedDocument = {
      id: state.documentId!,
      fileName: state.fileName,
      zipBuffer: state.zipBuffer!,
      docModel: state.docModel!,
      tags: state.tags,
      geometries: state.geometries,
      createdAt: '', // will be set by the save logic below
      updatedAt: new Date().toISOString(),
    };
    // Preserve createdAt from existing record
    dbGet(doc.id).then((existing) => {
      doc.createdAt = existing?.createdAt ?? doc.updatedAt;
      dbSave(doc);
    });
  }, 500);
}

/**
 * Migrate tags that have the old single `geometryId` field to the new
 * `geometryIds` array format. Safe to run on already-migrated data.
 */
function migrateTagsGeometryIds(tags: Tag[]): Tag[] {
  return tags.map((t) => {
    const legacy = (t as unknown as Record<string, unknown>)['geometryId'] as string | undefined;
    if (legacy && !t.geometryIds) {
      return { ...t, geometryIds: [legacy] };
    }
    return t;
  });
}

function buildMotivExportFileName(fileName: string): string {
  if (fileName.toLowerCase().endsWith('.json')) {
    return `${fileName.slice(0, -5)}_med_motiv.json`;
  }
  return `${fileName}_med_motiv.json`;
}

export const useDocumentStore = create<AppState & DocumentActions>()(
  temporal(
    persist(
      (set, get) => ({
        ...initialState,

        // ─── Document lifecycle ─────────────────────────────────────────────
        restoreProject: async (
          zipBuffer,
          docModel,
          fileName,
          tags,
          geometries,
          activeGeometryDocId,
          geometryDoc
        ) => {
          const documentId = uuidv4();
          const now = new Date().toISOString();
          const migratedTags = migrateTagsGeometryIds(tags);
          const normalizedGeometries = geometries.map(normalizeGeometrySource);

          if (geometryDoc) {
             await saveGeometryDoc(geometryDoc);
          }

          set({
            documentId,
            zipBuffer,
            docModel,
            fileName,
            tags: migratedTags,
            geometries: normalizedGeometries,
            pendingSelection: null,
            showTags: true,
            activeGeometryDocId,
          });

          useDocumentStore.temporal.getState().clear();

          await dbSave({
            id: documentId,
            fileName,
            zipBuffer,
            docModel,
            tags: migratedTags,
            geometries: normalizedGeometries,
            createdAt: now,
            updatedAt: now,
          });
        },

        setDocument: (zipBuffer, docModel, fileName, initialTags) => {
          const documentId = uuidv4();
          const now = new Date().toISOString();
          const tags = migrateTagsGeometryIds(initialTags ?? []);
          set({ documentId, zipBuffer, docModel, fileName, tags, geometries: [], pendingSelection: null, showTags: true });
          // Clear undo/redo history — it belongs to the previous document
          useDocumentStore.temporal.getState().clear();
          // Save to IndexedDB immediately
          dbSave({
            id: documentId,
            fileName,
            zipBuffer,
            docModel,
            tags,
            geometries: [],
            createdAt: now,
            updatedAt: now,
          });
        },

        replaceDocument: (zipBuffer, docModel, fileName, tags) => {
          // Keep the same documentId, geometries and geometry links —
          // only swap out the document content.
          const state = get();
          const documentId = state.documentId;
          if (!documentId) return;
          const now = new Date().toISOString();
          const migratedTags = migrateTagsGeometryIds(tags);
          set({ zipBuffer, docModel, fileName, tags: migratedTags });
          // Clear undo history since the document structure changed
          useDocumentStore.temporal.getState().clear();
          // Persist to IndexedDB under the same ID
          dbGet(documentId).then((existing) => {
            dbSave({
              id: documentId,
              fileName,
              zipBuffer,
              docModel,
              tags: migratedTags,
              geometries: get().geometries,
              createdAt: existing?.createdAt ?? now,
              updatedAt: now,
            });
          });
        },

        clearDocument: () => {
          set(initialState);
          useDocumentStore.temporal.getState().clear();
        },

        // ─── IndexedDB persistence ──────────────────────────────────────────
        loadDocument: async (id: string) => {
          const doc = await dbGet(id);
          if (!doc) throw new Error(`Document ${id} not found in IndexedDB`);
          // Restore activeGeometryDocId from the geometries that were saved
          const restoredGeoDocId =
            doc.geometries.find((g) => g.sourceDocId)?.sourceDocId ?? null;
          set({
            documentId: doc.id,
            zipBuffer: doc.zipBuffer,
            docModel: doc.docModel,
            fileName: doc.fileName,
            tags: migrateTagsGeometryIds(doc.tags),
            geometries: doc.geometries.map(normalizeGeometrySource),
            selectedTagUuid: null,
            linkingTagUuid: null,
            pendingSelection: null,
            showTags: true,
            activeGeometryDocId: restoredGeoDocId,
          });
          useDocumentStore.temporal.getState().clear();
        },

        deleteDocument: async (id: string) => {
          await dbDelete(id);
          // If the deleted document is the currently loaded one, clear the store
          if (get().documentId === id) {
            set(initialState);
            useDocumentStore.temporal.getState().clear();
          }
        },

        setFileName: (name: string) => {
          const state = get();
          if (!state.documentId) return;
          set({ fileName: name });
          debouncedSave({ ...state, fileName: name });
        },

        // ─── Tag management ─────────────────────────────────────────────────
        addTag: (tag) =>
          set((state) => {
            const next = { tags: [...state.tags, tag] };
            debouncedSave({ ...state, ...next });
            return next;
          }),

        addTags: (newTags) =>
          set((state) => {
            const next = { tags: [...state.tags, ...newTags] };
            debouncedSave({ ...state, ...next });
            return next;
          }),

        updateTag: (uuid, changes) =>
          set((state) => {
            const next = {
              tags: state.tags.map((t) => (t.uuid === uuid ? { ...t, ...changes } : t)),
            };
            debouncedSave({ ...state, ...next });
            return next;
          }),

        removeTag: (uuid) =>
          set((state) => {
            const next = {
              tags: state.tags.filter((t) => t.uuid !== uuid),
              selectedTagUuid:
                state.selectedTagUuid === uuid ? null : state.selectedTagUuid,
              linkingTagUuid:
                state.linkingTagUuid === uuid ? null : state.linkingTagUuid,
            };
            debouncedSave({ ...state, ...next });
            return next;
          }),

        selectTag: (uuid) =>
          set((state) => {
            if (uuid !== null && state.selectedTagUuid === uuid) {
              queueMicrotask(() => set({ selectedTagUuid: uuid }));
              return { selectedTagUuid: null };
            }
            return { selectedTagUuid: uuid };
          }),

        // ─── Geometry management ────────────────────────────────────────────
        addGeometry: (geometry) =>
          set((state) => {
            const next = { geometries: [...state.geometries, normalizeGeometrySource(geometry)] };
            debouncedSave({ ...state, ...next });
            return next;
          }),

        setDocxGmlGeometries: (geometries) =>
          set((state) => {
            const next = replaceDocxGmlGeometriesInState(
              state.geometries,
              state.tags,
              geometries
            );
            debouncedSave({ ...state, ...next });
            return next;
          }),

        updateGeometry: (uuid, changes) =>
          set((state) => {
            const next = {
              geometries: state.geometries.map((g) =>
                g.uuid === uuid ? { ...g, ...changes } : g
              ),
            };
            debouncedSave({ ...state, ...next });
            return next;
          }),

        removeGeometry: (uuid) =>
          set((state) => {
            const next = {
              geometries: state.geometries.filter((g) => g.uuid !== uuid),
              // Remove the geometry UUID from any tag that references it
              tags: state.tags.map((t) => {
                if (!t.geometryIds?.includes(uuid)) return t;
                const remaining = t.geometryIds.filter((id) => id !== uuid);
                return { ...t, geometryIds: remaining.length > 0 ? remaining : undefined };
              }),
            };
            debouncedSave({ ...state, ...next });
            return next;
          }),

        // ─── Geometry document import / export ─────────────────────────────
        importGeometryJson: async (rawJson, fileName) => {
          const { geometryDoc, geometries } = parseDetaljplanJson(rawJson, fileName);
          const newGeometries = geometries.map(normalizeGeometrySource);

          const prev = get().activeGeometryDocId;

          // If swapping to a different plan doc, remove the old one from IndexedDB
          if (prev && prev !== geometryDoc.id) {
            await deleteGeometryDoc(prev);
          }
          // Persist new / updated raw JSON to IndexedDB
          await saveGeometryDoc(geometryDoc);

          // ── Smart merge: keep tag→geometry links for features whose id
          //    appears in both the old and new JSON. Only unlink tags for
          //    features that disappear entirely in the new upload.
          const newUuidSet = new Set(newGeometries.map((g) => g.uuid));

          set((state) => {
            let updatedTags = state.tags;

            if (prev) {
              // UUIDs present in the old doc but absent from the new import
              const removedUuids = new Set(
                state.geometries
                  .filter((g) => g.sourceDocId === prev && !newUuidSet.has(g.uuid))
                  .map((g) => g.uuid)
              );
              // Unlink only the tags that referenced a now-deleted feature
              if (removedUuids.size > 0) {
                updatedTags = state.tags.map((t) => {
                  if (!t.geometryIds || !t.geometryIds.some((id) => removedUuids.has(id))) return t;
                  const remaining = t.geometryIds.filter((id) => !removedUuids.has(id));
                  return { ...t, geometryIds: remaining.length > 0 ? remaining : undefined };
                });
              }
            }

            // Drop old doc's geometries; add all new ones (same UUIDs → links survive)
            const keptGeometries = prev
              ? state.geometries.filter((g) => g.sourceDocId !== prev)
              : state.geometries;

            // ── Auto-populate detaljplansreferens in Planbeskrivning config ──
            // Only set it if the config is null or if the referens was previously
            // pointing at the old plan doc (avoid overwriting manual edits).
            const prevRef = state.planbeskrivningConfig?.detaljplansreferens ?? '';
            const shouldUpdateRef = !state.planbeskrivningConfig || prevRef === '' || prevRef === prev;
            const updatedConfig: PlanbeskrivningConfig | null = shouldUpdateRef
              ? {
                  ...(state.planbeskrivningConfig ?? buildDefaultConfig(geometryDoc.id)),
                  detaljplansreferens: geometryDoc.id,
                }
              : state.planbeskrivningConfig;

            const nextState = {
              geometries: [...keptGeometries, ...newGeometries],
              activeGeometryDocId: geometryDoc.id,
              tags: updatedTags,
              planbeskrivningConfig: updatedConfig,
            };
            debouncedSave({ ...state, ...nextState });
            return nextState;
          });
        },

        removeGeometryDoc: async (docId) => {
          await deleteGeometryDoc(docId);
          set((state) => ({
            geometries: state.geometries.filter((g) => g.sourceDocId !== docId),
            // Keep tag.geometryId references intact — they will automatically
            // reconnect if the same JSON (same feature IDs) is re-imported later.
            activeGeometryDocId:
              get().activeGeometryDocId === docId ? null : get().activeGeometryDocId,
          }));
        },

        exportGeometryJson: async () => {
          const docId = get().activeGeometryDocId;
          if (!docId) return;
          const doc = await getGeometryDoc(docId);
          if (!doc) return;
          const content = exportGeometryDocAsString(doc);
          const blob = new Blob([content], { type: 'application/json' });
          saveAs(blob, doc.fileName);
        },

        exportGeometryJsonWithMotiv: async () => {
          const state = get();
          const docId = state.activeGeometryDocId;
          if (!docId) return;
          const doc = await getGeometryDoc(docId);
          if (!doc) return;
          const content = exportGeometryDocWithMotivAsString(
            doc,
            state.tags,
            state.geometries
          );
          const blob = new Blob([content], { type: 'application/json' });
          saveAs(blob, buildMotivExportFileName(doc.fileName));
        },

        // ─── Geometry linking ───────────────────────────────────────────────
        startLinking: (tagUuid) => set({ linkingTagUuid: tagUuid }),

        /** Toggle-append a single geometry UUID into the tag's geometryIds array */
        finishLinking: (tagUuid, geometryUuid) =>
          set((state) => {
            const next = {
              // Do NOT close linkingTagUuid here — multi-select stays open
              // (GeometryPanel handles closing via batchLinkGeometries / cancelLinking)
              tags: state.tags.map((t) => {
                if (t.uuid !== tagUuid) return t;
                const existing = t.geometryIds ?? [];
                const already = existing.includes(geometryUuid);
                return {
                  ...t,
                  geometryIds: already
                    ? existing.filter((id) => id !== geometryUuid) // toggle off
                    : [...existing, geometryUuid],                  // toggle on
                };
              }),
            };
            debouncedSave({ ...state, ...next });
            return next;
          }),

        /** Replace the tag's geometryIds with a full new set and exit linking mode */
        batchLinkGeometries: (tagUuid, geometryUuids) =>
          set((state) => {
            const next = {
              linkingTagUuid: null,
              tags: state.tags.map((t) =>
                t.uuid === tagUuid
                  ? { ...t, geometryIds: geometryUuids.length > 0 ? geometryUuids : undefined }
                  : t
              ),
            };
            debouncedSave({ ...state, ...next });
            return next;
          }),

        cancelLinking: () => set({ linkingTagUuid: null }),

        /** Remove a specific geometry UUID from the tag's geometryIds array */
        unlinkGeometry: (tagUuid, geometryUuid) =>
          set((state) => {
            const next = {
              tags: state.tags.map((t) => {
                if (t.uuid !== tagUuid) return t;
                const remaining = (t.geometryIds ?? []).filter((id) => id !== geometryUuid);
                return { ...t, geometryIds: remaining.length > 0 ? remaining : undefined };
              }),
            };
            debouncedSave({ ...state, ...next });
            return next;
          }),

        /** Remove ALL geometry links from a tag */
        unlinkAllGeometries: (tagUuid) =>
          set((state) => {
            const next = {
              tags: state.tags.map((t) =>
                t.uuid === tagUuid ? { ...t, geometryIds: undefined } : t
              ),
            };
            debouncedSave({ ...state, ...next });
            return next;
          }),

        // ─── Pending selection ──────────────────────────────────────────────
        setPendingSelection: (selection) => set({ pendingSelection: selection }),

        // ─── UI State ───────────────────────────────────────────────────────
        toggleShowTags: () => set((state) => ({ showTags: !state.showTags })),

        // ─── Planbeskrivning config ─────────────────────────────────────────
        setPlanbeskrivningConfig: (changes) =>
          set((state) => {
            const current =
              state.planbeskrivningConfig ??
              buildDefaultConfig(state.activeGeometryDocId ?? undefined);
            return { planbeskrivningConfig: { ...current, ...changes } };
          }),

        resetPlanbeskrivningConfig: (detaljplansreferens) =>
          set(() => ({
            planbeskrivningConfig: buildDefaultConfig(detaljplansreferens),
          })),

        togglePlanbeskrivningCompliance: () =>
          set((state) => ({
            enforcePlanbeskrivningCompliance:
              !state.enforcePlanbeskrivningCompliance,
          })),

      }),
      {
        name: 'pb-tagger-storage',
        // Only persist user-created data, not binary blobs or transient UI state
        partialize: (state) => ({
          tags: state.tags,
          geometries: state.geometries,
          fileName: state.fileName,
          documentId: state.documentId,
          planbeskrivningConfig: state.planbeskrivningConfig,
          enforcePlanbeskrivningCompliance:
            state.enforcePlanbeskrivningCompliance,
        }),
      },
    ),
    {
      // Only track tags & geometries for undo/redo (skip UI state & binary data)
      partialize: (state) => ({
        tags: state.tags,
        geometries: state.geometries,
      }),
      // Only create an undo entry when tags or geometries actually changed
      // (avoids double-undo when setPendingSelection/selectTag/etc. fires)
      equality: (pastState, currentState) =>
        pastState.tags === currentState.tags &&
        pastState.geometries === currentState.geometries,
      limit: 50,
    },
  ),
);
