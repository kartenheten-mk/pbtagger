import React, { useCallback, useMemo, useState } from 'react';
import { useDocumentStore } from '../store/useDocumentStore';
import type { WmsBackgroundMap } from '../types';
import { normalizeLayerNames } from '../config/appConfig';
import { fetchWmsCapabilities, type WmsCapabilityLayer } from './wmsCapabilities';

interface MapSettingsPanelProps {
  onClose: () => void;
}

interface DraftState {
  id: string | null;
  name: string;
  url: string;
  layersText: string;
}

function createEmptyDraft(): DraftState {
  return {
    id: null,
    name: '',
    url: '',
    layersText: '',
  };
}

function createMapId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `wms-${Date.now().toString(36)}`;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function draftFromMap(backgroundMap: WmsBackgroundMap): DraftState {
  return {
    id: backgroundMap.id,
    name: backgroundMap.name,
    url: backgroundMap.url,
    layersText: backgroundMap.layers.join('\n'),
  };
}

export const MapSettingsPanel: React.FC<MapSettingsPanelProps> = ({ onClose }) => {
  const { appConfig, setMapConfig } = useDocumentStore();
  const mapConfig = appConfig.map;

  const [draft, setDraft] = useState<DraftState>(() => createEmptyDraft());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [availableLayers, setAvailableLayers] = useState<WmsCapabilityLayer[]>([]);
  const [layerSearch, setLayerSearch] = useState('');
  const [isLoadingLayers, setIsLoadingLayers] = useState(false);
  const [layersLoadError, setLayersLoadError] = useState<string | null>(null);
  const [isAddingLayer, setIsAddingLayer] = useState(false);
  const [manualLayerText, setManualLayerText] = useState('');

  const activeMap = useMemo(
    () =>
      mapConfig.backgroundMaps.find(
        (backgroundMap) => backgroundMap.id === mapConfig.activeBackgroundMapId
      ) ?? null,
    [mapConfig.activeBackgroundMapId, mapConfig.backgroundMaps]
  );

  const updateDraft = useCallback((changes: Partial<DraftState>) => {
    setDraft((prev) => ({ ...prev, ...changes }));
    setErrors({});
    setSaved(false);

    if (Object.prototype.hasOwnProperty.call(changes, 'url')) {
      setAvailableLayers([]);
      setLayerSearch('');
      setLayersLoadError(null);
    }
  }, []);

  const selectedLayers = useMemo(
    () => normalizeLayerNames(draft.layersText),
    [draft.layersText]
  );

  const selectedLayerNames = useMemo(
    () => new Set(selectedLayers),
    [selectedLayers]
  );

  const filteredAvailableLayers = useMemo(() => {
    const query = layerSearch.trim().toLowerCase();
    if (!query) return availableLayers;

    return availableLayers.filter((layer) => {
      const haystack = `${layer.name} ${layer.title} ${layer.abstract ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [availableLayers, layerSearch]);

  const loadAvailableLayers = useCallback(async () => {
    const url = draft.url.trim();
    if (!url) {
      setLayersLoadError('Ange en WMS-adress först.');
      return;
    }
    if (!isHttpUrl(url)) {
      setLayersLoadError('Adressen måste börja med http:// eller https://.');
      return;
    }

    setIsLoadingLayers(true);
    setLayersLoadError(null);

    try {
      const layers = await fetchWmsCapabilities(url);
      setAvailableLayers(layers);
      setLayerSearch('');
      if (layers.length === 0) {
        setLayersLoadError('WMS-servern returnerade inga valbara lager.');
      }
    } catch (error) {
      setAvailableLayers([]);
      setLayersLoadError(
        error instanceof Error
          ? error.message
          : 'Kunde inte hämta lager från WMS-servern.'
      );
    } finally {
      setIsLoadingLayers(false);
    }
  }, [draft.url]);

  const setDraftLayers = useCallback(
    (layers: string[]) => {
      updateDraft({ layersText: layers.join('\n') });
    },
    [updateDraft]
  );

  const moveSelectedLayer = useCallback(
    (index: number, delta: number) => {
      const currentLayers = normalizeLayerNames(draft.layersText);
      const targetIndex = index + delta;
      if (targetIndex < 0 || targetIndex >= currentLayers.length) return;

      const nextLayers = [...currentLayers];
      [nextLayers[index], nextLayers[targetIndex]] = [nextLayers[targetIndex], nextLayers[index]];
      setDraftLayers(nextLayers);
    },
    [draft.layersText, setDraftLayers]
  );

  const removeSelectedLayer = useCallback(
    (index: number) => {
      const nextLayers = normalizeLayerNames(draft.layersText).filter((_, layerIndex) => layerIndex !== index);
      setDraftLayers(nextLayers);
    },
    [draft.layersText, setDraftLayers]
  );

  const addManualLayers = useCallback(() => {
    const layerToAdd = normalizeLayerNames(manualLayerText)[0];
    if (!layerToAdd) return;

    const existingLayers = normalizeLayerNames(draft.layersText);
    const nextLayers = existingLayers.includes(layerToAdd)
      ? existingLayers
      : [...existingLayers, layerToAdd];

    setDraftLayers(nextLayers);
    setManualLayerText('');
    setIsAddingLayer(false);
  }, [draft.layersText, manualLayerText, setDraftLayers]);

  const addCapabilityLayer = useCallback(
    (layerName: string) => {
      const existingLayers = normalizeLayerNames(draft.layersText);
      if (!existingLayers.includes(layerName)) {
        setDraftLayers([...existingLayers, layerName]);
      }
      setLayerSearch('');
      setIsAddingLayer(false);
    },
    [draft.layersText, setDraftLayers]
  );

  const startNew = useCallback(() => {
    setDraft(createEmptyDraft());
    setErrors({});
    setSaved(false);
    setAvailableLayers([]);
    setLayerSearch('');
    setLayersLoadError(null);
    setIsAddingLayer(false);
    setManualLayerText('');
  }, []);

  const startEdit = useCallback((backgroundMap: WmsBackgroundMap) => {
    setDraft(draftFromMap(backgroundMap));
    setErrors({});
    setSaved(false);
    setAvailableLayers([]);
    setLayerSearch('');
    setLayersLoadError(null);
    setIsAddingLayer(false);
    setManualLayerText('');
  }, []);

  const setActiveMap = useCallback(
    (activeBackgroundMapId: string | null) => {
      setMapConfig({
        ...mapConfig,
        activeBackgroundMapId,
      });
    },
    [mapConfig, setMapConfig]
  );

  const deleteMap = useCallback(
    (id: string) => {
      const backgroundMaps = mapConfig.backgroundMaps.filter((item) => item.id !== id);
      setMapConfig({
        activeBackgroundMapId:
          mapConfig.activeBackgroundMapId === id ? null : mapConfig.activeBackgroundMapId,
        backgroundMaps,
      });
      if (draft.id === id) startNew();
    },
    [draft.id, mapConfig, setMapConfig, startNew]
  );

  const saveDraft = useCallback(() => {
    const nextErrors: Record<string, string> = {};
    const name = draft.name.trim();
    const url = draft.url.trim();
    const layers = normalizeLayerNames(draft.layersText);

    if (!name) nextErrors.name = 'Ange ett namn.';
    if (!url) nextErrors.url = 'Ange en WMS-adress.';
    else if (!isHttpUrl(url)) nextErrors.url = 'Adressen måste börja med http:// eller https://.';
    if (layers.length === 0) nextErrors.layers = 'Ange minst ett lagernamn.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const id = draft.id ?? createMapId();
    const savedMap: WmsBackgroundMap = {
      id,
      type: 'wms',
      name,
      url,
      layers,
    };
    const existingIndex = mapConfig.backgroundMaps.findIndex((item) => item.id === id);
    const backgroundMaps =
      existingIndex >= 0
        ? mapConfig.backgroundMaps.map((item) => (item.id === id ? savedMap : item))
        : [...mapConfig.backgroundMaps, savedMap];

    setMapConfig({
      activeBackgroundMapId: mapConfig.activeBackgroundMapId ?? id,
      backgroundMaps,
    });
    setDraft(draftFromMap(savedMap));
    setSaved(true);
  }, [draft, mapConfig, setMapConfig]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-settings-title"
        className="w-[560px] max-w-[calc(100vw-2rem)] max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
          <div>
            <p id="map-settings-title" className="text-sm font-semibold text-gray-800">Kartinställningar</p>
            <p className="text-xs text-gray-400">Bakgrundskartor från WMS sparas i config.json.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            aria-label="Stäng kartinställningar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Aktiv bakgrund
              </h3>
              <p className="text-xs text-gray-400">
                {activeMap ? activeMap.name : 'OpenStreetMap'}
              </p>
            </div>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setActiveMap(null)}
                aria-pressed={mapConfig.activeBackgroundMapId === null}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl border text-left transition-colors ${
                  mapConfig.activeBackgroundMapId === null
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="text-sm font-medium">OpenStreetMap</span>
                {mapConfig.activeBackgroundMapId === null && (
                  <span className="text-xs font-semibold">Aktiv</span>
                )}
              </button>
              {mapConfig.backgroundMaps.map((backgroundMap) => (
                <button
                  key={backgroundMap.id}
                  type="button"
                  onClick={() => setActiveMap(backgroundMap.id)}
                  aria-pressed={mapConfig.activeBackgroundMapId === backgroundMap.id}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl border text-left transition-colors ${
                    mapConfig.activeBackgroundMapId === backgroundMap.id
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{backgroundMap.name}</span>
                    <span className="block text-xs text-gray-400 truncate">
                      {backgroundMap.layers.join(', ')}
                    </span>
                  </span>
                  {mapConfig.activeBackgroundMapId === backgroundMap.id && (
                    <span className="text-xs font-semibold">Aktiv</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Sparade WMS-kartor
              </h3>
              <button
                type="button"
                onClick={startNew}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                Ny karta
              </button>
            </div>

            {mapConfig.backgroundMaps.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center">
                <p className="text-xs text-gray-400">Inga egna bakgrundskartor sparade.</p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {mapConfig.backgroundMaps.map((backgroundMap) => (
                  <li
                    key={backgroundMap.id}
                    className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-700 truncate">{backgroundMap.name}</p>
                      <p className="text-xs text-gray-400 truncate">{backgroundMap.url}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEdit(backgroundMap)}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    >
                      Redigera
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMap(backgroundMap.id)}
                      className="px-2 py-1 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      aria-label={`Ta bort ${backgroundMap.name}`}
                    >
                      Ta bort
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {draft.id ? 'Redigera WMS-karta' : 'Lägg till WMS-karta'}
              </h3>
            </div>

            <div className="space-y-1">
              <label htmlFor="wms-name" className="block text-xs font-semibold text-gray-600">
                Namn
              </label>
              <input
                id="wms-name"
                value={draft.name}
                onChange={(event) => updateDraft({ name: event.target.value })}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                  errors.name ? 'border-red-400 focus:ring-red-300' : 'border-gray-200 focus:ring-blue-300'
                }`}
                placeholder="Kommunens bakgrundskarta"
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="wms-url" className="block text-xs font-semibold text-gray-600">
                WMS-adress
              </label>
              <input
                id="wms-url"
                value={draft.url}
                onChange={(event) => updateDraft({ url: event.target.value })}
                className={`w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 ${
                  errors.url ? 'border-red-400 focus:ring-red-300' : 'border-gray-200 focus:ring-blue-300'
                }`}
                placeholder="https://example.se/wms"
              />
              {errors.url && <p className="text-xs text-red-500">{errors.url}</p>}
            </div>

            <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-600">Lager</p>
                    <p className="text-xs text-gray-400">Lägg till lager med plusknappen.</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <p className="text-xs text-gray-400">{selectedLayers.length} valda</p>
                    <button
                      type="button"
                      onClick={() => setIsAddingLayer((value) => !value)}
                      aria-label="Lägg till lager"
                      title="Lägg till lager"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      +
                    </button>
                  </div>
                </div>

                {isAddingLayer && (
                  <div className="space-y-2 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                    <div className="space-y-1">
                      <label htmlFor="wms-manual-layer" className="block text-xs font-semibold text-gray-600">
                        Nytt lagernamn
                      </label>
                      <input
                        id="wms-manual-layer"
                        value={manualLayerText}
                        onChange={(event) => setManualLayerText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addManualLayers();
                          }
                        }}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                        placeholder="lager_1"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingLayer(false);
                          setManualLayerText('');
                        }}
                        className="px-2 py-1 text-xs text-gray-500 hover:bg-white rounded-lg"
                      >
                        Avbryt
                      </button>
                      <button
                        type="button"
                        onClick={addManualLayers}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Lägg till
                      </button>
                    </div>

                    <div className="flex items-center gap-2 py-1">
                      <div className="h-px flex-1 bg-blue-100" />
                      <span className="text-xs text-gray-400">eller</span>
                      <div className="h-px flex-1 bg-blue-100" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-gray-600">Hitta lager från WMS</p>
                        <button
                          type="button"
                          onClick={loadAvailableLayers}
                          disabled={isLoadingLayers}
                          aria-label="Hämta lager från WMS"
                          title="Hämta lager från WMS"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-white hover:text-blue-600 disabled:text-gray-300 disabled:hover:bg-transparent"
                        >
                          {isLoadingLayers ? (
                            <span className="text-xs font-semibold">…</span>
                          ) : (
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
                            </svg>
                          )}
                        </button>
                      </div>

                      {layersLoadError && <p className="text-xs text-red-500">{layersLoadError}</p>}
                      {isLoadingLayers && <p className="text-xs text-gray-400">Hämtar GetCapabilities från WMS-servern…</p>}

                      {availableLayers.length > 0 && (
                        <>
                          <label htmlFor="wms-layer-search" className="sr-only">
                            Sök lager
                          </label>
                          <input
                            id="wms-layer-search"
                            value={layerSearch}
                            onChange={(event) => setLayerSearch(event.target.value)}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                            placeholder="Sök lager på namn eller titel"
                          />

                          <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                            {filteredAvailableLayers.length === 0 ? (
                              <p className="px-2 py-3 text-center text-xs text-gray-400">
                                Inga lager matchar sökningen.
                              </p>
                            ) : (
                              filteredAvailableLayers.map((layer) => {
                                const selected = selectedLayerNames.has(layer.name);

                                return (
                                  <button
                                    key={layer.name}
                                    type="button"
                                    onClick={() => addCapabilityLayer(layer.name)}
                                    disabled={selected}
                                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                                      selected
                                        ? 'border-blue-200 bg-blue-50 text-blue-700 opacity-70'
                                        : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50 text-gray-700'
                                    }`}
                                  >
                                    <span className="flex items-start gap-2">
                                      <span
                                        className={`mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px] ${
                                          selected
                                            ? 'border-blue-500 bg-blue-500 text-white'
                                            : 'border-gray-300 text-transparent'
                                        }`}
                                      >
                                        ✓
                                      </span>
                                      <span className="min-w-0">
                                        <span className="block text-xs font-semibold truncate">{layer.title}</span>
                                        <span className="block text-xs font-mono text-gray-400 truncate">{layer.name}</span>
                                      </span>
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {selectedLayers.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center">
                    <p className="text-xs text-gray-400">Inga lager tillagda.</p>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {selectedLayers.map((layerName, index) => (
                      <li
                        key={`${layerName}-${index}`}
                        data-wms-layer-name={layerName}
                        className="flex items-center gap-2 rounded-lg border border-gray-100 px-2 py-2"
                      >
                        <span className="w-6 flex-shrink-0 text-right text-xs text-gray-400">
                          {index + 1}.
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-700">
                          {layerName}
                        </span>
                        <div className="flex flex-shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveSelectedLayer(index, -1)}
                            disabled={index === 0}
                            aria-label={`Flytta upp ${layerName}`}
                            title="Flytta upp"
                            className="h-7 w-7 rounded-md text-sm text-gray-500 hover:bg-gray-100 hover:text-blue-600 disabled:text-gray-300 disabled:hover:bg-transparent"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSelectedLayer(index, 1)}
                            disabled={index === selectedLayers.length - 1}
                            aria-label={`Flytta ner ${layerName}`}
                            title="Flytta ner"
                            className="h-7 w-7 rounded-md text-sm text-gray-500 hover:bg-gray-100 hover:text-blue-600 disabled:text-gray-300 disabled:hover:bg-transparent"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSelectedLayer(index)}
                            aria-label={`Ta bort ${layerName}`}
                            title="Ta bort lager"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-base font-semibold text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                          >
                            ×
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

              {errors.layers ? (
                <p className="text-xs text-red-500">{errors.layers}</p>
              ) : (
                <p className="text-xs text-gray-400">
                  Översta lagret i listan hamnar överst i kartan.
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Stäng
          </button>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs font-medium text-green-600">Sparat</span>}
            <button
              type="button"
              onClick={saveDraft}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Spara karta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
