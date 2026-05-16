/**
 * MapView.tsx
 *
 * OpenLayers map component with:
 *  - OSM tile layer as background
 *  - Vector layer rendering imported detaljplan features (GeoJSON)
 *  - Click-to-link support: fires onFeatureClick(uuid) when linking mode is active
 *  - Auto-fit to imported feature extent
 *  - Visual highlight of the currently selected / linked features (supports multiple)
 *
 * Overlapping-feature disambiguation is handled by the parent (GeometryPanel)
 * via the onMultiFeatureClick callback, so the popup can render outside
 * the map's overflow-hidden boundary.
 *
 * Coordinate flow:
 *   Source JSON (EPSG:3009) → geoJsonConverter (EPSG:4326) → OL reads with
 *   featureProjection:'EPSG:3857' → displayed on OSM map (EPSG:3857)
 */

import React, { useEffect, useMemo, useRef } from 'react';

// OpenLayers core
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorImageLayer from 'ol/layer/VectorImage';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat } from 'ol/proj';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style';
import type OlFeature from 'ol/Feature';
import type { FeatureLike } from 'ol/Feature';
import type OlGeometry from 'ol/geom/Geometry';
import type { Extent } from 'ol/extent';
import { isEmpty, extend as extendExtent, createEmpty } from 'ol/extent';

// OpenLayers CSS (required for map rendering)
import 'ol/ol.css';

import type { Geometry } from '../types';
import { geometriesToGeoJson } from './geoJsonConverter';

// ─── Exported types (shared with GeometryPanel) ───────────────────────────────

