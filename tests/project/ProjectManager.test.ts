/** @vitest-environment jsdom */

import PizZip from 'pizzip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveAs } from 'file-saver';
import { buildDefaultAppConfig } from '../../src/config/appConfig';
import type { AppConfig } from '../../src/types';

const { parseDocxMock, getGeometryDocMock } = vi.hoisted(() => ({
  parseDocxMock: vi.fn(),
  getGeometryDocMock: vi.fn(),
}));

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

vi.mock('../../src/docx/DocxParser', () => ({
  parseDocx: parseDocxMock,
}));

vi.mock('../../src/geometry/geometryDb', () => ({
  getGeometryDoc: getGeometryDocMock,
}));

import { exportProject, importProject } from '../../src/project/ProjectManager';

const docModel = { paragraphs: [] };

const appConfig: AppConfig = {
  ...buildDefaultAppConfig(),
  map: {
    activeBackgroundMapId: 'wms-1',
    backgroundMaps: [
      {
        id: 'wms-1',
        type: 'wms',
        name: 'Kommun WMS',
        url: 'https://example.test/wms',
        layers: ['layer_a', 'layer_b'],
      },
    ],
  },
};

function makeProjectFile(config?: AppConfig): File {
  const zip = new PizZip();
  zip.file(
    'project.json',
    JSON.stringify({
      version: 1,
      fileName: 'Planbeskrivning.docx',
      tags: [],
      geometries: [],
      activeGeometryDocId: null,
    })
  );
  zip.file('document.docx', new Uint8Array([80, 75, 3, 4]).buffer);
  if (config) {
    zip.file('config.json', JSON.stringify(config));
  }
  const blob = zip.generate({ type: 'blob' });
  return new File([blob], 'Planbeskrivning.pbproject');
}

describe('ProjectManager config.json', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseDocxMock.mockResolvedValue({ docModel });
    getGeometryDocMock.mockResolvedValue(null);
  });

  it('exports config.json at the project zip root', async () => {
    await exportProject(
      'Planbeskrivning.docx',
      new Uint8Array([80, 75, 3, 4]).buffer,
      [],
      [],
      null,
      appConfig
    );

    expect(saveAs).toHaveBeenCalledTimes(1);
    const [blob, fileName] = vi.mocked(saveAs).mock.calls[0];
    expect(fileName).toBe('Planbeskrivning.pbproject');

    const zip = new PizZip(await (blob as Blob).arrayBuffer());
    const configFile = zip.file('config.json');
    expect(configFile).toBeTruthy();
    expect(JSON.parse(configFile!.asText())).toEqual(appConfig);
  });

  it('imports config.json when present', async () => {
    const imported = await importProject(makeProjectFile(appConfig));

    expect(imported.fileName).toBe('Planbeskrivning.docx');
    expect(imported.docModel).toBe(docModel);
    expect(imported.appConfig).toEqual(appConfig);
  });

  it('uses default config for older projects without config.json', async () => {
    const imported = await importProject(makeProjectFile());

    expect(imported.appConfig).toEqual(buildDefaultAppConfig());
  });
});
