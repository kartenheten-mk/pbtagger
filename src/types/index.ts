// ─── Hierarchical category types ─────────────────────────────────────────────

export interface Undergrupp {
  id: string;
  name: string;
}

export interface Grupp {
  id: string;
  name: string;
  undergrupper: Undergrupp[];
}

export interface Tema {
  id: string;
  name: string;
  color: string;
  grupper: Grupp[];
}

// ─── Category (flattened leaf, derived from the hierarchy) ───────────────────
//
// Each leaf in the Tema → Grupp → Undergrupp tree becomes one Category.
// If a Grupp has no Undergrupper, the Grupp itself is the leaf.
// If a Grupp has Undergrupper, each Undergrupp is a leaf.
// This keeps Tag.categoryId as a simple string reference.

export interface Category {
  /** Unique id for this leaf, used by Tag.categoryId */
  id: string;
  /** The most specific display name (undergrupp name, or grupp name) */
  name: string;
  /** Hex colour inherited from the parent Tema */
  color: string;
  /** Parent tema id */
  temaId: string;
  /** Parent tema display name */
  temaName: string;
  /** Parent grupp id */
  gruppId: string;
  /** Parent grupp display name */
  gruppName: string;
  /** Set when this leaf is an undergrupp */
  undergruppName?: string;
}

// ─── Tag ─────────────────────────────────────────────────────────────────────

export interface Tag {
  uuid: string;
  categoryId: string;
  /** Plain text content of the tagged selection */
  text: string;
  /** Index of the paragraph in DocModel.paragraphs */
  paragraphIndex: number;
  /** Character offset inside the paragraph's concatenated text (start) */
  startOffset: number;
  /** Character offset inside the paragraph's concatenated text (end) */
  endOffset: number;
  /** UUID of the linked geometry, if any */
  geometryId?: string;
  /** Human readable note */
  note?: string;
  createdAt: string; // ISO timestamp
}

// ─── Geometry ────────────────────────────────────────────────────────────────

export type GeometryType = 'point' | 'polygon' | 'line';

export interface Geometry {
  uuid: string;
  name: string;
  type: GeometryType;
  /** GeoJSON-style coordinate arrays */
  coordinates: number[][];
  color?: string;
}

// ─── Document Model (internal representation) ────────────────────────────────

export interface DocRun {
  /** Globally unique run id: `p{paragraphIndex}_r{runIndex}` */
  id: string;
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  fontSize?: number; // half-points as stored in OOXML
  color?: string;    // RRGGBB hex
  fontFamily?: string;
}

export interface DocParagraph {
  /** Sequential 0-based index */
  index: number;
  runs: DocRun[];
  /** Heading level 1-6 or 0 for normal paragraph */
  headingLevel: number;
  /** Alignment: left | center | right | justify */
  alignment?: string;
  /** Numbering list info */
  listLevel?: number;
}

export interface DocModel {
  paragraphs: DocParagraph[];
}

// ─── Pending Selection (text selected in editor, awaiting tag assignment) ────

export interface PendingSelection {
  text: string;
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
}

// ─── App State ───────────────────────────────────────────────────────────────

export interface AppState {
  /** UUID of the currently loaded document in IndexedDB */
  documentId: string | null;
  /** Original ZIP bytes kept in memory for lossless export */
  zipBuffer: ArrayBuffer | null;
  /** Parsed document model */
  docModel: DocModel | null;
  /** Original file name */
  fileName: string;
  /** All applied tags */
  tags: Tag[];
  /** All geometries created / imported */
  geometries: Geometry[];
  /** UUID of the currently selected tag in the sidebar */
  selectedTagUuid: string | null;
  /** UUID of the tag being edited (for geometry linking) */
  linkingTagUuid: string | null;
  /** Text selection waiting to be tagged via the sidebar */
  pendingSelection: PendingSelection[] | null;
  /** Whether to visually show tags in the document viewer */
  showTags: boolean;
}
