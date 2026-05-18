/**
 * PlanbeskrivningXmlParser.ts
 *
 * Reads the Lantmäteriet "Nationell dataproduktspecifikation Planbeskrivning v2.0"
 * custom XML part from a .docx ZIP and extracts:
 *
 *   1. Header metadata → PlanbeskrivningConfig
 *   2. GML geometries from <Lage> elements → Geometry[]
 *   3. A map from bookmark-name (<identitet>) to geometry UUID → Map<string, string>
 *      so the importer can link tags to geometries.
 *
 * Called automatically by DocxParser.ts when a .docx containing the
 * Planbeskrivning namespace is opened.
 */

import { v4 as uuidv4 } from 'uuid';
import PizZip from 'pizzip';
import { parseXml } from './XmlHelpers';
import { findPlanbeskrivningXmlPath } from './zipUtils';
import { PLANBESKRIVNING_NS } from './PlanbeskrivningXmlBuilder';
import type { Geometry, GeometryType, PlanbeskrivningConfig } from '../types';

// ─── Namespace constants ──────────────────────────────────────────────────────

const LMG_NS = 'http://namespace.lantmateriet.se/distribution/geometri/v2';
const GML_NS = 'http://www.opengis.net/gml/3.2';

// ─── Public result type ───────────────────────────────────────────────────────

