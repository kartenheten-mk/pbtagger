import { create } from 'zustand';
import type { Tag, Geometry, DocModel, AppState, PendingSelection } from '../types';

interface DocumentActions {
  // ─── Document lifecycle ─────────────────────────────────────────────────
  setDocument: (
    zipBuffer: ArrayBuffer,
    docModel: DocModel,
    fileName: string
  ) => void;
  clearDocument: () => void;

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
}

const initialState: AppState = {
  zipBuffer: null,
  docModel: null,
  fileName: '',
  tags: [],
  geometries: [],
  selectedTagUuid: null,
  linkingTagUuid: null,
  pendingSelection: null,
};

export const useDocumentStore = create<AppState & DocumentActions>((set) => ({
  ...initialState,

  // ─── Document lifecycle ───────────────────────────────────────────────────
  setDocument: (zipBuffer, docModel, fileName) =>
    set({ zipBuffer, docModel, fileName, tags: [], geometries: [], pendingSelection: null }),

  clearDocument: () => set(initialState),

  // ─── Tag management ───────────────────────────────────────────────────────
  addTag: (tag) =>
    set((state) => ({ tags: [...state.tags, tag] })),

  addTags: (newTags) =>
    set((state) => ({ tags: [...state.tags, ...newTags] })),

  updateTag: (uuid, changes) =>
    set((state) => ({
      tags: state.tags.map((t) => (t.uuid === uuid ? { ...t, ...changes } : t)),
    })),

  removeTag: (uuid) =>
    set((state) => ({
      tags: state.tags.filter((t) => t.uuid !== uuid),
      selectedTagUuid:
        state.selectedTagUuid === uuid ? null : state.selectedTagUuid,
      linkingTagUuid:
        state.linkingTagUuid === uuid ? null : state.linkingTagUuid,
    })),

  selectTag: (uuid) => set({ selectedTagUuid: uuid }),

  // ─── Geometry management ─────────────────────────────────────────────────
  addGeometry: (geometry) =>
    set((state) => ({ geometries: [...state.geometries, geometry] })),

  updateGeometry: (uuid, changes) =>
    set((state) => ({
      geometries: state.geometries.map((g) =>
        g.uuid === uuid ? { ...g, ...changes } : g
      ),
    })),

  removeGeometry: (uuid) =>
    set((state) => ({
      geometries: state.geometries.filter((g) => g.uuid !== uuid),
      // Also unlink any tags referencing this geometry
      tags: state.tags.map((t) =>
        t.geometryId === uuid ? { ...t, geometryId: undefined } : t
      ),
    })),

  // ─── Geometry linking ─────────────────────────────────────────────────────
  startLinking: (tagUuid) => set({ linkingTagUuid: tagUuid }),

  finishLinking: (tagUuid, geometryUuid) =>
    set((state) => ({
      linkingTagUuid: null,
      tags: state.tags.map((t) =>
        t.uuid === tagUuid ? { ...t, geometryId: geometryUuid } : t
      ),
    })),

  cancelLinking: () => set({ linkingTagUuid: null }),

  unlinkGeometry: (tagUuid) =>
    set((state) => ({
      tags: state.tags.map((t) =>
        t.uuid === tagUuid ? { ...t, geometryId: undefined } : t
      ),
    })),

  // ─── Pending selection ────────────────────────────────────────────────────
  setPendingSelection: (selection) => set({ pendingSelection: selection }),
}));
