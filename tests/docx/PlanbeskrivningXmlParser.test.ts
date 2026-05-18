/**
 * Unit tests for PlanbeskrivningXmlParser — focusing on the multi-geometry
 * grouping logic, especially the prefix-matching that handles the case where
 * a 40-character (max-length) base identitet is truncated before the _gN
 * suffix is appended by the builder.
 */
import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import { extractPlanbeskrivningFromZip } from '../../src/docx/PlanbeskrivningXmlParser';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLANBESKRIVNING_NS =
  'http://namespace.lantmateriet.se/distribution/geodatakatalog/planbeskrivning/v2';
const LMG_NS = 'http://namespace.lantmateriet.se/distribution/geometri/v2';
const GML_NS = 'http://www.opengis.net/gml/3.2';

/** A simple polygon GML element for testing. */
const POLYGON_GEO = `<lmg:Yta xmlns:lmg="${LMG_NS}" xmlns:gml="${GML_NS}">
        <gml:Polygon srsName="urn:ogc:def:crs:EPSG::3006">
          <gml:exterior>
            <gml:LinearRing>
              <gml:posList>6762838 474162 6762860 474137 6762872 474120 6762838 474162</gml:posList>
            </gml:LinearRing>
          </gml:exterior>
        </gml:Polygon>
      </lmg:Yta>`;