/** One candidate item in the disambiguation picker */
export interface PickerItem {
  uuid: string;
  name: string;
  featureType?: string;
  color: string;
  /** True if the feature is already selected or staged for linking */
  isChecked: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface MapViewProps {
  geometries: Geometry[];
  /** UUIDs of currently selected / highlighted features */
  selectedGeometryUuids: string[];
  /** UUIDs of features being staged for batch-link (shown with checkbox style) */
  pendingGeometryUuids?: string[];
  /** UUID of a feature being previewed from an overlap picker hover */
  previewGeometryUuid?: string | null;
  isLinking: boolean;
  /** Single-feature click — always fires when exactly one feature is at the pixel */
  onFeatureClick: (uuid: string) => void;
  /**
   * Multi-feature click — fires when ≥2 features overlap at the click pixel.
   * pixelX/Y are relative to the map container element.
   * Parent should show a disambiguation picker using these coordinates.
   */
  onMultiFeatureClick: (items: PickerItem[], pixelX: number, pixelY: number) => void;
  /** Empty-state title shown when no geometries are available in current view */
  emptyStateTitle?: string;
  /** Empty-state subtitle shown under title */
  emptyStateSubtitle?: string;
}

// ─── Style factory ────────────────────────────────────────────────────────────

type StyleMode = 'default' | 'selected' | 'pending' | 'preview' | 'linking';

const styleCache = new globalThis.Map<string, Style>();

function makeStyle(color: string, mode: StyleMode): Style {
  const selected = mode === 'selected';
  const pending = mode === 'pending';
  const preview = mode === 'preview';
  const linking = mode === 'linking';
  const fillAlpha = selected ? '20' : preview ? '18' : '15';
  const strokeWidth = selected ? 4 : pending ? 3 : preview ? 3 : linking ? 2 : 1.5;
  const strokeColor = selected
    ? '#facc15'
    : pending
      ? '#10b981'
      : preview
        ? '#f59e0b'
        : linking
          ? '#2563eb'
          : color;
  const zIndex = selected ? 100 : pending ? 75 : preview ? 60 : 0;
  const radius = selected ? 8 : pending ? 7 : preview ? 7 : 6;

  return new Style({
    zIndex,
    fill: new Fill({ color: color + fillAlpha }),
    stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
    image: new CircleStyle({
      radius,
      fill: new Fill({ color: color + fillAlpha }),
      stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
    }),
  });
}

function getCachedStyle(color: string, mode: StyleMode): Style {
  const cacheKey = `${color}\u0000${mode}`;
  const cached = styleCache.get(cacheKey);
  if (cached) return cached;
  const style = makeStyle(color, mode);
  styleCache.set(cacheKey, style);
  return style;
}

function styleFunction(
  feature: FeatureLike,
  selectedUuids: Set<string>,
  pendingUuids: Set<string>,
  previewUuid: string | null | undefined,
  isLinking: boolean
): Style {
  const uuid = feature.get('uuid') as string;
  const color: string = feature.get('color') ?? '#6b7280';
  const selected = selectedUuids.has(uuid);
  const pending = !selected && pendingUuids.has(uuid);
  const preview = !selected && !pending && previewUuid === uuid;
  const mode: StyleMode = selected
    ? 'selected'
    : pending
      ? 'pending'
      : preview
        ? 'preview'
        : isLinking
          ? 'linking'
          : 'default';
  return getCachedStyle(color, mode);
}

const coordinateIdentityByArray = new WeakMap<object, number>();
let nextCoordinateIdentity = 1;

function getCoordinateIdentity(coordinates: Geometry['coordinates']): number {
  const existing = coordinateIdentityByArray.get(coordinates);
  if (existing) return existing;
  const identity = nextCoordinateIdentity;
  nextCoordinateIdentity += 1;
  coordinateIdentityByArray.set(coordinates, identity);
  return identity;
}

function buildGeometryDataKey(geometries: Geometry[]): string {
  return geometries
    .map((geometry) =>
      [
        geometry.uuid,
        geometry.name,
        geometry.type,
        geometry.crs,
        geometry.featureType,
        geometry.source,
        geometry.sourceDocId,
        geometry.color,
        getCoordinateIdentity(geometry.coordinates),
        geometry.properties?.['bestammelseformulering'],
        geometry.properties?.['kategori'],
      ].join('\u0001')
    )
    .join('\u0002');
}

function buildUuidSetKey(uuids: string[]): string {
  return uuids.length === 0 ? '' : [...uuids].sort().join('\u0000');
}

function buildUuidSetFromKey(key: string): Set<string> {
  return new Set(key ? key.split('\u0000') : []);
}

interface PreparedFeatureSet {
  features: OlFeature<OlGeometry>[];
  featureByUuid: globalThis.Map<string, OlFeature<OlGeometry>>;
  extent: Extent;
}

const geoJsonFormat = new GeoJSON();
const featureSetCache = new globalThis.Map<string, PreparedFeatureSet>();
const MAX_FEATURE_SET_CACHE_SIZE = 8;

function cachePreparedFeatureSet(key: string, prepared: PreparedFeatureSet) {
  if (featureSetCache.size >= MAX_FEATURE_SET_CACHE_SIZE) {
    const oldestKey = featureSetCache.keys().next().value as string | undefined;
    if (oldestKey) featureSetCache.delete(oldestKey);
  }
  featureSetCache.set(key, prepared);
}

function prepareFeatureSet(geometries: Geometry[], geometryDataKey: string): PreparedFeatureSet {
  const cached = featureSetCache.get(geometryDataKey);
  if (cached) return cached;

  const geoJsonData = geometriesToGeoJson(geometries);
  const features = geoJsonFormat.readFeatures(geoJsonData, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  }) as OlFeature<OlGeometry>[];
  const featureByUuid = new globalThis.Map<string, OlFeature<OlGeometry>>();
  const extent = createEmpty();

  for (const feature of features) {
    const uuid = feature.get('uuid') as string | undefined;
    if (uuid) featureByUuid.set(uuid, feature);

    const geometry = feature.getGeometry();
    if (geometry) {
      extendExtent(extent, geometry.getExtent());
    }
  }

