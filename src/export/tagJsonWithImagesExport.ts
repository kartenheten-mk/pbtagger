import PizZip from 'pizzip';
import type { DocModel, DocRun } from '../types';
import { geometriesToGeoJson } from '../geometry/geoJsonConverter';
import {
  buildTagJsonExport,
  buildTagJsonExportFileName,
  type BuildTagJsonExportArgs,
  type TagJsonExport,
} from './tagJsonExport';

const TAGS_JSON_PATH = 'tags.json';
const GEOMETRIES_GEOJSON_PATH = 'geometries.geojson';
const IMAGES_DIRECTORY = 'images';

type GeoJsonFeatureCollection = ReturnType<typeof geometriesToGeoJson>;
type BaseExportedTag = TagJsonExport['tags'][number];

export interface ExportedImageReference {
  path: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
}

export interface TagJsonImageSummary {
  directory: typeof IMAGES_DIRECTORY;
  imageTagCount: number;
  exportedImageCount: number;
  missingImageCount: number;
}

export interface TagJsonGeometrySummary {
  path: typeof GEOMETRIES_GEOJSON_PATH;
  linkedGeometryCount: number;
  featureCount: number;
  missingGeometryReferenceCount: number;
}

export interface TagJsonAssetSummary {
  geometries: TagJsonGeometrySummary;
  images: TagJsonImageSummary;
}

export type TagJsonWithImagesExport = Omit<TagJsonExport, 'schemaVersion' | 'tags'> & {
  schemaVersion: 2;
  assets: TagJsonAssetSummary;
  tags: Array<
    Omit<BaseExportedTag, 'geometries'> & {
      image: ExportedImageReference | null;
      missingImage: boolean;
    }
  >;
};

export interface BuildTagJsonWithImagesExportArgs extends BuildTagJsonExportArgs {
  docModel: DocModel;
}

interface ImagePayload {
  data: string | Uint8Array;
  options?: {
    base64?: boolean;
    binary?: boolean;
  };
  mimeType: string;
  byteLength: number;
}

interface ImageFile extends ExportedImageReference {
  data: string | Uint8Array;
  options?: {
    base64?: boolean;
    binary?: boolean;
  };
}

export interface TagJsonWithImagesPackage {
  exportJson: TagJsonWithImagesExport;
  geometryGeoJson: GeoJsonFeatureCollection;
  imageFiles: ImageFile[];
}

function findRun(docModel: DocModel, paragraphIndex: number, runId: string | null): DocRun | null {
  if (!runId) return null;
  const paragraph = docModel.paragraphs[paragraphIndex];
  return paragraph?.runs.find((run) => run.id === runId) ?? null;
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg';
    case 'image/gif':
      return '.gif';
    case 'image/svg+xml':
      return '.svg';
    case 'image/webp':
      return '.webp';
    case 'image/bmp':
      return '.bmp';
    case 'image/tiff':
      return '.tif';
    default: {
      const subtype = mimeType.split('/')[1]?.split(';')[0]?.trim();
      return subtype ? `.${subtype.replace(/[^a-z0-9]+/gi, '-')}` : '.bin';
    }
  }
}

function safeFileStem(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'image';
}

function uniqueImagePath(tagUuid: string, mimeType: string, usedPaths: Set<string>): string {
  const extension = extensionForMimeType(mimeType);
  const stem = safeFileStem(tagUuid);
  let path = `${IMAGES_DIRECTORY}/${stem}${extension}`;
  let suffix = 2;

  while (usedPaths.has(path)) {
    path = `${IMAGES_DIRECTORY}/${stem}-${suffix}${extension}`;
    suffix += 1;
  }

  usedPaths.add(path);
  return path;
}