export interface PlanbeskrivningImportResult {
  /** Header metadata — can be used to restore PlanbeskrivningConfig in the store */
  config: PlanbeskrivningConfig;
  /** Geometries parsed from all <Lage> elements that contained GML */
  geometries: Geometry[];
  /**
   * Maps each base <identitet> value (= bookmark name) to the UUIDs of ALL
   * geometries extracted from that tag's <Omfattning> blocks.
   *
   * A tag with multiple linked geometries produces multiple <Omfattning> blocks
   * whose identiteter share the same base name (e.g. `base`, `base_g2`,
   * `base_g3`). All their geometry UUIDs are grouped under the base key so that
   * importing can restore the full `tag.geometryIds` array.
   */
  identitetToGeometryUuid: Map<string, string[]>;
  /** Base <identitet> values whose <Lage> used <planomrade>Ja</planomrade>. */
  planomradeIdentiteter: Set<string>;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Try to extract a PlanbeskrivningImportResult from the given ZIP.
 * Returns null if no Planbeskrivning XML part is found.
 */
export function extractPlanbeskrivningFromZip(
  zip: PizZip
): PlanbeskrivningImportResult | null {
  const path = findPlanbeskrivningXmlPath(zip);
  if (!path) return null;

  const file = zip.file(path);
  if (!file) return null;

  try {
    const xmlText = file.asText();
    return parsePlanbeskrivningXmlText(xmlText);
  } catch (err) {
    console.warn('[PlanbeskrivningXmlParser] Failed to parse Planbeskrivning XML:', err);
    return null;
  }
}

// ─── XML parsing ─────────────────────────────────────────────────────────────

export function parsePlanbeskrivningXmlText(
  xmlText: string
): PlanbeskrivningImportResult | null {
  const doc = parseXml(xmlText);

  // Find the root <Planbeskrivning> element (may be in default NS or prefixed)
  const root = findElementByLocalName(doc as unknown as Element, 'Planbeskrivning');
  if (!root) return null;

  // ── Header metadata ────────────────────────────────────────────────────────
  const config = extractConfig(root);

  // ── Geometries from Omfattning blocks ─────────────────────────────────────
  const geometries: Geometry[] = [];

  const omfNodes = root.getElementsByTagNameNS(PLANBESKRIVNING_NS, 'Omfattning');
  // Fallback if namespace doesn't match (namespace stripping can happen in some parsers)
  const omfElements = omfNodes.length > 0
    ? Array.from({ length: omfNodes.length }, (_, i) => omfNodes[i] as Element)
    : getElementsByLocalName(root, 'Omfattning');

  // ── Pass 1: collect raw (identitet, geoUuid) pairs ────────────────────────
  const rawPairs: Array<{ identitet: string; geoUuid: string }> = [];
  const rawPlanomradeIdentiteter: string[] = [];

  for (const omf of omfElements) {
    const identitet = getChildText(omf, 'identitet');
    if (!identitet) continue;

    const lage = findChildByLocalName(omf, 'Lage');
    if (!lage) continue;

    const geo = extractGeometryFromLage(lage, identitet);
    if (geo) {
      geometries.push(geo);
      rawPairs.push({ identitet, geoUuid: geo.uuid });
    } else if (isPlanomradeJa(lage)) {
      rawPlanomradeIdentiteter.push(identitet);
    }
  }

  // ── Pass 2: group by base identitet ───────────────────────────────────────
  // Derived identiteter end with _g<N> (e.g. _g2, _g3).  When the original
  // base identitet was at the 40-char maximum, it was TRUNCATED before the
  // suffix was appended, so simply stripping "_g2" from the derived string
  // does NOT recover the full base.  We therefore use prefix-matching:
  // the stripped form is always a prefix of the full base identitet.
  const GN_SUFFIX = /_g\d+$/;

  const baseIdentiteter = new Set([
    ...rawPairs.filter(p => !GN_SUFFIX.test(p.identitet)).map(p => p.identitet),
    ...rawPlanomradeIdentiteter.filter((identitet) => !GN_SUFFIX.test(identitet)),
  ]);

  const identitetToGeometryUuid = new Map<string, string[]>();
  const planomradeIdentiteter = new Set<string>();

  const resolveBaseIdentitet = (identitet: string): string => {
    if (!GN_SUFFIX.test(identitet)) return identitet;
    const stripped = identitet.replace(GN_SUFFIX, '');
    for (const base of baseIdentiteter) {
      if (base.startsWith(stripped)) return base;
    }
    return stripped;
  };

  for (const { identitet, geoUuid } of rawPairs) {
    if (!GN_SUFFIX.test(identitet)) {
      // This IS a base — add directly
      const existing = identitetToGeometryUuid.get(identitet) ?? [];
      identitetToGeometryUuid.set(identitet, [...existing, geoUuid]);
    } else {
      // Derived (_g2, _g3, …) — find the matching base via prefix lookup
      const key = resolveBaseIdentitet(identitet);
      const existing = identitetToGeometryUuid.get(key) ?? [];
      identitetToGeometryUuid.set(key, [...existing, geoUuid]);
    }
  }

  for (const identitet of rawPlanomradeIdentiteter) {
    planomradeIdentiteter.add(resolveBaseIdentitet(identitet));
  }

  return { config, geometries, identitetToGeometryUuid, planomradeIdentiteter };
}

// ─── Config extraction ────────────────────────────────────────────────────────

function extractConfig(root: Element): PlanbeskrivningConfig {
  const now = new Date().toISOString().replace('Z', '+00:00');
  const newUuid = uuidv4();

  const objektmetadata = findChildByLocalName(root, 'Objektmetadata');

  return {
    objektidentitet: getChildText(root, 'objektidentitet') || newUuid,
    objektversion: parseInt(getChildText(root, 'objektversion') || '1', 10),
    versionGiltigFran: getChildText(root, 'versionGiltigFran') || now,
    detaljplansreferens: getChildText(root, 'detaljplansreferens') || '',
    programvara: objektmetadata
      ? getChildText(objektmetadata, 'programvara') || 'PB Tagger'
      : 'PB Tagger',
    programvaruversion: objektmetadata
      ? getChildText(objektmetadata, 'programvaruversion') || '0.0.1'
      : '0.0.1',
    arkividentitetKommun: getChildText(root, 'arkividentitetKommun') || '',
  };
}

// ─── Geometry extraction from <Lage> ─────────────────────────────────────────

function extractGeometryFromLage(lage: Element, identitet: string): Geometry | null {
  // Try Polygon (lmg:Yta)
  const ytaEl =
    findChildByNS(lage, LMG_NS, 'Yta') ??
    findChildByLocalName(lage, 'Yta');

  if (ytaEl) {
    return parsePolygonGeometry(ytaEl, identitet);
  }

  // Try Point (lmg:Punkt)
  const punktEl =
    findChildByNS(lage, LMG_NS, 'Punkt') ??
    findChildByLocalName(lage, 'Punkt');

  if (punktEl) {
    return parsePointGeometry(punktEl, identitet);
  }

  // Try LineString (lmg:Linje)
  const linjeEl =
    findChildByNS(lage, LMG_NS, 'Linje') ??
    findChildByLocalName(lage, 'Linje');

  if (linjeEl) {
    return parseLineGeometry(linjeEl, identitet);
  }

  // No GML geometry in this Lage (uses planomrade / reference)
  return null;
}

function isPlanomradeJa(lage: Element): boolean {
  const planomradeEl = findChildByLocalName(lage, 'planomrade');
  const text = planomradeEl?.textContent?.trim().toLowerCase() ?? '';
  return text === 'ja' || text === 'true' || text === '1';
}

// ─── GML deserialization ──────────────────────────────────────────────────────

/**
 * Parse GML posList text into coordinate pairs.
 * GML SWEREF99TM ordering is northing easting per ISO 19111, so each pair
 * is [northing, easting]. We swap to return [easting, northing] pairs (= [x, y])
 * matching our internal Geometry coordinate convention.
 */
function parsePosList(posListText: string): number[][] {
  const nums = posListText.trim().split(/\s+/).map(Number).filter((n) => !isNaN(n));
  const coords: number[][] = [];
  // Each pair: northing, easting — swap to [easting, northing]
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const northing = nums[i];
    const easting = nums[i + 1];
    coords.push([easting, northing]);
  }
  return coords;
}

/**
 * Parse a single <gml:pos> text (northing easting).
 * Returns [easting, northing] = [x, y].
 */
function parsePosText(posText: string): number[] | null {
  const nums = posText.trim().split(/\s+/).map(Number).filter((n) => !isNaN(n));
  if (nums.length < 2) return null;
  // northing easting → [easting, northing]
  return [nums[1], nums[0]];
}

