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

// ─── Category (flattened selectable level, derived from the hierarchy) ───────
//
// Each selectable Tema → Grupp or Tema → Grupp → Undergrupp path becomes one
// Category. Group-level categories are valid even when a group has undergrupper.
// This keeps Tag.categoryId as a simple string reference.

export interface Category {
  /** Unique id for this selectable level, used by Tag.categoryId */
  id: string;
  /** The most specific display name (undergrupp name, or grupp name) */
  name: string;
  /** Selected category depth */
  level: 'grupp' | 'undergrupp';
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
  /** Set when this category is an undergrupp */
  undergruppId?: string;
  /** Set when this category is an undergrupp */
  undergruppName?: string;
}

// ─── Tag ─────────────────────────────────────────────────────────────────────

export type TagTargetType = 'text' | 'image' | 'graph' | 'table';

export interface Tag {
  uuid: string;
  categoryId: string;
  /** What kind of document object this tag targets. Defaults to 'text'. */
  targetType?: TagTargetType;
  /** Plain text content of the tagged selection */
  text: string;
  /** Index of the paragraph in DocModel.paragraphs where the tag starts */
  paragraphIndex: number;
  /** Character offset inside the paragraph's concatenated text (start) */
  startOffset: number;
  /** Character offset inside the paragraph's concatenated text (end) */
  endOffset: number;
  /**
   * When set, the tag spans from paragraphIndex:startOffset to
   * endParagraphIndex:endOffset (i.e. across multiple paragraphs).
   * When absent or equal to paragraphIndex, the tag is single-paragraph.
   */
  endParagraphIndex?: number;
  /** Run id anchor for image/graph tags */
  runId?: string;
  /** Table id anchor for table tags */
  tableId?: string;
  /** UUIDs of linked geometries (supports multiple) */
  geometryIds?: string[];
  /**
   * Set when the tag was imported from a Planbeskrivning XML <Omfattning>
   * whose <Lage> used <planomrade>Ja</planomrade> instead of explicit GML or
   * object references. This allows read-only DOCX imports to preserve that
   * fallback when no geometry JSON is loaded.
   */
  planbeskrivningImportedPlanomrade?: boolean;
  /** Human readable note */
  note?: string;
  createdAt: string; // ISO timestamp
}

// ─── Geometry ────────────────────────────────────────────────────────────────

export type GeometryType = 'point' | 'polygon' | 'line';
export type GeometrySource = 'json' | 'docx_gml';

/**
 * Internal representation of a single geometry feature.
 * Coordinates are stored in the original CRS from the source JSON
 * (e.g. EPSG:3009) for lossless export. Reprojection happens at render time.
 */
export interface Geometry {
  uuid: string;
  name: string;
  type: GeometryType;
  /**
   * Coordinates in original CRS (typically EPSG:3009 for Swedish detaljplan).
   * - Point:   [x, y]
   * - Line:    [[x1,y1], [x2,y2], ...]
   * - Polygon: [[[x1,y1], ...], ...]  (outer ring only stored here)
   */
  coordinates: number[] | number[][] | number[][][];
  /** EPSG code string, e.g. "EPSG:3009". Defaults to EPSG:4326 if absent. */
  crs?: string;
  /** feature:typ from the source JSON (e.g. "detaljplan", "användningsbestämmelse") */
  featureType?: string;
  /** UUID of the parent GeometryDoc this feature belongs to */
  sourceDocId?: string;
  /**
   * Origin of the geometry:
   *  - "json"     = imported detaljplan JSON
   *  - "docx_gml" = parsed from Planbeskrivning GML in a DOCX file
   *
   * Optional for backward compatibility with persisted data created
   * before this field existed.
   */
  source?: GeometrySource;
  /** Additional properties from the source JSON for display/export */
  properties?: Record<string, unknown>;
  color?: string;
}

/**
 * A raw geometry document imported from disk (e.g. a dp225-format JSON).
 * The original JSON is stored verbatim for lossless export.
 */
export interface GeometryDoc {
  /** The detaljplan UUID (objektidentitet of the first detaljplan feature) */
  id: string;
  /** Human-readable name, e.g. "DP225 GUTTORMSENPARKEN, ÄNDR" */
  name: string;
  /** Original file name */
  fileName: string;
  /** The verbatim parsed JSON object for lossless export */
  rawJson: Record<string, unknown>;
  createdAt: string;
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
  color?: string; // RRGGBB hex
  fontFamily?: string;
  isImage?: boolean;
  imageUrl?: string; // Base64 Data URI
  imageData?: Uint8Array; // Raw image bytes, converted to a Data URI by the viewer
  imageMime?: string;
  isGraph?: boolean;
  graphRelId?: string;
}

export interface DocParagraph {
  /** Sequential 0-based index */
  index: number;
  runs: DocRun[];
  /** Heading level 1-6 or 0 for normal paragraph */
  headingLevel: number;
  /** Alignment: left | center | right | justify */
  alignment?: string;
  /** Raw Word paragraph style id, e.g. Heading1, Rubrik1, TOC1, Innehll2 */
  styleId?: string;
  /** Numbering list info */
  listLevel?: number;
  /** Present when this paragraph belongs to a table */
  tableId?: string;
  /** 1-based table number in document order */
  tableIndex?: number;
  /** True for the first paragraph encountered in a table */
  isTableStart?: boolean;
}

export interface DocModel {
  paragraphs: DocParagraph[];
}

// ─── Pending Selection (selected in editor, awaiting tag assignment) ─────────

export interface PendingSelection {
  type: TagTargetType;
  text: string;
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
  runId?: string;
  tableId?: string;
}

// ─── Planbeskrivning v2.0 export config ──────────────────────────────────────

/**
 * Header metadata required for the Lantmäteriet Planbeskrivning v2.0
 * custom XML part (omfattningar.xml).
 */
export interface PlanbeskrivningConfig {
  /** UUID identifying this Planbeskrivning object */
  objektidentitet: string;
  /** Incrementing integer version number (default 1) */
  objektversion: number;
  /** ISO 8601 datetime when this version became valid */
  versionGiltigFran: string;
  /**
   * UUID reference to the Detaljplan this description belongs to.
   * Auto-populated from the active GeometryDoc when available.
   */
  detaljplansreferens: string;
  /** Name of the producing software (default "PB Tagger") */
  programvara: string;
  /** Version of the producing software */
  programvaruversion: string;
  /** Municipality archive identifier, e.g. "MORA:2024/12345" */
  arkividentitetKommun: string;
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
  /** Text/object selection waiting to be tagged via the sidebar */
  pendingSelection: PendingSelection[] | null;
  /** Whether to visually show tags in the document viewer */
  showTags: boolean;
  /** UUID of the currently active geometry (detaljplan) document */
  activeGeometryDocId: string | null;
  /** Metadata for generating the Planbeskrivning v2.0 XML on export */
  planbeskrivningConfig: PlanbeskrivningConfig | null;
  /** If true, compliance errors block Planbeskrivning export */
  enforcePlanbeskrivningCompliance: boolean;
}
