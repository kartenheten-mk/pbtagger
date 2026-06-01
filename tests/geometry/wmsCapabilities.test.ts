/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import {
  buildWmsCapabilitiesUrl,
  fetchWmsCapabilities,
  parseWmsCapabilitiesXml,
} from '../../src/geometry/wmsCapabilities';

const capabilitiesXml = `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0">
  <Capability>
    <Layer>
      <Title>Root</Title>
      <Layer queryable="1">
        <Name>workspace:plan</Name>
        <Title>Detaljplan</Title>
        <Abstract>Plan polygons</Abstract>
      </Layer>
      <Layer>
        <Title>Group only</Title>
        <Layer>
          <Name>workspace:background</Name>
          <Title>Bakgrundskarta</Title>
        </Layer>
      </Layer>
      <Layer>
        <Name>workspace:plan</Name>
        <Title>Duplicate should be ignored</Title>
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`;

describe('WMS capabilities helpers', () => {
  it('builds a GetCapabilities URL while preserving existing custom query params', () => {
    expect(
      buildWmsCapabilitiesUrl('https://example.test/geoserver/wms?REQUEST=GetMap&foo=bar')
    ).toBe('https://example.test/geoserver/wms?foo=bar&SERVICE=WMS&REQUEST=GetCapabilities');
  });

  it('parses named layers recursively and deduplicates layer names', () => {
    expect(parseWmsCapabilitiesXml(capabilitiesXml)).toEqual([
      {
        name: 'workspace:plan',
        title: 'Detaljplan',
        abstract: 'Plan polygons',
      },
      {
        name: 'workspace:background',
        title: 'Bakgrundskarta',
      },
    ]);
  });

  it('fetches and parses GetCapabilities XML', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(capabilitiesXml),
    });

    await expect(fetchWmsCapabilities('https://example.test/wms', fetchMock)).resolves.toEqual([
      expect.objectContaining({ name: 'workspace:plan' }),
      expect.objectContaining({ name: 'workspace:background' }),
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/wms?SERVICE=WMS&REQUEST=GetCapabilities',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: expect.stringContaining('application/xml') }),
      })
    );
  });
});