  const prepared = { features, featureByUuid, extent };
  cachePreparedFeatureSet(geometryDataKey, prepared);
  return prepared;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const MapView: React.FC<MapViewProps> = ({
  geometries,
  selectedGeometryUuids,
  pendingGeometryUuids = [],
  previewGeometryUuid = null,
  isLinking,
  onFeatureClick,
  onMultiFeatureClick,
  emptyStateTitle = 'Ingen geometri inläst',
  emptyStateSubtitle = 'Ladda upp en detaljplan-JSON',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectorSourceRef = useRef<VectorSource | null>(null);
  const vectorLayerRef = useRef<VectorImageLayer | null>(null);
  const featureByUuidRef = useRef(new globalThis.Map<string, OlFeature<OlGeometry>>());

  const selectedGeometryKey = useMemo(
    () => buildUuidSetKey(selectedGeometryUuids),
    [selectedGeometryUuids]
  );
  const pendingGeometryKey = useMemo(
    () => buildUuidSetKey(pendingGeometryUuids),
    [pendingGeometryUuids]
  );
  const selectedUuidSet = useMemo(
    () => buildUuidSetFromKey(selectedGeometryKey),
    [selectedGeometryKey]
  );
  const pendingUuidSet = useMemo(
    () => buildUuidSetFromKey(pendingGeometryKey),
    [pendingGeometryKey]
  );
  const geometryDataKey = useMemo(
    () => buildGeometryDataKey(geometries),
    [geometries]
  );

  // Keep fresh refs so OL event closures always see the latest callbacks/state
  const onFeatureClickRef = useRef(onFeatureClick);
  onFeatureClickRef.current = onFeatureClick;
  const onMultiFeatureClickRef = useRef(onMultiFeatureClick);
  onMultiFeatureClickRef.current = onMultiFeatureClick;
  const pendingUuidSetRef = useRef(pendingUuidSet);
  pendingUuidSetRef.current = pendingUuidSet;
  const selectedUuidSetRef = useRef(selectedUuidSet);
  selectedUuidSetRef.current = selectedUuidSet;
  const selectedUuidsRef = useRef(selectedGeometryUuids);
  selectedUuidsRef.current = selectedGeometryUuids;
  const geometriesRef = useRef(geometries);
  geometriesRef.current = geometries;

  // ── Initialise map once ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    const vectorLayer = new VectorImageLayer({
      source: vectorSource,
      imageRatio: 1,
      renderBuffer: 24,
      style: (feature) =>
        styleFunction(
          feature,
          selectedUuidSet,
          pendingUuidSet,
          previewGeometryUuid,
          isLinking
        ),
    });
    vectorLayerRef.current = vectorLayer;

