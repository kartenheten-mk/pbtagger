/**
 * MapView.tsx
 *
 * OpenLayers map component with:
 *  - OSM tile layer as background
 *  - Vector layer rendering imported detaljplan features (GeoJSON)
 *  - Click-to-link support: fires onFeatureClick(uuid) when linking mode is active
 *  - Auto-fit to imported feature extent
 *  - Visual highlight of the currently selected / linked feature
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
import { isEmpty } from 'ol/extent';

// OpenLayers CSS (required for map rendering)
import 'ol/ol.css';

import type { Geometry } from '../types';
import { geometriesToGeoJson } from './geoJsonConverter';

// ─── Props ────────────────────────────────────────────────────────────────────

interface MapViewProps {
  geometries: Geometry[];
  selectedGeometryUuid: string | null;
  isLinking: boolean;
  onFeatureClick: (uuid: string) => void;
}

// ─── Style factory ────────────────────────────────────────────────────────────

function makeStyle(
  color: string,
  selected: boolean,
  linking: boolean
): Style {
  // Selected: outline-only (transparent fill, thick bright stroke)
  const fillAlpha = selected ? '10' : '15';
  const strokeWidth = selected ? 4 : linking ? 2 : 1.5;
  const strokeColor = selected ? '#facc15' : linking ? '#2563eb' : color;

  return new Style({
    zIndex: selected ? 100 : 0,
    fill: new Fill({ color: color + fillAlpha }),
    stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
    image: new CircleStyle({
      radius: selected ? 8 : 6,
      fill: new Fill({ color: color + fillAlpha }),
      stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
    }),
  });
}

function styleFunction(
  feature: FeatureLike,
  selectedUuid: string | null,
  isLinking: boolean
): Style {
  const uuid = feature.get('uuid') as string;
  const color: string = feature.get('color') ?? '#6b7280';
  const selected = uuid === selectedUuid;
  return makeStyle(color, selected, isLinking && !selected);
}

// ─── Component ────────────────────────────────────────────────────────────────

export const MapView: React.FC<MapViewProps> = ({
  geometries,
  selectedGeometryUuid,
  isLinking,
  onFeatureClick,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectorSourceRef = useRef<VectorSource | null>(null);
  const vectorLayerRef = useRef<VectorLayer | null>(null);

  // ── Initialise map once ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: (feature) => styleFunction(feature, selectedGeometryUuid, isLinking),
    });
    vectorLayerRef.current = vectorLayer;

    const map = new Map({
      target: mapContainerRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        vectorLayer,
      ],
      view: new View({
        center: fromLonLat([15.0, 62.0]), // Default: centre of Sweden
        zoom: 5,
      }),
    });

    mapRef.current = map;

    // Click handler
    map.on('click', (event) => {
      const features = map.getFeaturesAtPixel(event.pixel);
      if (features && features.length > 0) {
        const uuid = features[0].get('uuid') as string | undefined;
        if (uuid) onFeatureClick(uuid);
      }
    });

    // Pointer cursor on hover
    map.on('pointermove', (event) => {
      const hit = map.hasFeatureAtPixel(event.pixel);
      map.getTargetElement().style.cursor = hit ? 'pointer' : '';
    });

    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update click handler ref when isLinking / onFeatureClick change ───────
  const onFeatureClickRef = useRef(onFeatureClick);
  onFeatureClickRef.current = onFeatureClick;

  // ── Update vector layer features when geometries change ──────────────────
  useEffect(() => {
    const source = vectorSourceRef.current;
    if (!source) return;

    source.clear();

    if (geometries.length === 0) return;

    // Convert to GeoJSON (EPSG:4326) and load into OL (reprojecting to 3857)
    const geoJsonData = geometriesToGeoJson(geometries);
    const format = new GeoJSON();
    const features = format.readFeatures(geoJsonData, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    });
    source.addFeatures(features);

    // Fit map view to the extent of all features
    const extent = source.getExtent() as Extent;
    if (!isEmpty(extent)) {
      mapRef.current?.getView().fit(extent, {
        padding: [40, 40, 40, 40],
        maxZoom: 18,
        duration: 500,
      });
    }
  }, [geometries]);

  // ── Refresh style when selection / linking mode changes ───────────────────
  useEffect(() => {
    const layer = vectorLayerRef.current;
    if (!layer) return;
    layer.setStyle((feature) =>
      styleFunction(feature, selectedGeometryUuid, isLinking)
    );
  }, [selectedGeometryUuid, isLinking]);

  // ── Pan to selected feature ───────────────────────────────────────────────
  const panToSelected = useCallback(() => {
    if (!selectedGeometryUuid || !vectorSourceRef.current || !mapRef.current) return;
    const feature = vectorSourceRef.current
      .getFeatures()
      .find((f) => f.get('uuid') === selectedGeometryUuid);
    if (!feature) return;
    const geom = feature.getGeometry();
    if (!geom) return;
    const extent: Extent = geom.getExtent();
    if (isEmpty(extent)) return;
    mapRef.current.getView().fit(extent, {
      padding: [60, 60, 60, 60],
      maxZoom: 18,
      duration: 400,
    });
  }, [selectedGeometryUuid]);

  useEffect(() => {
    panToSelected();
  }, [panToSelected]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-gray-200">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Linking mode overlay badge */}
      {isLinking && (
        <div className="absolute top-2 left-2 px-2 py-1 bg-blue-600/90 text-white text-xs rounded-lg shadow pointer-events-none">
          Klicka på ett område för att länka
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
