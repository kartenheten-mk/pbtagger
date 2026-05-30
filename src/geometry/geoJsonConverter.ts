/**
 * geoJsonConverter.ts
 *
 * Converts internal Geometry[] objects into a standard GeoJSON FeatureCollection
 * suitable for OpenLayers, reprojecting coordinates from the source CRS
 * (e.g. EPSG:3009) to EPSG:4326 (WGS84 lon/lat) as needed.
 *
 * Also provides the inverse: reconstructing the original dp225-format JSON
 * from the stored raw document (for export). Since we store the raw JSON
 * verbatim, export is simply returning it — no reconstruction needed.
 */

import proj4, { type Converter } from 'proj4';
import type { Geometry, GeometryDoc, Tag, Tema } from '../types';
import { flattenCategories } from '../data/categoryUtils';
import rawCategories from '../data/categories.json';

// ─── proj4 CRS definitions ────────────────────────────────────────────────────
// Register all Swedish SWEREF 99 local zones that might appear in detaljplan JSON.

/**
 * Swedish SWEREF 99 coordinate reference systems used in Swedish municipal planning.
 *
 * Correct EPSG → central meridian mapping:
 *   EPSG:3006  SWEREF 99 TM    national (UTM zone 33, CM ≈15°)
 *   EPSG:3007  SWEREF 99 12 00 lon_0=12
 *   EPSG:3008  SWEREF 99 13 30 lon_0=13.5
 *   EPSG:3009  SWEREF 99 15 00 lon_0=15  ← dp225.json (Mora)
 *   EPSG:3010  SWEREF 99 16 30 lon_0=16.5
 *   EPSG:3011  SWEREF 99 18 00 lon_0=18
 *   EPSG:3012  SWEREF 99 14 15 lon_0=14.25
 *   EPSG:3013  SWEREF 99 15 45 lon_0=15.75
 *   EPSG:3014  SWEREF 99 17 15 lon_0=17.25
 *   EPSG:3015  SWEREF 99 18 45 lon_0=18.75
 *   EPSG:3016  SWEREF 99 20 15 lon_0=20.25
 *   EPSG:3017  SWEREF 99 21 45 lon_0=21.75
 *   EPSG:3018  SWEREF 99 23 15 lon_0=23.25
 */
const TM_BASE =
  '+k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

proj4.defs([
  // ── National ──────────────────────────────────────────────────────────────
  ['EPSG:3006', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'],

  // ── Local zones ───────────────────────────────────────────────────────────
  ['EPSG:3007', `+proj=tmerc +lat_0=0 +lon_0=12 ${TM_BASE}`],
  ['EPSG:3008', `+proj=tmerc +lat_0=0 +lon_0=13.5 ${TM_BASE}`],
  ['EPSG:3009', `+proj=tmerc +lat_0=0 +lon_0=15 ${TM_BASE}`],     // SWEREF 99 15 00 — Mora
  ['EPSG:3010', `+proj=tmerc +lat_0=0 +lon_0=16.5 ${TM_BASE}`],
  ['EPSG:3011', `+proj=tmerc +lat_0=0 +lon_0=18 ${TM_BASE}`],
  ['EPSG:3012', `+proj=tmerc +lat_0=0 +lon_0=14.25 ${TM_BASE}`],
  ['EPSG:3013', `+proj=tmerc +lat_0=0 +lon_0=15.75 ${TM_BASE}`],
  ['EPSG:3014', `+proj=tmerc +lat_0=0 +lon_0=17.25 ${TM_BASE}`],
  ['EPSG:3015', `+proj=tmerc +lat_0=0 +lon_0=18.75 ${TM_BASE}`],
  ['EPSG:3016', `+proj=tmerc +lat_0=0 +lon_0=20.25 ${TM_BASE}`],
  ['EPSG:3017', `+proj=tmerc +lat_0=0 +lon_0=21.75 ${TM_BASE}`],
  ['EPSG:3018', `+proj=tmerc +lat_0=0 +lon_0=23.25 ${TM_BASE}`],
]);

// ─── Coordinate reprojection ──────────────────────────────────────────────────

const converterCache = new Map<string, Converter>();

function getConverter(fromCrs: string): Converter {
  const cached = converterCache.get(fromCrs);
  if (cached) return cached;
  const converter = proj4(fromCrs, 'EPSG:4326');
  converterCache.set(fromCrs, converter);
  return converter;
}

/**
 * Reprojects a single [x, y] coordinate pair from `fromCrs` to EPSG:4326.
 * Returns [longitude, latitude].
 */
function reprojectPoint(xy: number[], fromCrs: string): [number, number] {
  if (fromCrs === 'EPSG:4326') return [xy[0], xy[1]];
  const [lon, lat] = getConverter(fromCrs).forward([xy[0], xy[1]]);
  return [lon, lat];
}

function reprojectLine(coords: number[][], fromCrs: string): [number, number][] {
  return coords.map((pt) => reprojectPoint(pt, fromCrs));
}

function reprojectRings(
  rings: number[][][],
  fromCrs: string
): [number, number][][] {
  return rings.map((ring) => reprojectLine(ring, fromCrs));
}

// ─── GeoJSON feature builder ──────────────────────────────────────────────────

interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

interface GeoJsonFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJsonGeometry | null;
  properties: Record<string, unknown>;
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

type JsonObject = Record<string, unknown>;

const MOTIV_CATEGORY_IDS = new Set(
  flattenCategories((rawCategories as unknown as { teman: Tema[] }).teman)
    .filter((category) => category.gruppName.toLowerCase() === 'motiv till reglering')
    .map((category) => category.id)
);

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMotivTag(tag: Tag): boolean {
  return MOTIV_CATEGORY_IDS.has(tag.categoryId);
}

function isBestammelseFeatureType(featureType?: string): boolean {
  if (!featureType) return false;
  const t = featureType.toLowerCase();
  return t.includes('bestämmelse') || t.includes('bestammelse');
}

function cloneJsonObject(rawJson: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(rawJson)) as JsonObject;
}

