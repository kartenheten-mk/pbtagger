/**
 * detaljplanParser.ts
 *
 * Parses Swedish "detaljplan" FeatureCollection JSON (dp225 format) into:
 *  1. A GeometryDoc — the raw JSON stored verbatim for lossless export.
 *  2. An array of Geometry objects used by the app store and map.
 *
 * The source format is NOT standard GeoJSON: each feature's top-level
 * `geometry` field is null. The actual geometry is nested inside
 * `properties.plangeometri[].geometri.position`  (for the detaljplan feature)
 * or `properties.bestammelsegeometri[].geometri.position` (for bestämmelser).
 *
 * Coordinates are in EPSG:3009 (SWEREF 99 12 00) and are preserved as-is.
 * Reprojection to the map CRS happens at render time in geoJsonConverter.ts.
 */

import type { Geometry, GeometryDoc, GeometryType } from '../types';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Maps the Swedish geometry type string to our internal GeometryType */
function mapTyp(typ: string): GeometryType {
  switch (typ) {
    case 'yta':
      return 'polygon';
    case 'linje':
      return 'line';
    case 'punkt':
      return 'point';
    default:
      return 'polygon';
  }
}

/** Colour coding by feature:typ for visual distinction on the map */
const FEATURE_TYPE_COLORS: Record<string, string> = {
  detaljplan: '#3b82f6',               // blue  — plan outline
  'användningsbestämmelse': '#10b981', // green — land use
  'egenskapsbestämmelse': '#8b5cf6',   // purple — property rules
};

function colorForFeatureType(featureType: string): string {
  return FEATURE_TYPE_COLORS[featureType] ?? '#6b7280';
}

// ─── Geometry extractor ───────────────────────────────────────────────────────

/**
 * Extracts geometry items from a feature's properties.
 * Returns an array of { coordinates, crs, type } objects.
 */
interface RawGeomEntry {
  coordinates: number[] | number[][] | number[][][];
  crs: string;
  type: GeometryType;
}

function extractGeometries(properties: Record<string, unknown>): RawGeomEntry[] {
  const result: RawGeomEntry[] = [];

  const geomLists = [
    (properties['plangeometri'] ?? []) as unknown[],
    (properties['bestammelsegeometri'] ?? []) as unknown[],
  ];

  for (const list of geomLists) {
    if (!Array.isArray(list)) continue;

    for (const item of list) {
      const g = (item as Record<string, unknown>)['geometri'] as
        | Record<string, unknown>
        | undefined;
      if (!g) continue;

      const position = g['position'] as Record<string, unknown> | undefined;
      if (!position) continue;

      const geoJsonType = position['type'] as string | undefined;
      const coordinates = position['coordinates'];
      const crs = (g['koordinatsystemPlan'] as string | undefined) ?? 'EPSG:3009';

      if (!geoJsonType || coordinates === undefined) continue;

      // Map GeoJSON type to our internal type
      let geomType: GeometryType;
      if (geoJsonType === 'Polygon' || geoJsonType === 'MultiPolygon') {
        geomType = 'polygon';
      } else if (geoJsonType === 'LineString' || geoJsonType === 'MultiLineString') {
        geomType = 'line';
      } else if (geoJsonType === 'Point') {
        geomType = 'point';
      } else {
        // Also handle the Swedish typ field as fallback
        const swTyp = g['typ'] as string | undefined;
        geomType = swTyp ? mapTyp(swTyp) : 'polygon';
      }

      result.push({
        coordinates: coordinates as number[] | number[][] | number[][][],
        crs,
        type: geomType,
      });
    }
  }

  return result;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export interface ParseResult {
  geometryDoc: GeometryDoc;
  geometries: Geometry[];
}

/**
 * Parses a raw detaljplan JSON object into a GeometryDoc + Geometry[].
 *
 * @param rawJson   The parsed JSON object from the uploaded file.
 * @param fileName  Original file name (for display & storage).
 * @throws If the JSON does not look like a supported detaljplan FeatureCollection.
 */
export function parseDetaljplanJson(
  rawJson: Record<string, unknown>,
  fileName: string
): ParseResult {
  if (rawJson['type'] !== 'FeatureCollection') {
    throw new Error('Expected a GeoJSON FeatureCollection at the top level.');
  }

  const features = rawJson['features'] as Array<Record<string, unknown>>;
  if (!Array.isArray(features) || features.length === 0) {
    throw new Error('FeatureCollection contains no features.');
  }

  // ── Find the root detaljplan feature ──────────────────────────────────────
  const planFeature = features.find((f) => {
    const props = f['properties'] as Record<string, unknown> | undefined;
    return props?.['feature:typ'] === 'detaljplan';
  });

  if (!planFeature) {
    throw new Error('No feature with feature:typ "detaljplan" found.');
  }

  const planProps = planFeature['properties'] as Record<string, unknown>;
  const planId = (planFeature['id'] as string) ?? (planProps['objektidentitet'] as string);
  const beteckning = (planProps['beteckning'] as string) ?? '';
  const namn = (planProps['namn'] as string) ?? '';
  const docName = [beteckning, namn].filter(Boolean).join(' – ');

  // ── Build GeometryDoc ─────────────────────────────────────────────────────
  const geometryDoc: GeometryDoc = {
    id: planId,
    name: docName || fileName,
    fileName,
    rawJson,
    createdAt: new Date().toISOString(),
  };

  // ── Build Geometry[] from all features ────────────────────────────────────
  const geometries: Geometry[] = [];

  for (const feature of features) {
    const props = feature['properties'] as Record<string, unknown>;
    const featureId = (feature['id'] as string) ?? (props['objektidentitet'] as string);
    const featureType = (props['feature:typ'] as string) ?? 'okänd';

    const rawGeoms = extractGeometries(props);
    if (rawGeoms.length === 0) continue;

    // Derive a human-readable name for the geometry
    const formName =
      (props['beteckning'] as string) ||
      (props['bestammelseformulering'] as string) ||
      (props['namn'] as string) ||
      featureType;

    // Use the first geometry entry (most features have exactly one)
    const firstGeom = rawGeoms[0];

    geometries.push({
      uuid: featureId,
      name: formName.length > 60 ? formName.slice(0, 57) + '…' : formName,
      type: firstGeom.type,
      coordinates: firstGeom.coordinates,
      crs: firstGeom.crs,
      featureType,
      sourceDocId: planId,
      color: colorForFeatureType(featureType),
      properties: props,
    });
  }

  if (geometries.length === 0) {
    throw new Error(
      'No geometries could be extracted from the FeatureCollection. ' +
      'Make sure features have plangeometri or bestammelsegeometri.'
    );
  }

  return { geometryDoc, geometries };
}
