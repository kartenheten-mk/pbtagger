// ─── Category ────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  color: string; // hex colour used for highlights & badges
  description?: string;
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

// ─── App State ───────────────────────────────────────────────────────────────

export interface AppState {
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
}
