/**
 * PlanbeskrivningXmlBuilder.ts
 *
 * Generates the Lantmäteriet "Nationell dataproduktspecifikation
 * Planbeskrivning v2.0" custom XML part (`omfattningar.xml`).
 *
 * The XML maps document sections (identified by OOXML bookmark names) to
 * their geospatial extent (GML 3.2.1 geometries or indirect references) and
 * their classification (tema / grupp / undergrupp from BFS 2020:8).
 *
 * Business rules enforced:
 *   PLANB-001  At least one location attribute must exist in <Lage>
 *   PLANB-002  "Motiv till reglering" must have <planbestammelsereferens>
 *   PLANB-003  All <identitet> values must be unique
 *   PLANB-004  tema/grupp/undergrupp must come from BFS 2020:8 mapping
 *   PLANB-005  <identitet> matches ^[A-Za-zÅÄÖåäö][A-Za-zÅÄÖåäö0-9_]{0,39}$
 *   PLANB-006  Direct GML geometry takes precedence over indirect references
 *   PLANB-007  <objektreferens> must use a persistent identifier
 *   PLANB-008  Only ONE of objektreferens/planbestammelsereferens/planomrade per <Lage>
 */

import proj4 from 'proj4';
import type { Tag, Geometry, Category, PlanbeskrivningConfig } from '../types';
import type { Tema } from '../types';
import { flattenCategories } from '../data/categoryUtils';
import rawCategories from '../data/categories.json';
import { generateBookmarkName } from './bookmarkUtils';

// ─── Namespace URIs ───────────────────────────────────────────────────────────

export const PLANBESKRIVNING_NS =
  'http://namespace.lantmateriet.se/distribution/geodatakatalog/planbeskrivning/v2';
const LMG_NS = 'http://namespace.lantmateriet.se/distribution/geometri/v2';
const GML_NS = 'http://www.opengis.net/gml/3.2';
const GML_SRS_NAME = 'urn:ogc:def:crs:EPSG::3006';
const TARGET_CRS = 'EPSG:3006';

// ─── PLANB-005 validation regex ───────────────────────────────────────────────

const IDENTITET_RE = /^[A-Za-zÅÄÖåäö][A-Za-zÅÄÖåäö0-9_]{0,39}$/;

/**
 * Validate a single identitet string against the PLANB-005 pattern.
 * Exported for use in unit tests and UI validation.
 */
export function validateIdentitet(s: string): boolean {
  return IDENTITET_RE.test(s);
}

// ─── Register CRS definitions (SWEREF 99 family) ─────────────────────────────

const TM_BASE =
  '+k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

// Guard against double-registration in hot-module-reload environments.
// proj4.defs(code) returns undefined (not throws) for unknown codes in
// most proj4 builds, so we check the return value instead of catching.
function safeDefine(code: string, def: string) {
  if (!proj4.defs(code)) {
    proj4.defs(code, def);
  }
}

