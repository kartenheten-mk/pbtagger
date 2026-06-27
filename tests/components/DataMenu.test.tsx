/** @vitest-environment jsdom */

import React from 'react';
import PizZip from 'pizzip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { saveAs } from 'file-saver';
import { DataMenu } from '../../src/components/DataMenu';
import { exportDocx } from '../../src/docx/DocxExporter';
import { useDocumentStore } from '../../src/store/useDocumentStore';
import { buildDefaultAppConfig } from '../../src/config/appConfig';
import type { AppConfig, Category, DocModel, Geometry, Tag } from '../../src/types';

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

vi.mock('../../src/docx/DocxExporter', () => ({
  exportDocx: vi.fn(),
}));

const docModel: DocModel = {
  paragraphs: [],
};

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    uuid: 'tag-1',
    categoryId: 'detaljplanens-syfte--syfte',
    targetType: 'text',
    text: 'Markerad text',
    paragraphIndex: 0,
    startOffset: 0,
    endOffset: 13,
    createdAt: '2026-05-30T10:00:00.000Z',
    ...overrides,
  };
}

function makeGeometry(overrides: Partial<Geometry> = {}): Geometry {
  return {
    uuid: 'geo-1',
    name: 'Planbestämmelse',
    type: 'point',
    coordinates: [18.1, 59.3],
    crs: 'EPSG:4326',
    featureType: 'användningsbestämmelse',
    sourceDocId: 'plan-1',
    source: 'json',
    properties: { bestammelseformulering: 'Bostäder' },
    ...overrides,
  };
}

function resetStore(overrides: Partial<ReturnType<typeof useDocumentStore.getState>> = {}) {
  useDocumentStore.setState({
    documentId: 'doc-1',
    zipBuffer: new Uint8Array([80, 75, 3, 4]).buffer,
    docModel,
    fileName: 'Planbeskrivning.docx',
    tags: [],
    geometries: [],
    selectedTagUuid: null,
    linkingTagUuid: null,
    pendingSelection: null,
    showTags: true,
    activeGeometryDocId: null,
    planbeskrivningConfig: null,
    enforcePlanbeskrivningCompliance: true,
    appConfig: buildDefaultAppConfig(),
    ...overrides,
  });
  useDocumentStore.temporal.getState().clear();
}

function openMenu(categories?: Category[]) {
  const result = render(<DataMenu categories={categories} />);
  fireEvent.click(screen.getByRole('button', { name: 'Data' }));
  return result;
}

function makeZipBuffer(): ArrayBuffer {
  const zip = new PizZip();
  zip.file('word/document.xml', '<w:document />');
  return zip.generate({ type: 'arraybuffer' });
}

