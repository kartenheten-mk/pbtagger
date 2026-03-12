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

import React, { useEffect, useRef, useCallback } from 'react';

// OpenLayers core
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat } from 'ol/proj';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style';
import type { FeatureLike } from 'ol/Feature';
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
  isLinking: boolean;
  /** Single-feature click — always fires when exactly one feature is at the pixel */
  onFeatureClick: (uuid: string) => void;
  /**
   * Multi-feature click — fires when ≥2 features overlap at the click pixel.
   * pixelX/Y are relative to the map container element.
   * Parent should show a disambiguation picker using these coordinates.
   */
  onMultiFeatureClick: (items: PickerItem[], pixelX: number, pixelY: number) => void;
}

// ─── Style factory ────────────────────────────────────────────────────────────

function makeStyle(
  color: string,
  selected: boolean,
  pending: boolean,
  linking: boolean
): Style {
  const fillAlpha = selected ? '20' : '15';
  const strokeWidth = selected ? 4 : pending ? 3 : linking ? 2 : 1.5;
  const strokeColor = selected
    ? '#facc15'
    : pending
      ? '#10b981'
      : linking
        ? '#2563eb'
        : color;

  return new Style({
    zIndex: selected ? 100 : pending ? 50 : 0,
    fill: new Fill({ color: color + fillAlpha }),
    stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
    image: new CircleStyle({
      radius: selected ? 8 : pending ? 7 : 6,
      fill: new Fill({ color: color + fillAlpha }),
      stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
    }),
  });
}

function styleFunction(
  feature: FeatureLike,
  selectedUuids: string[],
  pendingUuids: string[],
  isLinking: boolean
): Style {
  const uuid = feature.get('uuid') as string;
  const color: string = feature.get('color') ?? '#6b7280';
  const selected = selectedUuids.includes(uuid);
  const pending = !selected && pendingUuids.includes(uuid);
  return makeStyle(color, selected, pending, isLinking && !selected && !pending);
}

// ─── Component ────────────────────────────────────────────────────────────────

export const MapView: React.FC<MapViewProps> = ({
  geometries,
  selectedGeometryUuids,
  pendingGeometryUuids = [],
  isLinking,
  onFeatureClick,
  onMultiFeatureClick,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectorSourceRef = useRef<VectorSource | null>(null);
  const vectorLayerRef = useRef<VectorLayer | null>(null);

  // Keep fresh refs so OL event closures always see the latest callbacks/state
  const onFeatureClickRef = useRef(onFeatureClick);
  onFeatureClickRef.current = onFeatureClick;
  const onMultiFeatureClickRef = useRef(onMultiFeatureClick);
  onMultiFeatureClickRef.current = onMultiFeatureClick;
  const pendingUuidsRef = useRef(pendingGeometryUuids);
  pendingUuidsRef.current = pendingGeometryUuids;
  const selectedUuidsRef = useRef(selectedGeometryUuids);
  selectedUuidsRef.current = selectedGeometryUuids;

  // ── Initialise map once ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: (feature) =>
        styleFunction(feature, selectedGeometryUuids, pendingGeometryUuids, isLinking),
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

    // ── Click handler ────────────────────────────────────────────────────
    map.on('click', (event) => {
      const olFeatures = map.getFeaturesAtPixel(event.pixel);
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
            pendingUuidsRef.current.includes(uuid) ||
            selectedUuidsRef.current.includes(uuid),
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
    map.on('pointermove', (event) => {
      const hit = map.hasFeatureAtPixel(event.pixel);
      map.getTargetElement().style.cursor = hit ? 'pointer' : '';
    });

    const resizeObserver = new ResizeObserver(() => {
      mapRef.current?.updateSize();
    });
    const currentContainer = mapContainerRef.current;
    if (currentContainer) resizeObserver.observe(currentContainer);

    return () => {
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

    source.clear();
    if (geometries.length === 0) return;

    const geoJsonData = geometriesToGeoJson(geometries);
    const format = new GeoJSON();
    const features = format.readFeatures(geoJsonData, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    });
    source.addFeatures(features);

    const extent = source.getExtent() as Extent;
    if (!isEmpty(extent)) {
      mapRef.current?.getView().fit(extent, {
        padding: [40, 40, 40, 40],
        maxZoom: 18,
        duration: 500,
      });
    }
  }, [geometries]);

  // ── Refresh style when selection / pending / linking mode changes ─────────
  useEffect(() => {
    const layer = vectorLayerRef.current;
    if (!layer) return;
    layer.setStyle((feature) =>
      styleFunction(feature, selectedGeometryUuids, pendingGeometryUuids, isLinking)
    );
  }, [selectedGeometryUuids, pendingGeometryUuids, isLinking]);

  // ── Pan to fit all selected features ─────────────────────────────────────
  const panToSelected = useCallback(() => {
    const uuids = selectedGeometryUuids;
    if (uuids.length === 0 || !vectorSourceRef.current || !mapRef.current) return;

    const combined = createEmpty();
    let found = false;
    for (const uuid of uuids) {
      const feature = vectorSourceRef.current
        .getFeatures()
        .find((f) => f.get('uuid') === uuid);
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
  }, [selectedGeometryUuids]);

  useEffect(() => {
    panToSelected();
  }, [panToSelected]);

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
          <p className="text-xs text-gray-500 font-medium">Ingen geometri inläst</p>
          <p className="text-xs text-gray-400 mt-1">Ladda upp en detaljplan-JSON</p>
        </div>
      )}
    </div>
  );
};