function base64ByteLength(base64: string): number {
  const clean = base64.replace(/\s/g, '');
  if (!clean) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function textByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function parseDataUri(dataUri: string, fallbackMimeType: string): ImagePayload | null {
  if (!dataUri.startsWith('data:')) return null;

  const commaIndex = dataUri.indexOf(',');
  if (commaIndex < 0) return null;

  const meta = dataUri.slice(5, commaIndex);
  const encodedData = dataUri.slice(commaIndex + 1);
  const metaParts = meta.split(';').filter(Boolean);
  const mimeType = metaParts.find((part) => part.toLowerCase() !== 'base64') ?? fallbackMimeType;
  const isBase64 = metaParts.some((part) => part.toLowerCase() === 'base64');

  if (isBase64) {
    const base64Data = decodeURIComponent(encodedData).replace(/\s/g, '');
    return {
      data: base64Data,
      options: { base64: true, binary: true },
      mimeType,
      byteLength: base64ByteLength(base64Data),
    };
  }

  const text = decodeURIComponent(encodedData);
  return {
    data: text,
    mimeType,
    byteLength: textByteLength(text),
  };
}

function imagePayloadFromRun(run: DocRun): ImagePayload | null {
  const fallbackMimeType = run.imageMime ?? 'image/jpeg';

  if (run.imageData) {
    return {
      data: run.imageData,
      mimeType: fallbackMimeType,
      byteLength: run.imageData.byteLength,
    };
  }

  if (run.imageUrl) {
    return parseDataUri(run.imageUrl, fallbackMimeType);
  }

  return null;
}

function omitEmbeddedGeometries(tag: BaseExportedTag): Omit<BaseExportedTag, 'geometries'> {
  const tagWithoutEmbeddedGeometries = { ...tag };
  delete (tagWithoutEmbeddedGeometries as Partial<BaseExportedTag>).geometries;
  return tagWithoutEmbeddedGeometries;
}

function buildGeometryGeoJson(
  tags: BaseExportedTag[],
  geometries: BuildTagJsonExportArgs['geometries']
): {
  geometryGeoJson: GeoJsonFeatureCollection;
  geometryAssets: TagJsonGeometrySummary;
} {
  const geometryById = new Map(geometries.map((geometry) => [geometry.uuid, geometry]));
  const linkedGeometryIds: string[] = [];
  const seenGeometryIds = new Set<string>();
  let missingGeometryReferenceCount = 0;

  for (const tag of tags) {
    for (const geometryId of tag.geometryIds) {
      const geometry = geometryById.get(geometryId);
      if (!geometry) {
        missingGeometryReferenceCount += 1;
        continue;
      }

      if (!seenGeometryIds.has(geometry.uuid)) {
        seenGeometryIds.add(geometry.uuid);
        linkedGeometryIds.push(geometry.uuid);
      }
    }
  }

  const linkedGeometries = linkedGeometryIds
    .map((geometryId) => geometryById.get(geometryId))
    .filter((geometry): geometry is NonNullable<typeof geometry> => !!geometry);

  const baseGeoJson = geometriesToGeoJson(linkedGeometries);
  const geometryGeoJson: GeoJsonFeatureCollection = {
    ...baseGeoJson,
    features: baseGeoJson.features.map((feature) => ({
      type: feature.type,
      id: feature.id,
      geometry: feature.geometry,
      properties: {},
    })),
  };

  return {
    geometryGeoJson,
    geometryAssets: {
      path: GEOMETRIES_GEOJSON_PATH,
      linkedGeometryCount: linkedGeometryIds.length,
      featureCount: geometryGeoJson.features.length,
      missingGeometryReferenceCount,
    },
  };
}

export function buildTagJsonWithImagesPackage({
  docModel,
  ...tagExportArgs
}: BuildTagJsonWithImagesExportArgs): TagJsonWithImagesPackage {
  const baseExport = buildTagJsonExport(tagExportArgs);
  const { geometryGeoJson, geometryAssets } = buildGeometryGeoJson(
    baseExport.tags,
    tagExportArgs.geometries
  );
  const imageFiles: ImageFile[] = [];
  const usedPaths = new Set<string>();
  let imageTagCount = 0;
  let missingImageCount = 0;

  const tags = baseExport.tags.map((tag) => {
    const tagWithoutEmbeddedGeometries = omitEmbeddedGeometries(tag);

    if (tag.targetType !== 'image') {
      return {
        ...tagWithoutEmbeddedGeometries,
        image: null,
        missingImage: false,
      };
    }

    imageTagCount += 1;

    const run = findRun(docModel, tag.paragraphIndex, tag.runId);
    const payload = run?.isImage ? imagePayloadFromRun(run) : null;

    if (!payload) {
      missingImageCount += 1;
      return {
        ...tagWithoutEmbeddedGeometries,
        image: null,
        missingImage: true,
      };
    }

    const path = uniqueImagePath(tag.uuid, payload.mimeType, usedPaths);
    const fileName = path.split('/').pop() ?? path;

    const imageReference: ExportedImageReference = {
      path,
      fileName,
      mimeType: payload.mimeType,
      byteLength: payload.byteLength,
    };

    imageFiles.push({
      ...imageReference,
      data: payload.data,
      options: payload.options,
    });

    return {
      ...tagWithoutEmbeddedGeometries,
      image: imageReference,
      missingImage: false,
    };
  });

  return {
    exportJson: {
      ...baseExport,
      schemaVersion: 2,
      assets: {
        geometries: geometryAssets,
        images: {
          directory: IMAGES_DIRECTORY,
          imageTagCount,
          exportedImageCount: imageFiles.length,
          missingImageCount,
        },
      },
      tags,
    },
    geometryGeoJson,
    imageFiles,
  };
}

export function buildTagJsonWithImagesZip(args: BuildTagJsonWithImagesExportArgs): Blob {
  const { exportJson, geometryGeoJson, imageFiles } = buildTagJsonWithImagesPackage(args);
  const zip = new PizZip();

  zip.file(TAGS_JSON_PATH, JSON.stringify(exportJson, null, 2));
  zip.file(GEOMETRIES_GEOJSON_PATH, JSON.stringify(geometryGeoJson, null, 2));

  for (const imageFile of imageFiles) {
    zip.file(imageFile.path, imageFile.data, imageFile.options);
  }

  return zip.generate({
    type: 'blob',
    compression: 'DEFLATE',
    mimeType: 'application/zip',
  });
}

export function buildTagJsonWithImagesZipFileName(fileName: string): string {
  return buildTagJsonExportFileName(fileName).replace(/\.json$/i, '.zip');
}