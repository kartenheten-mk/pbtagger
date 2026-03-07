import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { temporal } from 'zundo';
import { v4 as uuidv4 } from 'uuid';
import type { Tag, Geometry, DocModel, AppState, PendingSelection } from '../types';
import {
  saveDocument as dbSave,
  getDocument as dbGet,
  deleteDocument as dbDelete,
  type SavedDocument,
} from '../db/documentDb';

interface DocumentActions {
  // ─── Document lifecycle ─────────────────────────────────────────────────
  setDocument: (
    zipBuffer: ArrayBuffer,
    docModel: DocModel,
    fileName: string
  ) => void;
  clearDocument: () => void;

  // ─── IndexedDB persistence ────────────────────────────────────────────
  loadDocument: (id: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;

  // ─── Tag management ─────────────────────────────────────────────────────
  addTag: (tag: Tag) => void;
  addTags: (tags: Tag[]) => void;
  updateTag: (uuid: string, changes: Partial<Tag>) => void;
  removeTag: (uuid: string) => void;
  selectTag: (uuid: string | null) => void;

  // ─── Geometry management ────────────────────────────────────────────────
  addGeometry: (geometry: Geometry) => void;
  updateGeometry: (uuid: string, changes: Partial<Geometry>) => void;
  removeGeometry: (uuid: string) => void;

  // ─── Geometry linking ───────────────────────────────────────────────────
  startLinking: (tagUuid: string) => void;
  finishLinking: (tagUuid: string, geometryUuid: string) => void;
  cancelLinking: () => void;
  unlinkGeometry: (tagUuid: string) => void;

  // ─── Pending selection (text selected in editor, awaiting tag) ──────────
  setPendingSelection: (selection: PendingSelection[] | null) => void;

  // ─── UI State ───────────────────────────────────────────────────────────
  toggleShowTags: () => void;
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

export const useDocumentStore = create<AppState & DocumentActions>()(
  temporal(
    persist(
      (set, get) => ({
        ...initialState,

        // ─── Document lifecycle ─────────────────────────────────────────────
        setDocument: (zipBuffer, docModel, fileName) => {
          const documentId = uuidv4();
          const now = new Date().toISOString();
          set({ documentId, zipBuffer, docModel, fileName, tags: [], geometries: [], pendingSelection: null, showTags: true });
          // Clear undo/redo history — it belongs to the previous document
          useDocumentStore.temporal.getState().clear();
          // Save to IndexedDB immediately
          dbSave({
            id: documentId,
            fileName,
            zipBuffer,
            docModel,
            tags: [],
            geometries: [],
            createdAt: now,
            updatedAt: now,
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
          set({
            documentId: doc.id,
            zipBuffer: doc.zipBuffer,
            docModel: doc.docModel,
            fileName: doc.fileName,
            tags: doc.tags,
            geometries: doc.geometries,
            selectedTagUuid: null,
            linkingTagUuid: null,
            pendingSelection: null,
            showTags: true,
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

        selectTag: (uuid) => set({ selectedTagUuid: uuid }),

        // ─── Geometry management ────────────────────────────────────────────
        addGeometry: (geometry) =>
          set((state) => {
            const next = { geometries: [...state.geometries, geometry] };
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
              // Also unlink any tags referencing this geometry
              tags: state.tags.map((t) =>
                t.geometryId === uuid ? { ...t, geometryId: undefined } : t
              ),
            };
            debouncedSave({ ...state, ...next });
            return next;
          }),

        // ─── Geometry linking ───────────────────────────────────────────────
        startLinking: (tagUuid) => set({ linkingTagUuid: tagUuid }),

        finishLinking: (tagUuid, geometryUuid) =>
          set((state) => {
            const next = {
              linkingTagUuid: null,
              tags: state.tags.map((t) =>
                t.uuid === tagUuid ? { ...t, geometryId: geometryUuid } : t
              ),
            };
            debouncedSave({ ...state, ...next });
            return next;
          }),

        cancelLinking: () => set({ linkingTagUuid: null }),

        unlinkGeometry: (tagUuid) =>
          set((state) => {
            const next = {
              tags: state.tags.map((t) =>
                t.uuid === tagUuid ? { ...t, geometryId: undefined } : t
              ),
            };
            debouncedSave({ ...state, ...next });
            return next;
          }),

        // ─── Pending selection ──────────────────────────────────────────────
        setPendingSelection: (selection) => set({ pendingSelection: selection }),

        // ─── UI State ───────────────────────────────────────────────────────
        toggleShowTags: () => set((state) => ({ showTags: !state.showTags })),
      }),
      {
        name: 'pb-tagger-storage',
        // Only persist user-created data, not binary blobs or transient UI state
        partialize: (state) => ({
          tags: state.tags,
          geometries: state.geometries,
          fileName: state.fileName,
          documentId: state.documentId,
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
