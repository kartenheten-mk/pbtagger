import type { AppConfig, MapConfig, WmsBackgroundMap } from '../types';

export const APP_CONFIG_VERSION = 1;
export const CONFIG_FILE_NAME = 'config.json';

type StrictWmsBackgroundMap = Omit<WmsBackgroundMap, 'layers'> & {
  layers: [string, ...string[]];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function buildDefaultAppConfig(): AppConfig {
  return {
    version: APP_CONFIG_VERSION,
    map: {
      activeBackgroundMapId: null,
      backgroundMaps: [],
    },
  };
}

export function normalizeLayerNames(value: unknown): string[] {
  const rawLayers = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,]/)
      : [];

  const seen = new Set<string>();
  const layers: string[] = [];

  for (const layer of rawLayers) {
    if (typeof layer !== 'string') continue;
    const trimmed = layer.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    layers.push(trimmed);
  }

  return layers;
}

function normalizeBackgroundMap(value: unknown): WmsBackgroundMap | null {
  if (!isRecord(value)) return null;
  if (value.type !== 'wms') return null;

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const url = typeof value.url === 'string' ? value.url.trim() : '';
  const layers = normalizeLayerNames(value.layers);

  if (!id || !name || !isHttpUrl(url) || layers.length === 0) {
    return null;
  }

  return { id, type: 'wms', name, url, layers };
}

export function normalizeAppConfig(value: unknown): AppConfig {
  if (!isRecord(value)) return buildDefaultAppConfig();

  const mapValue = isRecord(value.map) ? value.map : {};
  const seenIds = new Set<string>();
  const backgroundMaps: WmsBackgroundMap[] = [];

  if (Array.isArray(mapValue.backgroundMaps)) {
    for (const item of mapValue.backgroundMaps) {
      const normalized = normalizeBackgroundMap(item);
      if (!normalized || seenIds.has(normalized.id)) continue;
      seenIds.add(normalized.id);
      backgroundMaps.push(normalized);
    }
  }

  const activeBackgroundMapId =
    typeof mapValue.activeBackgroundMapId === 'string' &&
    backgroundMaps.some((map) => map.id === mapValue.activeBackgroundMapId)
      ? mapValue.activeBackgroundMapId
      : null;

  return {
    version: APP_CONFIG_VERSION,
    map: {
      activeBackgroundMapId,
      backgroundMaps,
    },
  };
}

function requireString(
  value: unknown,
  path: string,
  { allowEmpty = false }: { allowEmpty?: boolean } = {}
): string {
  if (typeof value !== 'string') {
    throw new Error(`${path} måste vara en text.`);
  }
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) {
    throw new Error(`${path} får inte vara tom.`);
  }
  return trimmed;
}

function parseWmsBackgroundMap(value: unknown, path: string): StrictWmsBackgroundMap {
  if (!isRecord(value)) {
    throw new Error(`${path} måste vara ett objekt.`);
  }
  if (value.type !== 'wms') {
    throw new Error(`${path}.type måste vara "wms".`);
  }

  const id = requireString(value.id, `${path}.id`);
  const name = requireString(value.name, `${path}.name`);
  const url = requireString(value.url, `${path}.url`);
  if (!isHttpUrl(url)) {
    throw new Error(`${path}.url måste vara en http- eller https-adress.`);
  }

  const layers = normalizeLayerNames(value.layers);
  if (layers.length === 0) {
    throw new Error(`${path}.layers måste innehålla minst ett lagernamn.`);
  }

  return {
    id,
    type: 'wms',
    name,
    url,
    layers: layers as [string, ...string[]],
  };
}

function parseMapConfig(value: unknown): MapConfig {
  if (!isRecord(value)) {
    throw new Error('map måste vara ett objekt.');
  }
  if (!Array.isArray(value.backgroundMaps)) {
    throw new Error('map.backgroundMaps måste vara en lista.');
  }

  const backgroundMaps: WmsBackgroundMap[] = [];
  const seenIds = new Set<string>();

  value.backgroundMaps.forEach((item, index) => {
    const parsed = parseWmsBackgroundMap(item, `map.backgroundMaps[${index}]`);
    if (seenIds.has(parsed.id)) {
      throw new Error(`map.backgroundMaps[${index}].id är duplicerad.`);
    }
    seenIds.add(parsed.id);
    backgroundMaps.push(parsed);
  });

  const rawActive = value.activeBackgroundMapId;
  if (rawActive !== null && typeof rawActive !== 'string') {
    throw new Error('map.activeBackgroundMapId måste vara null eller en text.');
  }

  const activeBackgroundMapId =
    typeof rawActive === 'string' &&
    backgroundMaps.some((map) => map.id === rawActive)
      ? rawActive
      : null;

  return { activeBackgroundMapId, backgroundMaps };
}

export function parseAppConfig(value: unknown): AppConfig {
  if (!isRecord(value)) {
    throw new Error(`${CONFIG_FILE_NAME} måste innehålla ett objekt.`);
  }
  if (value.version !== APP_CONFIG_VERSION) {
    throw new Error(`config-version ${String(value.version)} stöds inte.`);
  }

  return {
    version: APP_CONFIG_VERSION,
    map: parseMapConfig(value.map),
  };
}

export function serializeAppConfig(config: unknown): string {
  return JSON.stringify(normalizeAppConfig(config), null, 2);
}