function parsePolygonGeometry(ytaEl: Element, identitet: string): Geometry | null {
  const polygonEl =
    findChildByNS(ytaEl, GML_NS, 'Polygon') ??
    findChildByLocalName(ytaEl, 'Polygon');
  if (!polygonEl) return null;

  const rings: number[][][] = [];

  // Exterior ring
  const exteriorEl =
    findChildByNS(polygonEl, GML_NS, 'exterior') ??
    findChildByLocalName(polygonEl, 'exterior');
  if (exteriorEl) {
    const coords = extractRingCoords(exteriorEl);
    if (coords.length > 0) rings.push(coords);
  }

  // Interior rings
  const nsInteriors = getElementsByNS(polygonEl, GML_NS, 'interior');
  const interiorEls: Element[] =
    nsInteriors.length > 0 ? nsInteriors : getElementsByLocalName(polygonEl, 'interior');

  for (const intEl of interiorEls) {
    const coords = extractRingCoords(intEl);
    if (coords.length > 0) rings.push(coords);
  }

  if (rings.length === 0) return null;

  return {
    uuid: uuidv4(),
    name: identitet,
    type: 'polygon' as GeometryType,
    coordinates: rings as number[][][],
    crs: 'EPSG:3006',
    source: 'docx_gml',
    featureType: 'planbeskrivning',
    color: '#f97316',
    properties: { identitet },
  };
}

function extractRingCoords(ringContainerEl: Element): number[][] {
  const linearRingEl =
    findChildByNS(ringContainerEl, GML_NS, 'LinearRing') ??
    findChildByLocalName(ringContainerEl, 'LinearRing');
  if (!linearRingEl) return [];

  const posListEl =
    findChildByNS(linearRingEl, GML_NS, 'posList') ??
    findChildByLocalName(linearRingEl, 'posList');
  if (!posListEl) return [];

  return parsePosList(posListEl.textContent ?? '');
}

function parsePointGeometry(punktEl: Element, identitet: string): Geometry | null {
  const pointEl =
    findChildByNS(punktEl, GML_NS, 'Point') ??
    findChildByLocalName(punktEl, 'Point');
  if (!pointEl) return null;

  const posEl =
    findChildByNS(pointEl, GML_NS, 'pos') ??
    findChildByLocalName(pointEl, 'pos');
  if (!posEl) return null;

  const xy = parsePosText(posEl.textContent ?? '');
  if (!xy) return null;

  return {
    uuid: uuidv4(),
    name: identitet,
    type: 'point' as GeometryType,
    coordinates: xy as number[],
    crs: 'EPSG:3006',
    source: 'docx_gml',
    featureType: 'planbeskrivning',
    color: '#f97316',
    properties: { identitet },
  };
}

function parseLineGeometry(linjeEl: Element, identitet: string): Geometry | null {
  const lineStringEl =
    findChildByNS(linjeEl, GML_NS, 'LineString') ??
    findChildByLocalName(linjeEl, 'LineString');
  if (!lineStringEl) return null;

  const posListEl =
    findChildByNS(lineStringEl, GML_NS, 'posList') ??
    findChildByLocalName(lineStringEl, 'posList');
  if (!posListEl) return null;

  const coords = parsePosList(posListEl.textContent ?? '');
  if (coords.length === 0) return null;

  return {
    uuid: uuidv4(),
    name: identitet,
    type: 'line' as GeometryType,
    coordinates: coords as number[][],
    crs: 'EPSG:3006',
    source: 'docx_gml',
    featureType: 'planbeskrivning',
    color: '#f97316',
    properties: { identitet },
  };
}

// ─── XML traversal helpers ────────────────────────────────────────────────────

/** Get text content of the first direct child with given local name */
function getChildText(parent: Element, localName: string): string {
  const child = findChildByLocalName(parent, localName);
  return child?.textContent?.trim() ?? '';
}

/** Find first direct or deep child with exact local name (any NS) */
function findChildByLocalName(parent: Element, localName: string): Element | null {
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const n = children[i];
    if (n.nodeType === 1 && (n as Element).localName === localName) {
      return n as Element;
    }
  }
  // Deep search
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    if ((all[i] as Element).localName === localName) return all[i] as Element;
  }
  return null;
}

/** Find first child with given NS + local name */
function findChildByNS(parent: Element, ns: string, localName: string): Element | null {
  const found = parent.getElementsByTagNameNS(ns, localName);
  return found.length > 0 ? (found[0] as Element) : null;
}

/** Get all elements with given NS + local name */
function getElementsByNS(parent: Element, ns: string, localName: string): Element[] {
  const found = parent.getElementsByTagNameNS(ns, localName);
  return Array.from({ length: found.length }, (_, i) => found[i] as Element);
}

/** Get all elements with given local name (any NS) via deep search */
function getElementsByLocalName(parent: Element, localName: string): Element[] {
  const result: Element[] = [];
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i] as Element;
    if (el.localName === localName) result.push(el);
  }
  return result;
}

/** Find an element anywhere in the tree by local name */
function findElementByLocalName(root: Element, localName: string): Element | null {
  if (root.localName === localName) return root;
  const found = root.getElementsByTagName('*');
  for (let i = 0; i < found.length; i++) {
    if ((found[i] as Element).localName === localName) return found[i] as Element;
  }
  return null;
}