function getFeatureArray(rawJson: JsonObject): JsonObject[] {
  if (rawJson['type'] !== 'FeatureCollection') {
    throw new Error('Geometriexport med motiv kräver en detaljplan-JSON med type "FeatureCollection".');
  }

  const features = rawJson['features'];
  if (!Array.isArray(features)) {
    throw new Error('Geometriexport med motiv kräver en detaljplan-JSON där "features" är en array.');
  }

  return features.filter((feature): feature is JsonObject => isJsonObject(feature));
}

function buildFeatureById(features: JsonObject[]): Map<string, JsonObject> {
  const featureById = new Map<string, JsonObject>();

  for (const feature of features) {
    const id = feature['id'];
    if (typeof id === 'string' && id.length > 0) {
      featureById.set(id, feature);
    }
  }

  return featureById;
}

function buildGeoJsonGeometry(
  geo: Geometry
): GeoJsonGeometry | null {
  const crs = geo.crs ?? 'EPSG:4326';

  switch (geo.type) {
    case 'point': {
      const coords = geo.coordinates as number[];
      return {
        type: 'Point',
        coordinates: reprojectPoint(coords, crs),
      };
    }
    case 'line': {
      const coords = geo.coordinates as number[][];
      return {
        type: 'LineString',
        coordinates: reprojectLine(coords, crs),
      };
    }
    case 'polygon': {
      const coords = geo.coordinates as number[][][];
      return {
        type: 'Polygon',
        coordinates: reprojectRings(coords, crs),
      };
    }
    default:
      return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Converts an array of Geometry objects into a standard GeoJSON FeatureCollection.
 * Coordinates are reprojected to EPSG:4326 (WGS84) for map display.
 */
export function geometriesToGeoJson(
  geometries: Geometry[]
): GeoJsonFeatureCollection {
  const features: GeoJsonFeature[] = geometries
    .map((geo) => {
      const geojsonGeom = buildGeoJsonGeometry(geo);
      return {
        type: 'Feature' as const,
        id: geo.uuid,
        geometry: geojsonGeom,
        properties: {
          uuid: geo.uuid,
          name: geo.name,
          type: geo.type,
          featureType: geo.featureType ?? null,
          sourceDocId: geo.sourceDocId ?? null,
          color: geo.color ?? '#6b7280',
          // Expose a few common display properties from the original JSON
          bestammelseformulering:
            (geo.properties?.['bestammelseformulering'] as string) ?? null,
          kategori: (geo.properties?.['kategori'] as string) ?? null,
        },
      };
    })
    .filter((f) => f.geometry !== null);

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Returns the original dp225-format JSON for export.
 * Since we store the raw JSON verbatim, this is a direct passthrough.
 * The result can be serialised with JSON.stringify() and saved as a .json file.
 */
export function exportGeometryDoc(doc: GeometryDoc): Record<string, unknown> {
  return doc.rawJson;
}

/**
 * Serialises a GeometryDoc back to its original JSON string for file download.
 */
export function exportGeometryDocAsString(doc: GeometryDoc): string {
  return JSON.stringify(doc.rawJson, null, 2);
}

/**
 * Serialises a cloned GeometryDoc JSON after inserting motiv text from linked
 * "Motiv till reglering" tags into matching planbestämmelse features.
 */
export function exportGeometryDocWithMotivAsString(
  doc: GeometryDoc,
  tags: Tag[],
  geometries: Geometry[]
): string {
  const clonedRawJson = cloneJsonObject(doc.rawJson);
  const features = getFeatureArray(clonedRawJson);
  const featureById = buildFeatureById(features);
  const geometryById = new Map(geometries.map((geometry) => [geometry.uuid, geometry]));
  const motivByFeatureId = new Map<string, { motiv: string; tagUuid: string }>();

  for (const tag of tags) {
    if (!isMotivTag(tag)) continue;

    const trimmedMotiv = tag.text.trim();
    if (trimmedMotiv.length === 0) {
      throw new Error(`Motiv-taggen ${tag.uuid} har tom motivtext efter trimning.`);
    }
    const motiv = trimmedMotiv.replace(/"/g, "'");

    const activeLinkedGeometries: Geometry[] = [];
    const seenGeometryIds = new Set<string>();

    for (const geometryId of tag.geometryIds ?? []) {
      if (seenGeometryIds.has(geometryId)) continue;
      seenGeometryIds.add(geometryId);

      const geometry = geometryById.get(geometryId);
      if (!geometry || geometry.sourceDocId !== doc.id) continue;
      activeLinkedGeometries.push(geometry);
    }

    if (activeLinkedGeometries.length === 0) {
      throw new Error(
        `Motiv-taggen ${tag.uuid} saknar länkad planbestämmelse i aktiv detaljplan-JSON.`
      );
    }

    for (const geometry of activeLinkedGeometries) {
      if (!isBestammelseFeatureType(geometry.featureType)) {
        throw new Error(
          `Motiv-taggen ${tag.uuid} är länkad till geometri "${geometry.uuid}" som inte är en planbestämmelse i aktiv detaljplan-JSON.`
        );
      }

      const existing = motivByFeatureId.get(geometry.uuid);
      if (existing && existing.tagUuid !== tag.uuid) {
        throw new Error(
          `Flera motiv-taggar pekar på samma geometri "${geometry.uuid}" (${existing.tagUuid} och ${tag.uuid}).`
        );
      }

      motivByFeatureId.set(geometry.uuid, { motiv, tagUuid: tag.uuid });
    }
  }

  for (const [featureId, { motiv }] of motivByFeatureId) {
    const feature = featureById.get(featureId);
    if (!feature) {
      throw new Error(
        `Motivexporten kunde inte hitta feature "${featureId}" i detaljplan-JSON:ens features[].id.`
      );
    }

    const properties = feature['properties'];
    if (!isJsonObject(properties)) {
      throw new Error(`Feature "${featureId}" saknar ett properties-objekt i detaljplan-JSON.`);
    }

    const featureType = properties['feature:typ'];
    if (typeof featureType !== 'string' || !isBestammelseFeatureType(featureType)) {
      throw new Error(`Feature "${featureId}" är inte en planbestämmelse i detaljplan-JSON.`);
    }

    const existingDescription = properties['planbestammelsebeskrivning'];
    if (existingDescription === undefined) {
      properties['planbestammelsebeskrivning'] = { motiv };
      continue;
    }

    if (!isJsonObject(existingDescription)) {
      throw new Error(
        `Feature "${featureId}" har planbestammelsebeskrivning som inte är ett objekt.`
      );
    }

    existingDescription['motiv'] = motiv;
  }

  return JSON.stringify(clonedRawJson, null, 2);
}