describe('DataMenu export grouping', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    resetStore();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('groups export actions by original files, enriched outputs, and project', () => {
    openMenu();

    expect(screen.getByText('Original')).toBeTruthy();
    expect(screen.getByText('Med taggar och motiv')).toBeTruthy();
    expect(screen.getByText('Projekt')).toBeTruthy();
    expect(screen.getByText('Konfiguration')).toBeTruthy();
    expect(screen.getByText('Exportinställningar')).toBeTruthy();

    expect(screen.getByRole('button', { name: /Exportera originaldokument/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Exportera originalgeometri/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Exportera taggat dokument/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Exportera taggar/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Exportera geometri med motiv/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Exportera hela projektet/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Importera config\.json/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Exportera config\.json/i })).toBeTruthy();
  });

  it('moves action descriptions into hover tooltips instead of visible helper text', () => {
    openMenu();

    const originalDocumentDescription =
      'Ladda ner den inlästa .docx-filen utan nya taggar eller exportmetadata.';
    const originalGeometryDescription =
      'Ladda ner geometridokumentet i originalformat.';
    const originalDocument = screen.getByRole('button', { name: /Exportera originaldokument/i });
    const originalGeometry = screen.getByRole('button', { name: /Exportera originalgeometri/i });

    expect(screen.queryByText(originalDocumentDescription)).toBeNull();
    expect(screen.queryByText(originalGeometryDescription)).toBeNull();
    expect(screen.queryByText('Ingen geometrifil laddad.')).toBeNull();
    expect(originalDocument.getAttribute('title')).toBe(originalDocumentDescription);
    expect(originalGeometry.getAttribute('title')).toBe(
      `${originalGeometryDescription} Ingen geometrifil laddad.`
    );
  });

  it('keeps Planbeskrivning export settings compact with details in tooltips', () => {
    openMenu();

    expect(screen.getByText('Exportinställningar')).toBeTruthy();
    expect(screen.getByText('Planbeskrivning v2.0')).toBeTruthy();
    expect(screen.getByText('Blockera vid fel')).toBeTruthy();
    expect(screen.queryByText('omfattningar.xml inkluderas alltid')).toBeNull();
    expect(screen.queryByText('Välj om compliance-fel ska blockera export eller inte.')).toBeNull();
    expect(screen.queryByText('Läge: Blockera export vid compliance-fel.')).toBeNull();

    expect(screen.getByRole('switch').getAttribute('title')).toBe(
      'omfattningar.xml inkluderas alltid. Export blockeras vid compliance-fel.'
    );
    const metadataButton = screen.getByRole('button', { name: 'Redigera metadata' });
    expect(metadataButton.getAttribute('title')).toBe(
      'Redigera metadata för Planbeskrivning v2.0-exporten.'
    );
    expect(metadataButton.closest('.bg-amber-50')).toBeNull();
  });

  it('keeps export disabled states tied to the right prerequisites', () => {
    resetStore({ zipBuffer: null, activeGeometryDocId: null, tags: [] });

    openMenu();

    const originalDocument = screen.getByRole('button', { name: /Exportera originaldokument/i }) as HTMLButtonElement;
    const originalGeometry = screen.getByRole('button', { name: /Exportera originalgeometri/i }) as HTMLButtonElement;
    const taggedDocument = screen.getByRole('button', { name: /Exportera taggat dokument/i }) as HTMLButtonElement;
    const tagJson = screen.getByRole('button', { name: /Exportera taggar/i }) as HTMLButtonElement;
    const geometryWithMotiv = screen.getByRole('button', { name: /Exportera geometri med motiv/i }) as HTMLButtonElement;

    expect(originalDocument.disabled).toBe(true);
    expect(originalGeometry.disabled).toBe(true);
    expect(taggedDocument.disabled).toBe(true);
    expect(tagJson.disabled).toBe(true);
    expect(geometryWithMotiv.disabled).toBe(true);
  });

  it('exports the original document without invoking tagged DOCX export', async () => {
    const zipBuffer = new Uint8Array([80, 75, 3, 4, 20]).buffer;
    resetStore({
      zipBuffer,
      fileName: 'Original.docx',
      tags: [makeTag()],
    });

    openMenu();

    fireEvent.click(screen.getByRole('button', { name: /Exportera originaldokument/i }));

    await waitFor(() => {
      expect(saveAs).toHaveBeenCalledTimes(1);
    });

    const [blob, fileName] = vi.mocked(saveAs).mock.calls[0];
    expect(fileName).toBe('Original.docx');
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(Array.from(new Uint8Array(await (blob as Blob).arrayBuffer()))).toEqual([80, 75, 3, 4, 20]);
    expect(exportDocx).not.toHaveBeenCalled();
  });

  it('exports config.json separately', async () => {
    const config: AppConfig = {
      ...buildDefaultAppConfig(),
      map: {
        activeBackgroundMapId: 'wms-1',
        backgroundMaps: [
          {
            id: 'wms-1',
            type: 'wms',
            name: 'Kommun WMS',
            url: 'https://example.test/wms',
            layers: ['layer_a'],
          },
        ],
      },
    };
    resetStore({ appConfig: config });

    openMenu();

    fireEvent.click(screen.getByRole('button', { name: /Exportera config\.json/i }));

    await waitFor(() => {
      expect(saveAs).toHaveBeenCalledTimes(1);
    });

    const [blob, fileName] = vi.mocked(saveAs).mock.calls[0];
    expect(fileName).toBe('config.json');
    expect(JSON.parse(await (blob as Blob).text())).toEqual(config);
  });

  it('exports tag JSON with categories and linked geometry', async () => {
    const category: Category = {
      id: 'detaljplanens-syfte--syfte',
      name: 'Syfte',
      level: 'grupp',
      color: '#2563eb',
      temaId: 'detaljplanens-syfte',
      temaName: 'Detaljplanens syfte',
      gruppId: 'syfte',
      gruppName: 'Syfte',
    };
    resetStore({
      fileName: 'Planbeskrivning.docx',
      activeGeometryDocId: 'plan-1',
      tags: [makeTag({ categoryId: category.id, geometryIds: ['geo-1'] })],
      geometries: [makeGeometry()],
    });

    openMenu([category]);

    fireEvent.click(screen.getByRole('button', { name: /Exportera taggar/i }));

    await waitFor(() => {
      expect(saveAs).toHaveBeenCalledTimes(1);
    });

    const [blob, fileName] = vi.mocked(saveAs).mock.calls[0];
    const json = JSON.parse(await (blob as Blob).text());

    expect(fileName).toBe('Planbeskrivning_taggar.json');
    expect((blob as Blob).type).toBe('application/json');
    expect(json).toMatchObject({
      schemaVersion: 1,
      sourceDocument: {
        fileName: 'Planbeskrivning.docx',
        activeGeometryDocId: 'plan-1',
      },
      summary: {
        tagCount: 1,
        linkedGeometryCount: 1,
      },
    });
    expect(json.summary.categories[0]).toMatchObject({
      categoryId: category.id,
      temaName: 'Detaljplanens syfte',
      tagCount: 1,
    });
    expect(json.tags[0]).toMatchObject({
      uuid: 'tag-1',
      targetType: 'text',
      categoryId: category.id,
      categoryLevel: 'grupp',
      temaName: 'Detaljplanens syfte',
      gruppName: 'Syfte',
      geometryIds: ['geo-1'],
      missingGeometryIds: [],
    });
    expect(json.tags[0].geometries[0]).toEqual({
      type: 'Point',
      coordinates: [18.1, 59.3],
    });
    expect(json.tags[0].geometries[0].properties).toBeUndefined();
  });

  it('passes supplied categories into tagged DOCX export options', async () => {
    const category: Category = {
      id: 'genomforandefragor--kommunala-fragor',
      name: 'Kommunala frågor',
      level: 'grupp',
      color: '#8b5cf6',
      temaId: 'genomforandefragor',
      temaName: 'Genomförandefrågor',
      gruppId: 'kommunala-fragor',
      gruppName: 'Kommunala frågor',
      custom: true,
    };
    resetStore({
      zipBuffer: makeZipBuffer(),
      tags: [makeTag({ categoryId: category.id })],
    });
    vi.mocked(exportDocx).mockResolvedValue(undefined);

    openMenu([category]);
    fireEvent.click(screen.getByRole('button', { name: /Exportera taggat dokument/i }));

    await waitFor(() => {
      expect(exportDocx).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(exportDocx).mock.calls[0][4]).toMatchObject({
      categories: [category],
    });
  });

  it('imports config.json without changing document data', async () => {
    const config: AppConfig = {
      ...buildDefaultAppConfig(),
      map: {
        activeBackgroundMapId: 'wms-1',
        backgroundMaps: [
          {
            id: 'wms-1',
            type: 'wms',
            name: 'Importerad WMS',
            url: 'https://example.test/wms',
            layers: ['layer_a', 'layer_b'],
          },
        ],
      },
    };
    resetStore({
      fileName: 'Keep.docx',
      tags: [makeTag()],
    });

    const { container } = openMenu();
    const input = container.querySelector<HTMLInputElement>('[data-testid="config-file-input"]');
    expect(input).toBeTruthy();

    fireEvent.change(input!, {
      target: {
        files: [new File([JSON.stringify(config)], 'config.json', { type: 'application/json' })],
      },
    });

    await waitFor(() => {
      expect(useDocumentStore.getState().appConfig).toEqual(config);
    });
    expect(useDocumentStore.getState().fileName).toBe('Keep.docx');
    expect(useDocumentStore.getState().tags).toHaveLength(1);
  });
});
