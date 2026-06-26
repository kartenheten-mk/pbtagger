import type {
  AppConfig,
  CategoryConfig,
  CustomGroup,
  CustomGroupUndergroup,
  CustomUndergroup,
  MapConfig,
  WmsBackgroundMap,
} from '../types';

export const APP_CONFIG_VERSION = 1;
export const CONFIG_FILE_NAME = 'config.json';

type StrictWmsBackgroundMap = Omit<WmsBackgroundMap, 'layers'> & {
  layers: [string, ...string[]];
};

function buildDefaultCategoryConfig(): CategoryConfig {
  return {
    customGroups: [],
    customUndergroups: [],
  };
}

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
    categories: buildDefaultCategoryConfig(),
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

function normalizeCustomGroupUndergroup(value: unknown): CustomGroupUndergroup | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!id || !name) return null;
  return { id, name };
}

function normalizeCustomGroup(value: unknown): CustomGroup | null {
  if (!isRecord(value)) return null;
  const temaId = typeof value.temaId === 'string' ? value.temaId.trim() : '';
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!temaId || !id || !name) return null;

  const seenUndergroupIds = new Set<string>();
  const undergrupper: CustomGroupUndergroup[] = [];
  if (Array.isArray(value.undergrupper)) {
    for (const item of value.undergrupper) {
      const normalized = normalizeCustomGroupUndergroup(item);
      if (!normalized || seenUndergroupIds.has(normalized.id)) continue;
      seenUndergroupIds.add(normalized.id);
      undergrupper.push(normalized);
    }
  }

  return { temaId, id, name, undergrupper };
}

function normalizeCustomUndergroup(value: unknown): CustomUndergroup | null {
  if (!isRecord(value)) return null;
  const temaId = typeof value.temaId === 'string' ? value.temaId.trim() : '';
  const gruppId = typeof value.gruppId === 'string' ? value.gruppId.trim() : '';
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!temaId || !gruppId || !id || !name) return null;
  return { temaId, gruppId, id, name };
}

function normalizeCategoryConfig(value: unknown): CategoryConfig {
  if (!isRecord(value)) return buildDefaultCategoryConfig();

  const customGroups: CustomGroup[] = [];
  const seenGroupKeys = new Set<string>();
  if (Array.isArray(value.customGroups)) {
    for (const item of value.customGroups) {
      const normalized = normalizeCustomGroup(item);
      if (!normalized) continue;
      const key = `${normalized.temaId}--${normalized.id}`;
      if (seenGroupKeys.has(key)) continue;
      seenGroupKeys.add(key);
      customGroups.push(normalized);
    }
  }

  const customUndergroups: CustomUndergroup[] = [];
  const seenUndergroupKeys = new Set<string>();
  if (Array.isArray(value.customUndergroups)) {
    for (const item of value.customUndergroups) {
      const normalized = normalizeCustomUndergroup(item);
      if (!normalized) continue;
      const key = `${normalized.temaId}--${normalized.gruppId}--${normalized.id}`;
      if (seenUndergroupKeys.has(key)) continue;
      seenUndergroupKeys.add(key);
      customUndergroups.push(normalized);
    }
  }

  return { customGroups, customUndergroups };
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
    categories: normalizeCategoryConfig(value.categories),
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

function parseCustomGroupUndergroup(
  value: unknown,
  path: string
): CustomGroupUndergroup {
  if (!isRecord(value)) {
    throw new Error(`${path} måste vara ett objekt.`);
  }
  return {
    id: requireString(value.id, `${path}.id`),
    name: requireString(value.name, `${path}.name`),
  };
}

function parseCustomGroup(value: unknown, path: string): CustomGroup {
  if (!isRecord(value)) {
    throw new Error(`${path} måste vara ett objekt.`);
  }
  if (!Array.isArray(value.undergrupper)) {
    throw new Error(`${path}.undergrupper måste vara en lista.`);
  }

  const undergrupper: CustomGroupUndergroup[] = [];
  const seenIds = new Set<string>();
  value.undergrupper.forEach((item, index) => {
    const parsed = parseCustomGroupUndergroup(item, `${path}.undergrupper[${index}]`);
    if (seenIds.has(parsed.id)) {
      throw new Error(`${path}.undergrupper[${index}].id är duplicerad.`);
    }
    seenIds.add(parsed.id);
    undergrupper.push(parsed);
  });

  return {
    temaId: requireString(value.temaId, `${path}.temaId`),
    id: requireString(value.id, `${path}.id`),
    name: requireString(value.name, `${path}.name`),
    undergrupper,
  };
}

function parseCustomUndergroup(value: unknown, path: string): CustomUndergroup {
  if (!isRecord(value)) {
    throw new Error(`${path} måste vara ett objekt.`);
  }
  return {
    temaId: requireString(value.temaId, `${path}.temaId`),
    gruppId: requireString(value.gruppId, `${path}.gruppId`),
    id: requireString(value.id, `${path}.id`),
    name: requireString(value.name, `${path}.name`),
  };
}

function parseCategoryConfig(value: unknown): CategoryConfig {
  if (value === undefined) return buildDefaultCategoryConfig();
  if (!isRecord(value)) {
    throw new Error('categories måste vara ett objekt.');
  }
  if (!Array.isArray(value.customGroups)) {
    throw new Error('categories.customGroups måste vara en lista.');
  }
  if (!Array.isArray(value.customUndergroups)) {
    throw new Error('categories.customUndergroups måste vara en lista.');
  }

  const customGroups: CustomGroup[] = [];
  const seenGroupKeys = new Set<string>();
  value.customGroups.forEach((item, index) => {
    const parsed = parseCustomGroup(item, `categories.customGroups[${index}]`);
    const key = `${parsed.temaId}--${parsed.id}`;
    if (seenGroupKeys.has(key)) {
      throw new Error(`categories.customGroups[${index}].id är duplicerad för valt tema.`);
    }
    seenGroupKeys.add(key);
    customGroups.push(parsed);
  });

  const customUndergroups: CustomUndergroup[] = [];
  const seenUndergroupKeys = new Set<string>();
  value.customUndergroups.forEach((item, index) => {
    const parsed = parseCustomUndergroup(item, `categories.customUndergroups[${index}]`);
    const key = `${parsed.temaId}--${parsed.gruppId}--${parsed.id}`;
    if (seenUndergroupKeys.has(key)) {
      throw new Error(`categories.customUndergroups[${index}].id är duplicerad för vald grupp.`);
    }
    seenUndergroupKeys.add(key);
    customUndergroups.push(parsed);
  });

  return { customGroups, customUndergroups };
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
    categories: parseCategoryConfig(value.categories),
  };
}

export function serializeAppConfig(config: unknown): string {
  return JSON.stringify(normalizeAppConfig(config), null, 2);
}