safeDefine('EPSG:3006', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
safeDefine('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
safeDefine('EPSG:3007', `+proj=tmerc +lat_0=0 +lon_0=12 ${TM_BASE}`);
safeDefine('EPSG:3008', `+proj=tmerc +lat_0=0 +lon_0=13.5 ${TM_BASE}`);
safeDefine('EPSG:3009', `+proj=tmerc +lat_0=0 +lon_0=15 ${TM_BASE}`);
safeDefine('EPSG:3010', `+proj=tmerc +lat_0=0 +lon_0=16.5 ${TM_BASE}`);
safeDefine('EPSG:3011', `+proj=tmerc +lat_0=0 +lon_0=18 ${TM_BASE}`);
safeDefine('EPSG:3012', `+proj=tmerc +lat_0=0 +lon_0=14.25 ${TM_BASE}`);
safeDefine('EPSG:3013', `+proj=tmerc +lat_0=0 +lon_0=15.75 ${TM_BASE}`);
safeDefine('EPSG:3014', `+proj=tmerc +lat_0=0 +lon_0=17.25 ${TM_BASE}`);
safeDefine('EPSG:3015', `+proj=tmerc +lat_0=0 +lon_0=18.75 ${TM_BASE}`);
safeDefine('EPSG:3016', `+proj=tmerc +lat_0=0 +lon_0=20.25 ${TM_BASE}`);
safeDefine('EPSG:3017', `+proj=tmerc +lat_0=0 +lon_0=21.75 ${TM_BASE}`);
safeDefine('EPSG:3018', `+proj=tmerc +lat_0=0 +lon_0=23.25 ${TM_BASE}`);

// ─── Category map (built once) ────────────────────────────────────────────────

const _allCategories = flattenCategories(
  (rawCategories as unknown as { teman: Tema[] }).teman
);
const CATEGORY_MAP = new Map<string, Category>(_allCategories.map((c) => [c.id, c]));

// ─── Validation types ─────────────────────────────────────────────────────────

export type PlanbRule =
  | 'PLANB-001'
  | 'PLANB-002'
  | 'PLANB-003'
  | 'PLANB-004'
  | 'PLANB-005'
  | 'PLANB-006'
  | 'PLANB-007'
  | 'PLANB-008';

export interface PlanbeskrivningValidationError {
  rule: PlanbRule;
  message: string;
  tagUuid?: string;
}

export interface PlanbeskrivningValidationWarning {
  message: string;
  tagUuid?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: PlanbeskrivningValidationError[];
  warnings: PlanbeskrivningValidationWarning[];
}

export function formatPlanbeskrivningValidationErrors(
  errors: PlanbeskrivningValidationError[],
  tags: Tag[]
): string {
  const tagByUuid = new Map(tags.map((t) => [t.uuid, t]));
  return errors
    .map((e, idx) => {
      const tag = e.tagUuid ? tagByUuid.get(e.tagUuid) : undefined;
      const shortUuid = e.tagUuid ? e.tagUuid.slice(0, 8) : 'okänd';
      const preview =
        tag?.text
          ?.replace(/\s+/g, ' ')
          .trim()
          .slice(0, 60) ?? '';
      const clippedPreview =
        preview.length === 60 ? `${preview}...` : preview;
      const para =
        tag?.paragraphIndex !== undefined ? `, stycke ${tag.paragraphIndex + 1}` : '';

      const humanRule =
        e.rule === 'PLANB-004'
          ? 'Indelning (tema/grupp/undergrupp) måste vara giltig enligt BFS 2020:8.'
          : e.rule === 'PLANB-007'
            ? 'Objektreferens måste vara en beständig identifierare.'
            : e.message;

      const tagInfo = tag
        ? `Tagg ${shortUuid}${para}${clippedPreview ? `, text: "${clippedPreview}"` : ''}`
        : `Tagg ${shortUuid}`;

      return `${idx + 1}. [${e.rule}] ${tagInfo}\n   ${humanRule}`;
    })
    .join('\n');
}

export interface SpecExportEligibility {
  eligible: boolean;
  reason?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** XML-escape a string value */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getSpecExportEligibility(tag: Tag): SpecExportEligibility {
  const targetType = tag.targetType ?? 'text';
  if (targetType !== 'text') {
    return {
      eligible: false,
      reason: `targetType "${targetType}" exporteras inte som <Omfattning>; taggen behålls endast i appens metadata.`,
    };
  }

  const category = CATEGORY_MAP.get(tag.categoryId);
  if (!category) {
    return {
      eligible: false,
      reason: `category "${tag.categoryId}" saknar BFS 2020:8-mappning och exporteras därför inte som <Omfattning>.`,
    };
  }

  return { eligible: true };
}

/** Indent a multi-line string by N spaces */
function indent(xml: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return xml
    .split('\n')
    .map((line) => (line.trim() ? pad + line : line))
    .join('\n');
}

/**
 * Reproject a single [x, y] pair from `fromCrs` to EPSG:3006.
 * Returns [northing, easting] — GML posList order is northing easting for
 * projected CRS when using axis-order from the EPSG registry.
 * However, Lantmäteriet examples use easting northing (EN) order, so we
 * return [easting, northing] i.e. [x, y] in SWEREF99 TM.
 */
function reprojectToSweref99TM(xy: number[], fromCrs: string): [number, number] {
  if (fromCrs === TARGET_CRS) return [xy[0], xy[1]];
  if (!proj4.defs(fromCrs)) {
    throw new Error(`Unsupported CRS "${fromCrs}" for Planbeskrivning export.`);
  }
  const [e, n] = proj4(fromCrs, TARGET_CRS, [xy[0], xy[1]]);
  if (!Number.isFinite(e) || !Number.isFinite(n)) {
    throw new Error(`Invalid reprojected coordinate from "${fromCrs}" to "${TARGET_CRS}".`);
  }
  return [e, n];
}

/** Build a space-separated GML posList from an array of [x,y] pairs */
function buildPosList(coords: number[][], fromCrs: string): string {
  return coords
    .map((pt) => {
      const [e, n] = reprojectToSweref99TM(pt, fromCrs);
      // GML posList in SWEREF99 TM: northing easting (as per ISO 19111)
      return `${n.toFixed(3)} ${e.toFixed(3)}`;
    })
    .join(' ');
}

// ─── GML geometry serializers ─────────────────────────────────────────────────

function buildGmlPoint(coords: number[], crs: string): string {
  const [e, n] = reprojectToSweref99TM(coords, crs);
  return [
    `<lmg:Punkt xmlns:lmg="${LMG_NS}" xmlns:gml="${GML_NS}">`,
    `  <gml:Point srsName="${GML_SRS_NAME}">`,
    `    <gml:pos>${n.toFixed(3)} ${e.toFixed(3)}</gml:pos>`,
    `  </gml:Point>`,
    `</lmg:Punkt>`,
  ].join('\n');
}

function buildGmlLineString(coords: number[][], crs: string): string {
  return [
    `<lmg:Linje xmlns:lmg="${LMG_NS}" xmlns:gml="${GML_NS}">`,
    `  <gml:LineString srsName="${GML_SRS_NAME}">`,
    `    <gml:posList>${buildPosList(coords, crs)}</gml:posList>`,
    `  </gml:LineString>`,
    `</lmg:Linje>`,
  ].join('\n');
}

function buildGmlPolygon(rings: number[][][], crs: string): string {
  const [exterior, ...interiorRings] = rings;
  const exteriorXml = [
    `      <gml:exterior>`,
    `        <gml:LinearRing>`,
    `          <gml:posList>${buildPosList(exterior, crs)}</gml:posList>`,
    `        </gml:LinearRing>`,
    `      </gml:exterior>`,
  ].join('\n');

  const interiorXml = interiorRings
    .map((ring) =>
      [
        `      <gml:interior>`,
        `        <gml:LinearRing>`,
        `          <gml:posList>${buildPosList(ring, crs)}</gml:posList>`,
        `        </gml:LinearRing>`,
        `      </gml:interior>`,
      ].join('\n')
    )
    .join('\n');

  return [
    `<lmg:Yta xmlns:lmg="${LMG_NS}" xmlns:gml="${GML_NS}">`,
    `    <gml:Polygon srsName="${GML_SRS_NAME}">`,
    exteriorXml,
    interiorXml,
    `    </gml:Polygon>`,
    `</lmg:Yta>`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Serialize a Geometry to a GML element string.
 * Returns null if the geometry type/coordinates are not representable.
 */
function serializeGml(geo: Geometry): string | null {
  const crs = geo.crs ?? 'EPSG:4326';
  try {
    switch (geo.type) {
      case 'point': {
        const pts = geo.coordinates as number[];
        if (!Array.isArray(pts) || pts.length < 2) return null;
        return buildGmlPoint(pts, crs);
      }
      case 'line': {
        const lines = geo.coordinates as number[][];
        if (!Array.isArray(lines) || lines.length === 0) return null;
        return buildGmlLineString(lines, crs);
      }
      case 'polygon': {
        const polys = geo.coordinates as number[][][];
        if (!Array.isArray(polys) || polys.length === 0) return null;
        return buildGmlPolygon(polys, crs);
      }
    }
  } catch {
    return null;
  }
  return null;
}

// ─── Feature type classification ─────────────────────────────────────────────

/**
 * True when the feature type indicates a plan bestämmelse — these have a
 * meaningful UUID that can be used as <planbestammelsereferens>.
 */
function isBestammelseFeature(featureType?: string): boolean {
  if (!featureType) return false;
  const t = featureType.toLowerCase();
  return t.includes('bestämmelse') || t.includes('bestammelse');
}

/**
 * True when the feature type is the root detaljplan object.
 */
function isDetaljplanFeature(featureType?: string): boolean {
  return (featureType ?? '').toLowerCase() === 'detaljplan';
}

function isSerializableDocxGmlGeometry(geo: Geometry): boolean {
  return geo.source === 'docx_gml' && serializeGml(geo) !== null;
}

function hasJsonGeometryLoaded(geometries: Geometry[]): boolean {
  return geometries.some((geo) => geo.source === 'json');
}

function isImportedPlanomradeFallbackAllowed(
  tag: Tag,
  allProjectGeometries: Geometry[]
): boolean {
  return (
    tag.planbeskrivningImportedPlanomrade === true &&
    !hasJsonGeometryLoaded(allProjectGeometries)
  );
}

function getBaseIdentitet(identitet: string): string {
  return identitet.replace(/_g\d+$/i, '');
}

function getTagUuidSuffix(tag: Tag): string {
  return tag.uuid.replace(/-/g, '').slice(0, 8).toLowerCase();
}

function matchesTagIdentitet(
  tagBaseIdentitet: string,
  tagUuidSuffix: string,
  geometryIdentitet: string
): boolean {
  const ident = geometryIdentitet.toLowerCase();
  const base = tagBaseIdentitet.toLowerCase();
  if (ident === base) return true;

  const stripped = getBaseIdentitet(ident);
  if (ident !== stripped && (base.startsWith(stripped) || stripped.startsWith(base))) {
    return true;
  }

  const tokens = stripped.split('_').filter(Boolean);
  const lastToken = tokens[tokens.length - 1] ?? '';
  return !!lastToken && (tagUuidSuffix.startsWith(lastToken) || lastToken.startsWith(tagUuidSuffix));
}

function isMatchingImportedDocxGmlGeometryForTag(tag: Tag, geo: Geometry): boolean {
  if (!isSerializableDocxGmlGeometry(geo)) return false;
  const identitet =
    typeof geo.properties?.['identitet'] === 'string'
      ? (geo.properties['identitet'] as string)
      : '';
  if (!identitet) return false;

  return matchesTagIdentitet(generateBookmarkName(tag), getTagUuidSuffix(tag), identitet);
}

function getDocxOnlyMatchedGmlGeometries(tag: Tag, allProjectGeometries: Geometry[]): Geometry[] {
  if (hasJsonGeometryLoaded(allProjectGeometries)) return [];
  return allProjectGeometries.filter((geo) => isMatchingImportedDocxGmlGeometryForTag(tag, geo));
}

function mergeUniqueGeometries(primary: Geometry[], secondary: Geometry[]): Geometry[] {
  const seen = new Set(primary.map((geo) => geo.uuid));
  const merged = [...primary];
  for (const geo of secondary) {
    if (seen.has(geo.uuid)) continue;
    seen.add(geo.uuid);
    merged.push(geo);
  }
  return merged;
}

// ─── <Lage> builder ───────────────────────────────────────────────────────────

interface LageResult {
  xml: string;
  /** Which PLANB rules were violated for this lage (if any) */
  violations: PlanbeskrivningValidationError[];
}

/**
 * Build a `<Lage>` element for a single geometry (or null if none linked).
 *
 * @param tag                The tag being exported (used for error messages).
 * @param geo                The specific geometry for this `<Omfattning>` block,
 *                           or `null` when no geometries are linked at all.
 * @param allLinkedGeometries All geometries linked to the tag — used to locate a
 *                           `planbestammelsereferens` for PLANB-002 regardless of
 *                           which geometry is in the current block.
 * @param category           Resolved category for PLANB-002 check.
 */
function buildLage(
  tag: Tag,
  geo: Geometry | null,
  allLinkedGeometries: Geometry[],
  category: Category
): LageResult {
  const violations: PlanbeskrivningValidationError[] = [];
  const isMotivTillReglering =
    category.gruppName.toLowerCase() === 'motiv till reglering';

  // GML for the specific geometry of this block (may be null)
  const gmlXml = geo ? serializeGml(geo) : null;

  // Bestämmelse / detaljplan lookups span ALL linked geometries (for reference UUIDs)
  const bestammelseGeo = allLinkedGeometries.find((g) =>
    isBestammelseFeature(g.featureType)
  );
  const detaljplanGeo = allLinkedGeometries.find((g) =>
    isDetaljplanFeature(g.featureType)
  );

  let lageContent = '';

  if (isMotivTillReglering) {
    // PLANB-002: Must have planbestammelsereferens
    if (!bestammelseGeo) {
      // Imported DOCX GML is read-only: the original planbestämmelse reference may
      // no longer be available, but the embedded GML location is still a valid
      // direct <geometri> representation for <Lage>.
      if (geo && isSerializableDocxGmlGeometry(geo) && gmlXml) {
        lageContent = indent(gmlXml, 8);
      } else {
        violations.push({
          rule: 'PLANB-002',
          message: `Tag ${tag.uuid}: grupp "Motiv till reglering" requires a planbestammelsereferens, but no bestämmelse geometry is linked.`,
          tagUuid: tag.uuid,
        });
        // Best-effort fallback: include GML if available
        if (gmlXml) {
          lageContent = indent(gmlXml, 8);
        } else {
          lageContent = '        <planomrade>Ja</planomrade>';
        }
      }
    } else {
      // PLANB-002 satisfied.
      // PLANB-006: GML geometry (if present) takes precedence over indirect refs.
      // PLANB-008: planbestammelsereferens is the only indirect ref allowed.
      if (gmlXml) {
        lageContent = indent(gmlXml, 8) + '\n';
      }
      lageContent += `        <planbestammelsereferens>${esc(bestammelseGeo.uuid)}</planbestammelsereferens>`;
    }
  } else {
    // Normal case — prefer direct GML geometry (PLANB-006), fall back to reference.
    if (gmlXml) {
      lageContent = indent(gmlXml, 8);
    } else if (geo !== null) {
      // Geometry linked but GML serialisation failed — use a typed fallback reference.
      if (isBestammelseFeature(geo.featureType)) {
        lageContent = `        <planbestammelsereferens>${esc(geo.uuid)}</planbestammelsereferens>`;
      } else if (isDetaljplanFeature(geo.featureType)) {
        lageContent = `        <planomrade>Ja</planomrade>`;
      } else {
        lageContent = `        <objektreferens>${esc(geo.uuid)}</objektreferens>`;
      }
    } else if (bestammelseGeo) {
      // No geometry for this block but there is a bestämmelse reference available
      lageContent = `        <planbestammelsereferens>${esc(bestammelseGeo.uuid)}</planbestammelsereferens>`;
    } else if (detaljplanGeo) {
      lageContent = `        <planomrade>Ja</planomrade>`;
    } else {
      // No geometry linked at all → PLANB-001 fallback
      lageContent = `        <planomrade>Ja</planomrade>`;
    }
  }

  const xml = `      <Lage>\n${lageContent}\n      </Lage>`;
  return { xml, violations };
}

// ─── <Indelning> builder ──────────────────────────────────────────────────────

function buildIndelning(category: Category): string {
  const tema = category.temaName.toLowerCase();
  const grupp = category.gruppName.toLowerCase();
  const undergrupp = category.undergruppName?.toLowerCase();

  const undergruppXml = undergrupp
    ? `\n        <undergrupp>${esc(undergrupp)}</undergrupp>`
    : '';

  return [
    `      <Indelning>`,
    `        <tema>${esc(tema)}</tema>`,
    `        <grupp>${esc(grupp)}</grupp>${undergruppXml}`,
    `      </Indelning>`,
  ].join('\n');
}

// ─── <Omfattning> builder ─────────────────────────────────────────────────────

interface OmfattningResult {
  xml: string;
  identitet: string;
  violations: PlanbeskrivningValidationError[];
}

/**
 * Derive an identitet for the N-th geometry of a multi-geometry tag (N ≥ 2).
 * Appends `_gN` to the base identitet, truncating the base if needed to stay
 * within the 40-character PLANB-005 limit.
 */
function deriveGeoIdentitet(baseIdentitet: string, geoIndex: number): string {
  const suffix = `_g${geoIndex}`;
  const base = baseIdentitet.slice(0, 40 - suffix.length);
  return base + suffix;
}

/**
 * Build one or more `<Omfattning>` blocks for a single tag.
 *
 * When a tag has multiple linked geometries every geometry gets its own
 * `<Omfattning>` so that all spatial extents are preserved in the output.
 * The first block uses the bookmark name as-is; additional blocks receive a
 * derived identitet (`<base>_g2`, `<base>_g3`, …) that still passes PLANB-005.
 */
function buildOmfattningBlocks(
  tag: Tag,
  geometryMap: Map<string, Geometry>,
  allProjectGeometries: Geometry[]
): OmfattningResult[] {
  const category = CATEGORY_MAP.get(tag.categoryId);

  // Fallback category if not found
  const resolvedCategory: Category = category ?? {
    id: tag.categoryId,
    name: tag.categoryId,
    level: 'grupp',
    color: '#999',
    temaId: 'okänd',
    temaName: 'okänd',
    gruppId: 'okänd',
    gruppName: 'okänd',
  };

  // ── identitet (PLANB-005) ────────────────────────────────────────────────
  const rawIdentitet = generateBookmarkName(tag);
  let baseIdentitet = rawIdentitet;
  const identitetViolations: PlanbeskrivningValidationError[] = [];

  if (!IDENTITET_RE.test(baseIdentitet)) {
    // Sanitize: keep only allowed chars, ensure starts with letter
    let sanitized = baseIdentitet
      .replace(/[^A-Za-zÅÄÖåäö0-9_]/g, '_')
      .replace(/^[^A-Za-zÅÄÖåäö]+/, '')
      .slice(0, 40);
    if (!sanitized || !/^[A-Za-zÅÄÖåäö]/.test(sanitized)) {
      sanitized = 'Tag_' + sanitized.slice(0, 36);
    }
    identitetViolations.push({
      rule: 'PLANB-005',
      message: `Tag ${tag.uuid}: bookmark name "${rawIdentitet}" does not match PLANB-005 pattern. Using sanitized: "${sanitized}".`,
      tagUuid: tag.uuid,
    });
    baseIdentitet = sanitized;
  }

  // ── Linked geometries ────────────────────────────────────────────────────
  const explicitLinkedGeometries: Geometry[] = (tag.geometryIds ?? [])
    .map((id) => geometryMap.get(id))
    .filter((g): g is Geometry => g !== undefined);
  const linkedGeometries = mergeUniqueGeometries(
    explicitLinkedGeometries,
    getDocxOnlyMatchedGmlGeometries(tag, allProjectGeometries)
  );

  const indelningXml = buildIndelning(resolvedCategory);

  // Helper: build a single <Omfattning> for one geometry (or null = no geos)
  const buildOne = (identitet: string, geo: Geometry | null): OmfattningResult => {
    const violations: PlanbeskrivningValidationError[] = [...identitetViolations];
    const { xml: lageXml, violations: lageViolations } = buildLage(
      tag,
      geo,
      linkedGeometries,
      resolvedCategory
    );
    if (
      lageViolations.some((violation) => violation.rule === 'PLANB-002') &&
      isImportedPlanomradeFallbackAllowed(tag, allProjectGeometries)
    ) {
      return {
        xml: [
          `    <Omfattning>`,
          `      <identitet>${esc(identitet)}</identitet>`,
          `      <Lage>`,
          `        <planomrade>Ja</planomrade>`,
          `      </Lage>`,
          indelningXml,
          `    </Omfattning>`,
        ].join('\n'),
        identitet,
        violations: violations.filter((violation) => violation.rule !== 'PLANB-002'),
      };
    }
    violations.push(...lageViolations);

    const xml = [
      `    <Omfattning>`,
      `      <identitet>${esc(identitet)}</identitet>`,
      lageXml,
      indelningXml,
      `    </Omfattning>`,
    ].join('\n');

    return { xml, identitet, violations };
  };

  // ── One block per geometry; fallback to single planomrade block if none ──
  if (linkedGeometries.length === 0) {
    return [buildOne(baseIdentitet, null)];
  }

  return linkedGeometries.map((geo, idx) => {
    const identitet =
      idx === 0 ? baseIdentitet : deriveGeoIdentitet(baseIdentitet, idx + 1);
    return buildOne(identitet, geo);
  });
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isUriLike(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/.test(value);
}

function hasPersistentIdentifier(value: string): boolean {
  return isUuidLike(value) || isUriLike(value);
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate that all PLANB rules are satisfied before building.
 * Returns a summary; errors do NOT prevent generation (we best-effort output).
 */
export function validatePlanbeskrivning(
  tags: Tag[],
  geometries: Geometry[]
): ValidationResult {
  const errors: PlanbeskrivningValidationError[] = [];
  const warnings: PlanbeskrivningValidationWarning[] = [];

  const geometryMap = new Map(geometries.map((g) => [g.uuid, g]));
  const seenIdentiteter = new Set<string>();

  for (const tag of tags) {
    const eligibility = getSpecExportEligibility(tag);
    if (!eligibility.eligible) {
      warnings.push({
        message: `Tag ${tag.uuid}: exkluderad från Planbeskrivning-export. ${eligibility.reason ?? 'Okänd anledning.'}`,
        tagUuid: tag.uuid,
      });
      continue;
    }

    const identitet = generateBookmarkName(tag);
    const identitetKey = identitet.toLowerCase();
    const category = CATEGORY_MAP.get(tag.categoryId);

    // PLANB-005
    if (!IDENTITET_RE.test(identitet)) {
      errors.push({
        rule: 'PLANB-005',
        message: `Tag ${tag.uuid}: identitet "${identitet}" fails PLANB-005 pattern.`,
        tagUuid: tag.uuid,
      });
    }

    // PLANB-003
    if (seenIdentiteter.has(identitetKey)) {
      errors.push({
        rule: 'PLANB-003',
        message: `Duplicate identitet "${identitet}" for tag ${tag.uuid}.`,
        tagUuid: tag.uuid,
      });
    }
    seenIdentiteter.add(identitetKey);

    // PLANB-004
    if (!category) {
      errors.push({
        rule: 'PLANB-004',
        message: `Tag ${tag.uuid}: category "${tag.categoryId}" is not part of the BFS 2020:8 mapping used for export.`,
        tagUuid: tag.uuid,
      });
    }

    const isMotivTillReglering =
      (category?.gruppName ?? '').toLowerCase() === 'motiv till reglering';

    const explicitLinkedGeos: Geometry[] = (tag.geometryIds ?? [])
      .map((id) => geometryMap.get(id))
      .filter((g): g is Geometry => g !== undefined);
    const linkedGeos = mergeUniqueGeometries(
      explicitLinkedGeos,
      getDocxOnlyMatchedGmlGeometries(tag, geometries)
    );

    // PLANB-001
    if (linkedGeos.length === 0) {
      warnings.push({
        message: `Tag ${tag.uuid}: no geometry linked — will use <planomrade>Ja</planomrade> as fallback.`,
        tagUuid: tag.uuid,
      });
    }

    // PLANB-002
    if (isMotivTillReglering) {
      const hasBestammelse = linkedGeos.some((g) =>
        isBestammelseFeature(g.featureType)
      );
      const hasDocxGmlDirectGeometry = linkedGeos.some(isSerializableDocxGmlGeometry);
      if (!hasBestammelse && !hasDocxGmlDirectGeometry) {
        if (isImportedPlanomradeFallbackAllowed(tag, geometries)) {
          warnings.push({
            message: `Tag ${tag.uuid}: no geometry linked — will use <planomrade>Ja</planomrade> as fallback from imported DOCX Planbeskrivning XML.`,
            tagUuid: tag.uuid,
          });
        } else {
          errors.push({
            rule: 'PLANB-002',
            message: `Tag ${tag.uuid}: grupp "Motiv till reglering" requires a linked bestämmelse geometry for <planbestammelsereferens>.`,
            tagUuid: tag.uuid,
          });
        }
      } else if (!hasBestammelse && hasDocxGmlDirectGeometry && explicitLinkedGeos.length === 0) {
        warnings.push({
          message: `Tag ${tag.uuid}: imported DOCX GML geometry is used as read-only fallback because no JSON geometry is loaded.`,
          tagUuid: tag.uuid,
        });
      }
    }

    // PLANB-007
    for (const geo of linkedGeos) {
      const serializable = serializeGml(geo) !== null;
      if (serializable) continue;
      if (isBestammelseFeature(geo.featureType) || isDetaljplanFeature(geo.featureType)) {
        continue;
      }
      if (!hasPersistentIdentifier(geo.uuid) || !geo.sourceDocId) {
        errors.push({
          rule: 'PLANB-007',
          message:
            `Tag ${tag.uuid}: geometry "${geo.uuid}" would be exported as <objektreferens>, ` +
            'but lacks a verifiable persistent identifier/provenance (expected UUID/URI + sourceDocId).',
          tagUuid: tag.uuid,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Build the complete Planbeskrivning v2.0 XML string.
 *
 * @param config     Header metadata (objektidentitet, version, etc.)
 * @param tags       All tags to export
 * @param geometries All geometries in the project (for coordinate lookup)
 * @returns          A UTF-8 XML string ready to write to customXml/item{N}.xml
 */
export function buildPlanbeskrivningXml(
  config: PlanbeskrivningConfig,
  tags: Tag[],
  geometries: Geometry[]
): string {
  const geometryMap = new Map(geometries.map((g) => [g.uuid, g]));

  // Export only tags that are eligible for the spec-facing Planbeskrivning XML.
  const exportableTags = tags.filter((t) => getSpecExportEligibility(t).eligible);

  // PLANB-003: track identiteter case-insensitively; suffix duplicates
  const usedIdentiteterLower = new Set<string>();

  const omfattningBlocks: string[] = [];

  for (const tag of exportableTags) {
    // Each tag may produce multiple blocks (one per linked geometry).
    const blocks = buildOmfattningBlocks(tag, geometryMap, geometries);

    for (const { xml, identitet } of blocks) {
      // PLANB-003: ensure uniqueness by appending _2, _3, … for duplicates
      let finalIdentitet = identitet;
      if (usedIdentiteterLower.has(finalIdentitet.toLowerCase())) {
        let n = 2;
        do {
          const suffix = `_${n}`;
          const base = identitet.slice(0, 40 - suffix.length);
          finalIdentitet = base + suffix;
          n++;
        } while (usedIdentiteterLower.has(finalIdentitet.toLowerCase()));
      }
      usedIdentiteterLower.add(finalIdentitet.toLowerCase());

      if (finalIdentitet !== identitet) {
        // Patch the identitet in the block
        omfattningBlocks.push(
          xml.replace(
            `<identitet>${esc(identitet)}</identitet>`,
            `<identitet>${esc(finalIdentitet)}</identitet>`
          )
        );
      } else {
        omfattningBlocks.push(xml);
      }
    }
  }

  const header = [
    `  <objektidentitet>${esc(config.objektidentitet)}</objektidentitet>`,
    `  <objektversion>${config.objektversion}</objektversion>`,
    `  <versionGiltigFran>${esc(config.versionGiltigFran)}</versionGiltigFran>`,
    `  <detaljplansreferens>${esc(config.detaljplansreferens)}</detaljplansreferens>`,
    `  <Objektmetadata>`,
    `    <programvara>${esc(config.programvara)}</programvara>`,
    `    <programvaruversion>${esc(config.programvaruversion)}</programvaruversion>`,
    `  </Objektmetadata>`,
    `  <arkividentitetKommun>${esc(config.arkividentitetKommun)}</arkividentitetKommun>`,
  ].join('\n');

  const body = omfattningBlocks.join('\n\n');

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Planbeskrivning xmlns="${PLANBESKRIVNING_NS}"`,
    `                 xmlns:lmg="${LMG_NS}"`,
    `                 xmlns:gml="${GML_NS}">`,
    header,
    body ? '' : undefined, // blank line before bodies if any
    body,
    `</Planbeskrivning>`,
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

/**
 * Build default PlanbeskrivningConfig, optionally pre-filled from context.
 */
export function buildDefaultConfig(
  detaljplansreferens?: string
): PlanbeskrivningConfig {
  const now = new Date().toISOString().replace('Z', '+00:00');
  // Generate a basic UUID-like identifier using crypto if available
  const newUuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `00000000-0000-0000-0000-${Date.now().toString(16).padStart(12, '0')}`;

  return {
    objektidentitet: newUuid,
    objektversion: 1,
    versionGiltigFran: now,
    detaljplansreferens: detaljplansreferens ?? '',
    programvara: 'PB Tagger',
    programvaruversion: '0.0.1',
    arkividentitetKommun: '',
  };
}