/** Build a minimal but valid Planbeskrivning XML string with the given Omfattning blocks. */
function buildXml(omfBlocks: { identitet: string; geoXml: string }[]): string {
  const blocks = omfBlocks
    .map(
      ({ identitet, geoXml }) => `
  <Omfattning>
    <identitet>${identitet}</identitet>
    <Lage>${geoXml}</Lage>
    <Indelning>
      <tema>genomförandefrågor</tema>
      <grupp>tekniska frågor</grupp>
    </Indelning>
  </Omfattning>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Planbeskrivning xmlns="${PLANBESKRIVNING_NS}"
                 xmlns:lmg="${LMG_NS}"
                 xmlns:gml="${GML_NS}">
  <objektidentitet>12345678-1234-1234-1234-123456789012</objektidentitet>
  <objektversion>1</objektversion>
  <versionGiltigFran>2022-11-17T14:24:34.123+01:00</versionGiltigFran>
  <detaljplansreferens>12345678-cafe-cafe-cafe-123456789012</detaljplansreferens>
  <Objektmetadata>
    <programvara>Test</programvara>
    <programvaruversion>1.0</programvaruversion>
  </Objektmetadata>
  <arkividentitetKommun></arkividentitetKommun>
  ${blocks}
</Planbeskrivning>`;
}

/** Wrap XML in a PizZip so extractPlanbeskrivningFromZip can find it. */
function zipWith(xml: string): PizZip {
  const zip = new PizZip();
  zip.file('customXml/item1.xml', xml);
  return zip;
}

/**
 * Replicate the builder's deriveGeoIdentitet logic so tests can produce the
 * same derived identiteter the builder would generate.
 */
function deriveGeoIdentitet(baseIdentitet: string, geoIndex: number): string {
  const suffix = `_g${geoIndex}`;
  return baseIdentitet.slice(0, 40 - suffix.length) + suffix;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PlanbeskrivningXmlParser — multi-geometry grouping', () => {
  describe('short base identitet (no truncation)', () => {
    it('groups base + _g2 + _g3 under the base key', () => {
      const base = 'ShortBase';
      const g2 = deriveGeoIdentitet(base, 2); // 'ShortBase_g2'
      const g3 = deriveGeoIdentitet(base, 3); // 'ShortBase_g3'

      const result = extractPlanbeskrivningFromZip(
        zipWith(buildXml([
          { identitet: base, geoXml: POLYGON_GEO },
          { identitet: g2, geoXml: POLYGON_GEO },
          { identitet: g3, geoXml: POLYGON_GEO },
        ]))
      );

      expect(result).not.toBeNull();
      expect(result!.geometries).toHaveLength(3);
      expect(new Set(result!.geometries.map((g) => g.source))).toEqual(new Set(['docx_gml']));
      expect(result!.identitetToGeometryUuid.size).toBe(1);
      expect(result!.identitetToGeometryUuid.get(base)).toHaveLength(3);
    });
  });

  describe('max-length base identitet (40 chars — truncation case)', () => {
    it('groups 4 geometries under the 40-char base even though derived identiteter are truncated', () => {
      // Exactly 40 chars: base identitet at the PLANB-005 maximum
      const base40 = 'Motivtilldetaljplanens_88c9499f_a36573f1';
      expect(base40.length).toBe(40);

      // Builder truncates base to (40 - suffixLen) chars, then appends suffix
      const g2 = deriveGeoIdentitet(base40, 2); // 37 + '_g2' = 40 chars
      const g3 = deriveGeoIdentitet(base40, 3); // 37 + '_g3' = 40 chars
      const g4 = deriveGeoIdentitet(base40, 4); // 37 + '_g4' = 40 chars

      // Confirm the derived forms do NOT end with the full base (truncation happened)
      expect(g2.replace(/_g\d+$/, '')).not.toBe(base40);
      // But the base STARTS WITH the stripped prefix
      expect(base40.startsWith(g2.replace(/_g\d+$/, ''))).toBe(true);

      const result = extractPlanbeskrivningFromZip(
        zipWith(buildXml([
          { identitet: base40, geoXml: POLYGON_GEO },
          { identitet: g2, geoXml: POLYGON_GEO },
          { identitet: g3, geoXml: POLYGON_GEO },
          { identitet: g4, geoXml: POLYGON_GEO },
        ]))
      );

      expect(result).not.toBeNull();
      expect(result!.geometries).toHaveLength(4);

      // All 4 UUIDs must be grouped under the full 40-char base key
      expect(result!.identitetToGeometryUuid.size).toBe(1);
      const uuids = result!.identitetToGeometryUuid.get(base40);
      expect(uuids).toBeDefined();
      expect(uuids!).toHaveLength(4);
    });
  });

  describe('multiple independent tags', () => {
    it('groups each tag\'s geometries independently without cross-contamination', () => {
      const baseA = 'TagA';
      const baseB = 'TagB';

      const result = extractPlanbeskrivningFromZip(
        zipWith(buildXml([
          { identitet: baseA, geoXml: POLYGON_GEO },
          { identitet: deriveGeoIdentitet(baseA, 2), geoXml: POLYGON_GEO },
          { identitet: baseB, geoXml: POLYGON_GEO },
          { identitet: deriveGeoIdentitet(baseB, 2), geoXml: POLYGON_GEO },
          { identitet: deriveGeoIdentitet(baseB, 3), geoXml: POLYGON_GEO },
        ]))
      );

      expect(result).not.toBeNull();
      expect(result!.geometries).toHaveLength(5);
      expect(result!.identitetToGeometryUuid.size).toBe(2);
      expect(result!.identitetToGeometryUuid.get(baseA)).toHaveLength(2);
      expect(result!.identitetToGeometryUuid.get(baseB)).toHaveLength(3);
    });
  });

  describe('single geometry (no _gN suffix)', () => {
    it('stores a single UUID as a length-1 array', () => {
      const base = 'SingleGeometryTag';

      const result = extractPlanbeskrivningFromZip(
        zipWith(buildXml([{ identitet: base, geoXml: POLYGON_GEO }]))
      );

      expect(result).not.toBeNull();
      expect(result!.identitetToGeometryUuid.size).toBe(1);
      const uuids = result!.identitetToGeometryUuid.get(base);
      expect(uuids).toBeDefined();
      expect(uuids!).toHaveLength(1);
    });
  });

  describe('Omfattning without GML geometry (planomrade)', () => {
    it('is excluded from identitetToGeometryUuid but tracked as planomrade fallback', () => {
      const base = 'NoGeoTag';
      const xml = buildXml([
        { identitet: base, geoXml: '<planomrade>Ja</planomrade>' },
      ]);

      const result = extractPlanbeskrivningFromZip(zipWith(xml));

      expect(result).not.toBeNull();
      expect(result!.geometries).toHaveLength(0);
      expect(result!.identitetToGeometryUuid.size).toBe(0);
      expect(result!.planomradeIdentiteter.has(base)).toBe(true);
    });

    it('groups derived GML geometries under a base identitet that only has planomrade', () => {
      const base = 'PlanomradeBaseWithGml';
      const g2 = deriveGeoIdentitet(base, 2);
      const xml = buildXml([
        { identitet: base, geoXml: '<planomrade>Ja</planomrade>' },
        { identitet: g2, geoXml: POLYGON_GEO },
      ]);

      const result = extractPlanbeskrivningFromZip(zipWith(xml));

      expect(result).not.toBeNull();
      expect(result!.geometries).toHaveLength(1);
      expect(result!.planomradeIdentiteter.has(base)).toBe(true);
      expect(result!.identitetToGeometryUuid.get(base)).toHaveLength(1);
    });
  });
});
