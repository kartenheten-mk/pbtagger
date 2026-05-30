import type { Geometry, GeometrySource } from '../types';

/**
 * Infer geometry source for legacy records that do not yet have `source`.
 */
export function inferGeometrySource(geometry: Geometry): GeometrySource {
  if (geometry.source === 'json' || geometry.source === 'docx_gml') {
    return geometry.source;
  }

  const featureType = (geometry.featureType ?? '').toLowerCase();
  const identitet = geometry.properties?.['identitet'];

  // Legacy Planbeskrivning GML geometries are identified by:
  // - featureType = "planbeskrivning"
  // - no sourceDocId (they do not belong to a GeometryDoc JSON import)
  // - an "identitet" property from <Omfattning>
  if (
    !geometry.sourceDocId &&
    featureType === 'planbeskrivning' &&
    typeof identitet === 'string' &&
    identitet.length > 0
  ) {
    return 'docx_gml';
  }

  return 'json';
}

export function normalizeGeometrySource(geometry: Geometry): Geometry {
  return {
    ...geometry,
    source: inferGeometrySource(geometry),
  };
}

export function splitGeometriesBySource(geometries: Geometry[]): {
  json: Geometry[];
  docxGml: Geometry[];
} {
  const json: Geometry[] = [];
  const docxGml: Geometry[] = [];

  for (const geometry of geometries) {
    if (inferGeometrySource(geometry) === 'docx_gml') {
      docxGml.push(geometry);
    } else {
      json.push(geometry);
    }
  }

  return { json, docxGml };
}

export function canEditGeometryLinks(geometries: Geometry[]): boolean {
  const { json, docxGml } = splitGeometriesBySource(geometries);
  return json.length > 0 || docxGml.length === 0;
}
