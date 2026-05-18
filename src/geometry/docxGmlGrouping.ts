import type { Geometry } from '../types';

const DERIVED_GML_IDENTITET_SUFFIX = /_g\d+$/i;
const COORDINATE_PRECISION = 3;

function getIdentitet(geometry: Geometry): string {
  return typeof geometry.properties?.['identitet'] === 'string'
    ? (geometry.properties['identitet'] as string)
    : '';
}

function normalizeCoordinateValue(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number(value.toFixed(COORDINATE_PRECISION));
  }
  if (Array.isArray(value)) {
    return value.map(normalizeCoordinateValue);
  }
  return value;
}

function getGeometryFingerprint(geometry: Geometry): string {
  return [
    geometry.type,
    geometry.crs ?? '',
    JSON.stringify(normalizeCoordinateValue(geometry.coordinates)),
  ].join('\u0001');
}

export interface DocxGmlGeometryGroup {
  /** Stable row key; the first geometry UUID in this group. */
  key: string;
  /** Display label for the grouped row. */
  label: string;
  geometries: Geometry[];
  geometryUuids: string[];
}

/**
 * Group imported DOCX GML objects that appear to come from the same original
 * source geometry.
 *
 * A DOCX-only import no longer has access to the original JSON feature UUID,
 * because direct GML stores coordinates rather than the JSON reference. The
 * best available signal is therefore the parsed geometry itself: if several
 * Planbeskrivning tags contain the same GML shape, they are treated as one
 * logical display row with multiple linked tags, matching how JSON mode shows
 * multiple tags attached to one geometry.
 */
export function groupDocxGmlGeometries(geometries: Geometry[]): DocxGmlGeometryGroup[] {
  const getDisplayLabel = (geometry: Geometry): string => {
    const identitet = getIdentitet(geometry);
    if (!identitet) return geometry.name || geometry.uuid;
    return identitet.replace(DERIVED_GML_IDENTITET_SUFFIX, '');
  };

  const groupsByFingerprint = new Map<string, Geometry[]>();
  for (const geometry of geometries) {
    const fingerprint = getGeometryFingerprint(geometry);
    const group = groupsByFingerprint.get(fingerprint) ?? [];
    group.push(geometry);
    groupsByFingerprint.set(fingerprint, group);
  }

  return Array.from(groupsByFingerprint.values()).map((group) => ({
    key: group[0]?.uuid ?? '',
    label: group[0] ? getDisplayLabel(group[0]) : '',
    geometries: group,
    geometryUuids: group.map((geometry) => geometry.uuid),
  }));
}