    const map = new Map({
      target: mapContainerRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        vectorLayer,
      ],
      view: new View({
        center: fromLonLat([15.0, 62.0]),
        zoom: 5,
      }),
    });

    mapRef.current = map;
    const hitOptions = { layerFilter: (layer: unknown) => layer === vectorLayer };

    // ── Click handler ────────────────────────────────────────────────────
    map.on('click', (event) => {
      const olFeatures = map.getFeaturesAtPixel(event.pixel, hitOptions);
      if (!olFeatures || olFeatures.length === 0) return;

      // Build candidate list
      const candidates: PickerItem[] = [];
      for (const f of olFeatures) {
        const uuid = f.get('uuid') as string | undefined;
        if (!uuid) continue;
        candidates.push({
          uuid,
          name: (f.get('name') as string | undefined) ?? uuid,
          featureType: f.get('featureType') as string | undefined,
          color: (f.get('color') as string | undefined) ?? '#6b7280',
          isChecked:
            pendingUuidSetRef.current.has(uuid) ||
            selectedUuidSetRef.current.has(uuid),
        });
      }

      if (candidates.length === 0) return;

      if (candidates.length === 1) {
        // Single hit — fire directly
        onFeatureClickRef.current(candidates[0].uuid);
      } else {
        // Multiple hits — delegate to parent for disambiguation
        onMultiFeatureClickRef.current(candidates, event.pixel[0], event.pixel[1]);
      }
    });

    // Pointer cursor on hover
    let hoverFrame: number | null = null;
    let latestHoverPixel: number[] | null = null;
    map.on('pointermove', (event) => {
      if (event.dragging) {
        latestHoverPixel = null;
        if (hoverFrame !== null) {
          window.cancelAnimationFrame(hoverFrame);
          hoverFrame = null;
        }
        map.getTargetElement().style.cursor = '';
        return;
      }

      latestHoverPixel = event.pixel.slice();
      if (hoverFrame !== null) return;

      hoverFrame = window.requestAnimationFrame(() => {
        hoverFrame = null;
        if (!latestHoverPixel) return;
        const hit = map.hasFeatureAtPixel(latestHoverPixel, hitOptions);
        map.getTargetElement().style.cursor = hit ? 'pointer' : '';
      });
    });

    const resizeObserver = new ResizeObserver(() => {
      mapRef.current?.updateSize();
    });
    const currentContainer = mapContainerRef.current;
    if (currentContainer) resizeObserver.observe(currentContainer);

    return () => {
      if (hoverFrame !== null) {
        window.cancelAnimationFrame(hoverFrame);
      }
      if (currentContainer) resizeObserver.unobserve(currentContainer);
      map.setTarget(undefined);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update vector layer features when geometries change ──────────────────
  useEffect(() => {
    const source = vectorSourceRef.current;
    if (!source) return;
    const currentGeometries = geometriesRef.current;

    source.clear(true);
    featureByUuidRef.current = new globalThis.Map();
    if (currentGeometries.length === 0) return;

    const prepared = prepareFeatureSet(currentGeometries, geometryDataKey);
    featureByUuidRef.current = prepared.featureByUuid;
    source.addFeatures(prepared.features);

    if (!isEmpty(prepared.extent)) {
      mapRef.current?.getView().fit(prepared.extent, {
        padding: [40, 40, 40, 40],
        maxZoom: 18,
        duration: 500,
      });
    }
  }, [geometryDataKey]);

  // ── Refresh style when selection / pending / linking mode changes ─────────
  useEffect(() => {
    const layer = vectorLayerRef.current;
    if (!layer) return;
    layer.setStyle((feature) =>
      styleFunction(
        feature,
        selectedUuidSet,
        pendingUuidSet,
        previewGeometryUuid,
        isLinking
      )
    );
  }, [selectedUuidSet, pendingUuidSet, previewGeometryUuid, isLinking]);

  // ── Pan to fit all selected features ─────────────────────────────────────
  useEffect(() => {
    const uuids = selectedUuidsRef.current;
    if (uuids.length === 0 || !vectorSourceRef.current || !mapRef.current) return;

    const combined = createEmpty();
    let found = false;
    for (const uuid of uuids) {
      const feature = featureByUuidRef.current.get(uuid);
      if (!feature) continue;
      const geom = feature.getGeometry();
      if (!geom) continue;
      extendExtent(combined, geom.getExtent());
      found = true;
    }
    if (!found || isEmpty(combined)) return;

    mapRef.current.getView().fit(combined, {
      padding: [60, 60, 60, 60],
      maxZoom: 18,
      duration: 400,
    });
  }, [selectedGeometryKey]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-gray-200">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Linking mode overlay badge */}
      {isLinking && (
        <div className="absolute top-2 left-2 px-2 py-1 bg-blue-600/90 text-white text-xs rounded-lg shadow pointer-events-none">
          Klicka för att markera geometrier
        </div>
      )}

      {/* Empty state overlay */}
      {geometries.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm pointer-events-none">
          <p className="text-xs text-gray-500 font-medium">{emptyStateTitle}</p>
          <p className="text-xs text-gray-400 mt-1">{emptyStateSubtitle}</p>
        </div>
      )}
    </div>
  );
};
