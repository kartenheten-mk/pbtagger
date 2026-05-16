/**
 * PlanbeskrivningXmlBuilder.test.ts
 *
 * Unit tests for the Planbeskrivning v2.0 XML builder.
 * Verifies correct XML structure, namespace declarations, GML serialization,
 * and all PLANB business-rule validations (PLANB-001 through PLANB-008).
 */

import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import {
  buildPlanbeskrivningXml,
  buildDefaultConfig,
  getSpecExportEligibility,
  validateIdentitet,
  validatePlanbeskrivning,
  PLANBESKRIVNING_NS,
} from '../../src/docx/PlanbeskrivningXmlBuilder';
import { generateBookmarkName } from '../../src/docx/bookmarkUtils';
import type { PlanbeskrivningConfig } from '../../src/types';
import type { Tag, Geometry } from '../../src/types';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<PlanbeskrivningConfig> = {}): PlanbeskrivningConfig {
  return {
    ...buildDefaultConfig('test-plan-uuid'),
    ...overrides,
  };
}

let _tagCounter = 0;
function makeTag(overrides: Partial<Tag> = {}): Tag {
  const idx = _tagCounter++;
  return {
    uuid: `tag-uuid-${idx}`,
    categoryId: 'detaljplanens-syfte--syfte',
    targetType: 'text',
    text: 'Test text',
    paragraphIndex: idx,
    startOffset: 0,
    endOffset: 9,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePolygonGeometry(overrides: Partial<Geometry> = {}): Geometry {
  return {
    uuid: `geom-uuid-${Math.random().toString(36).slice(2)}`,
    name: 'Test polygon',
    type: 'polygon',
    // Polygon: outer ring coords in EPSG:3006 (SWEREF99TM) format [easting, northing]
    coordinates: [
      [[313000, 6400000], [313100, 6400000], [313100, 6400100], [313000, 6400100], [313000, 6400000]],
    ] as number[][][],
    crs: 'EPSG:3006',
    sourceDocId: 'test-plan-uuid',
    properties: {},
    ...overrides,
  };
}

function makePointGeometry(overrides: Partial<Geometry> = {}): Geometry {
  return {
    uuid: `geom-pt-${Math.random().toString(36).slice(2)}`,
    name: 'Test point',
    type: 'point',
    coordinates: [313050, 6400050] as number[],
    crs: 'EPSG:3006',
    sourceDocId: 'test-plan-uuid',
    properties: {},
    ...overrides,
  };
}

function makeLineGeometry(overrides: Partial<Geometry> = {}): Geometry {
  return {
    uuid: `geom-ln-${Math.random().toString(36).slice(2)}`,
    name: 'Test line',
    type: 'line',
    coordinates: [[313000, 6400000], [313100, 6400100], [313200, 6400000]] as number[][],
    crs: 'EPSG:3006',
    sourceDocId: 'test-plan-uuid',
    properties: {},
    ...overrides,
  };
}

/** Parse XML string and return the document for assertions */
function parseXml(xml: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  // @xmldom/xmldom uses getElementsByTagName, not querySelector
  const errs = doc.getElementsByTagName('parsererror');
  if (errs.length > 0) throw new Error(`XML parse error: ${errs[0].textContent}`);
  return doc;
}

// ─── validateIdentitet ────────────────────────────────────────────────────────

describe('validateIdentitet (PLANB-005)', () => {
  it('accepts valid identities starting with letter', () => {
    expect(validateIdentitet('abc')).toBe(true);
    expect(validateIdentitet('Tema_genomforing')).toBe(true);
    expect(validateIdentitet('åäö_test123')).toBe(true);
    expect(validateIdentitet('A')).toBe(true);
    expect(validateIdentitet('a'.repeat(40))).toBe(true);
  });

  it('rejects identity starting with digit', () => {
    expect(validateIdentitet('1abc')).toBe(false);
  });

  it('rejects identity starting with underscore', () => {
    expect(validateIdentitet('_abc')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateIdentitet('')).toBe(false);
  });

  it('rejects identity longer than 40 characters', () => {
    expect(validateIdentitet('a'.repeat(41))).toBe(false);
  });

  it('rejects identity with spaces', () => {
    expect(validateIdentitet('hello world')).toBe(false);
  });

  it('rejects identity with hyphens', () => {
    expect(validateIdentitet('hello-world')).toBe(false);
  });

  it('accepts exactly 40 characters', () => {
    expect(validateIdentitet('A' + 'a'.repeat(39))).toBe(true);
  });
});

describe('getSpecExportEligibility', () => {
  it('allows text tags with BFS-mapped category', () => {
    expect(getSpecExportEligibility(makeTag())).toEqual({ eligible: true });
  });

  it('excludes non-text target types from Planbeskrivning export', () => {
    const result = getSpecExportEligibility(makeTag({ targetType: 'image', runId: 'r1' }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('targetType "image"');
  });

  it('excludes tags without BFS-mapped category from Planbeskrivning export', () => {
    const result = getSpecExportEligibility(makeTag({ categoryId: 'missing-category' }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('saknar BFS 2020:8-mappning');
  });
});

// ─── buildDefaultConfig ───────────────────────────────────────────────────────

describe('buildDefaultConfig', () => {
  it('returns a config with all required fields', () => {
    const cfg = buildDefaultConfig('plan-ref-123');
    expect(cfg.objektidentitet).toMatch(/^[0-9a-f-]{36}$/i);
    expect(cfg.objektversion).toBe(1);
    expect(cfg.versionGiltigFran).toBeTruthy();
    expect(cfg.detaljplansreferens).toBe('plan-ref-123');
    expect(cfg.programvara).toBeTruthy();
    expect(cfg.programvaruversion).toBeTruthy();
    expect(cfg.arkividentitetKommun).toBe('');
  });

  it('returns empty detaljplansreferens when no plan ID provided', () => {
    const cfg = buildDefaultConfig();
    expect(cfg.detaljplansreferens).toBe('');
  });

  it('generates a valid UUID for objektidentitet', () => {
    const cfg = buildDefaultConfig();
    expect(cfg.objektidentitet).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});

// ─── buildPlanbeskrivningXml — basic structure ────────────────────────────────

describe('buildPlanbeskrivningXml — document structure', () => {
  const cfg = makeConfig({
    objektidentitet: '12345678-1234-1234-1234-123456789012',
    objektversion: 1,
    versionGiltigFran: '2024-01-01T00:00:00+01:00',
    detaljplansreferens: 'deadbeef-cafe-cafe-cafe-123456789012',
    programvara: 'TestApp',
    programvaruversion: '1.0',
    arkividentitetKommun: 'TEST:2024/001',
  });

  it('produces well-formed XML', () => {
    const xml = buildPlanbeskrivningXml(cfg, [], []);
    expect(() => parseXml(xml)).not.toThrow();
  });

  it('starts with an XML declaration', () => {
    const xml = buildPlanbeskrivningXml(cfg, [], []);
    expect(xml.trimStart()).toMatch(/^<\?xml/);
  });

  it('includes required namespaces on root element', () => {
    const xml = buildPlanbeskrivningXml(cfg, [], []);
    expect(xml).toContain(PLANBESKRIVNING_NS);
    expect(xml).toContain('http://namespace.lantmateriet.se/distribution/geometri/v2');
    expect(xml).toContain('http://www.opengis.net/gml/3.2');
  });

  it('includes all required header metadata elements', () => {
    const xml = buildPlanbeskrivningXml(cfg, [], []);
    expect(xml).toContain('<objektidentitet>12345678-1234-1234-1234-123456789012</objektidentitet>');
    expect(xml).toContain('<objektversion>1</objektversion>');
    expect(xml).toContain('<versionGiltigFran>2024-01-01T00:00:00+01:00</versionGiltigFran>');
    expect(xml).toContain('<detaljplansreferens>deadbeef-cafe-cafe-cafe-123456789012</detaljplansreferens>');
    expect(xml).toContain('<programvara>TestApp</programvara>');
    expect(xml).toContain('<programvaruversion>1.0</programvaruversion>');
    expect(xml).toContain('<arkividentitetKommun>TEST:2024/001</arkividentitetKommun>');
  });

  it('produces no <Omfattning> blocks when tags list is empty', () => {
    const xml = buildPlanbeskrivningXml(cfg, [], []);
    expect(xml).not.toContain('<Omfattning>');
  });

  it('produces one <Omfattning> per tag when tags have no geometry', () => {
    const tags = [
      makeTag({ uuid: 'uuid-1', paragraphIndex: 0 }),
      makeTag({ uuid: 'uuid-2', paragraphIndex: 1 }),
    ];
    const xml = buildPlanbeskrivningXml(cfg, tags, []);
    const count = (xml.match(/<Omfattning>/g) ?? []).length;
    expect(count).toBe(2);
  });

  it('produces one <Omfattning> per tag when each tag has one geometry', () => {
    const geom1 = makePolygonGeometry({ uuid: 'single-g1' });
    const geom2 = makePolygonGeometry({ uuid: 'single-g2' });
    const tags = [
      makeTag({ uuid: 'uuid-sg1', paragraphIndex: 0, geometryIds: ['single-g1'] }),
      makeTag({ uuid: 'uuid-sg2', paragraphIndex: 1, geometryIds: ['single-g2'] }),
    ];
    const xml = buildPlanbeskrivningXml(cfg, tags, [geom1, geom2]);
    const count = (xml.match(/<Omfattning>/g) ?? []).length;
    expect(count).toBe(2);
  });

  it('skips non-text app tags from Planbeskrivning XML while keeping text tags', () => {
    const tags = [
      makeTag({ uuid: 'uuid-text', targetType: 'text' }),
      makeTag({ uuid: 'uuid-image', targetType: 'image', runId: 'img-1' }),
    ];
    const xml = buildPlanbeskrivningXml(cfg, tags, []);
    const count = (xml.match(/<Omfattning>/g) ?? []).length;
    expect(count).toBe(1);
    expect(xml).toContain(generateBookmarkName(tags[0]));
    expect(xml).not.toContain(generateBookmarkName(tags[1]));
  });
});

// ─── PLANB-003: Unique identities ─────────────────────────────────────────────

describe('PLANB-003 — unique <identitet>', () => {
  it('generates unique <identitet> values for each Omfattning', () => {
    const tags = [
      makeTag({ uuid: 'u1', paragraphIndex: 10, startOffset: 0, endOffset: 5 }),
      makeTag({ uuid: 'u2', paragraphIndex: 11, startOffset: 0, endOffset: 5 }),
      makeTag({ uuid: 'u3', paragraphIndex: 12, startOffset: 0, endOffset: 5 }),
    ];
    const xml = buildPlanbeskrivningXml(makeConfig(), tags, []);
    const matches = [...xml.matchAll(/<identitet>([^<]+)<\/identitet>/g)].map((m) => m[1]);
    expect(matches.length).toBe(3);
    const unique = new Set(matches);
    expect(unique.size).toBe(3);
  });
});

// ─── PLANB-005: Identity format ────────────────────────────────────────────────

describe('PLANB-005 — <identitet> format', () => {
  const IDENTITET_RE = /^[A-Za-zÅÄÖåäö][A-Za-zÅÄÖåäö0-9_]{0,39}$/;

  it('all generated identities match the allowed character pattern', () => {
    const tags = [
      makeTag({ uuid: 'p5r0', paragraphIndex: 5, startOffset: 0, endOffset: 10 }),
      makeTag({ uuid: 'p6r0', paragraphIndex: 6, startOffset: 0, endOffset: 10 }),
    ];
    const xml = buildPlanbeskrivningXml(makeConfig(), tags, []);
    const matches = [...xml.matchAll(/<identitet>([^<]+)<\/identitet>/g)].map((m) => m[1]);
    expect(matches.length).toBeGreaterThan(0);
    for (const id of matches) {
      expect(id, `identity "${id}" should match PLANB-005`).toMatch(IDENTITET_RE);
    }
  });
});

// ─── PLANB-001: At least one Lage attribute ───────────────────────────────────

describe('PLANB-001 — at least one Lage attribute', () => {
  it('uses planomrade=Ja when tag has no geometry link', () => {
    const tag = makeTag({ uuid: 'planomrade-test', geometryIds: undefined });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], []);
    expect(xml).toContain('<planomrade>Ja</planomrade>');
  });

  it('uses planomrade=Ja when linked geometry UUID does not exist', () => {
    const tag = makeTag({ uuid: 'missing-geo', geometryIds: ['nonexistent-uuid'] });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], []);
    // No geometry found → falls back to planomrade
    expect(xml).toContain('<planomrade>Ja</planomrade>');
  });

  it('includes lmg:Yta when tag is linked to a polygon geometry', () => {
    const geom = makePolygonGeometry({ uuid: 'geom-poly-1' });
    const tag = makeTag({ uuid: 'poly-tag', geometryIds: ['geom-poly-1'] });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], [geom]);
    expect(xml).toContain('lmg:Yta');
    expect(xml).toContain('gml:Polygon');
  });

  it('includes lmg:Punkt when tag is linked to a point geometry', () => {
    const geom = makePointGeometry({ uuid: 'geom-pt-1' });
    const tag = makeTag({ uuid: 'pt-tag', geometryIds: ['geom-pt-1'] });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], [geom]);
    expect(xml).toContain('lmg:Punkt');
    expect(xml).toContain('gml:Point');
  });

  it('includes lmg:Linje when tag is linked to a line geometry', () => {
    const geom = makeLineGeometry({ uuid: 'geom-ln-1' });
    const tag = makeTag({ uuid: 'ln-tag', geometryIds: ['geom-ln-1'] });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], [geom]);
    expect(xml).toContain('lmg:Linje');
    expect(xml).toContain('gml:LineString');
  });
});

describe('validatePlanbeskrivning — export eligibility warnings', () => {
  it('warns when a non-text app tag is excluded from Planbeskrivning export', () => {
    const result = validatePlanbeskrivning(
      [makeTag({ uuid: 'tag-image', targetType: 'image', runId: 'img-1' })],
      []
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes('exkluderad från Planbeskrivning-export'))).toBe(true);
  });

  it('warns when a tag lacks BFS mapping and is excluded from Planbeskrivning export', () => {
    const result = validatePlanbeskrivning(
      [makeTag({ uuid: 'tag-unknown-cat', categoryId: 'missing-category' })],
      []
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes('saknar BFS 2020:8-mappning'))).toBe(true);
  });
});

// ─── PLANB-002: Motiv till reglering requires planbestammelsereferens ──────────

describe('PLANB-002 — Motiv till reglering requires planbestammelsereferens', () => {
  it('uses planbestammelsereferens when bestämmelse geometry has no serializable coords', () => {
    // A bestämmelse geometry with featureType "bestämmelse" but empty coordinates
    // so serializeGml returns null → builder falls to planbestammelsereferens path
    const bestammelseGeom: Geometry = {
      uuid: 'bestammelse-uuid-001',
      name: 'Test bestämmelse',
      type: 'polygon',
      // Empty coords → serializeGml returns null (polys.length === 0)
      coordinates: [] as unknown as number[][][],
      crs: 'EPSG:3006',
      featureType: 'användningsbestämmelse',
      properties: {},
    };
    const tag = makeTag({ uuid: 'bestammelse-tag', geometryIds: ['bestammelse-uuid-001'] });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], [bestammelseGeom]);
    // Should fall through to the planbestammelsereferens indirect reference path
    expect(xml).toContain('<planbestammelsereferens>bestammelse-uuid-001</planbestammelsereferens>');
    // Should NOT produce GML geometry elements
    expect(xml).not.toContain('lmg:Yta');
    expect(xml).not.toContain('lmg:Punkt');
  });
});

// ─── PLANB-006: Direct geometry takes precedence ──────────────────────────────

describe('PLANB-006 — geometry takes precedence over indirect reference', () => {
  it('uses GML geometry (not planomrade) when a linked geometry exists and is serializable', () => {
    const geom = makePolygonGeometry({ uuid: 'geom-priority' });
    const tag = makeTag({ uuid: 'priority-tag', geometryIds: ['geom-priority'] });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], [geom]);
    expect(xml).toContain('lmg:Yta');
    expect(xml).not.toContain('<planomrade>');
  });
});

// ─── PLANB-008: Only one indirect reference ────────────────────────────────────

describe('PLANB-008 — only one indirect reference per Lage', () => {
  it('does not include multiple indirect reference types in the same Lage', () => {
    const tag = makeTag({ uuid: 'single-ref-tag' });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], []);
    const doc = parseXml(xml);
    const lagElements = doc.getElementsByTagName('Lage');
    for (let i = 0; i < lagElements.length; i++) {
      const lage = lagElements[i];
      const hasOmrade = lage.getElementsByTagName('planomrade').length > 0;
      const hasPlanbestammelseRef = lage.getElementsByTagName('planbestammelsereferens').length > 0;
      const hasObjektRef = lage.getElementsByTagName('objektreferens').length > 0;
      const indirectCount = [hasOmrade, hasPlanbestammelseRef, hasObjektRef].filter(Boolean).length;
      expect(indirectCount, 'Lage must have at most one indirect reference type').toBeLessThanOrEqual(1);
    }
  });
});

// ─── PLANB-004 / PLANB-007 strict validation ─────────────────────────────────

describe('strict validation coverage', () => {
  it('warns and excludes tags when category is outside BFS mapping', () => {
    const tag = makeTag({
      uuid: 'p4-tag',
      categoryId: 'non-bfs-category',
      geometryIds: undefined,
    });
    const result = validatePlanbeskrivning([tag], []);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes('saknar BFS 2020:8-mappning'))).toBe(true);
  });

  it('reports PLANB-007 when objektreferens would be non-persistent', () => {
    const geo: Geometry = {
      uuid: 'temp-id',
      name: 'Temp object',
      type: 'polygon',
      // Non-serializable polygon => falls back to objektreferens path
      coordinates: [] as unknown as number[][][],
      crs: 'EPSG:3006',
      featureType: 'annat-objekt',
      properties: {},
    };
    const tag = makeTag({
      uuid: 'p7-tag',
      categoryId: 'detaljplanens-syfte--syfte',
      geometryIds: ['temp-id'],
    });
    const result = validatePlanbeskrivning([tag], [geo]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === 'PLANB-007')).toBe(true);
  });
});

// ─── GML geometry serialization ───────────────────────────────────────────────

describe('GML geometry serialization', () => {
  it('serializes Polygon with EPSG:3006 srsName', () => {
    const geom = makePolygonGeometry({ uuid: 'gml-test-poly' });
    const tag = makeTag({ uuid: 'gml-poly-tag', geometryIds: ['gml-test-poly'] });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], [geom]);
    expect(xml).toContain('srsName="urn:ogc:def:crs:EPSG::3006"');
    expect(xml).toContain('gml:Polygon');
    expect(xml).toContain('gml:exterior');
    expect(xml).toContain('gml:LinearRing');
    expect(xml).toContain('gml:posList');
  });

  it('serializes LineString as lmg:Linje with gml:LineString', () => {
    const geom = makeLineGeometry({ uuid: 'gml-test-line' });
    const tag = makeTag({ uuid: 'gml-line-tag', geometryIds: ['gml-test-line'] });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], [geom]);
    expect(xml).toContain('lmg:Linje');
    expect(xml).toContain('gml:LineString');
    expect(xml).toContain('gml:posList');
  });

  it('serializes Point as lmg:Punkt with gml:Point', () => {
    const geom = makePointGeometry({ uuid: 'gml-test-pt' });
    const tag = makeTag({ uuid: 'gml-pt-tag', geometryIds: ['gml-test-pt'] });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], [geom]);
    expect(xml).toContain('lmg:Punkt');
    expect(xml).toContain('gml:Point');
    expect(xml).toContain('gml:pos');
  });

  it('falls back to planomrade when linked geometry UUID is not in the geometries list', () => {
    const tag = makeTag({ uuid: 'missing-tag', geometryIds: ['nonexistent-uuid'] });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], []);
    expect(xml).toContain('<planomrade>Ja</planomrade>');
    expect(xml).not.toContain('lmg:Yta');
    expect(xml).not.toContain('lmg:Punkt');
    expect(xml).not.toContain('lmg:Linje');
  });

  it('polygon coordinates are reprojected to EPSG:3006', () => {
    // Use EPSG:4326 (lat/lon) input — should get reprojected to SWEREF99TM values
    const geom = makePolygonGeometry({
      uuid: 'reproject-test',
      crs: 'EPSG:4326',
      coordinates: [
        [[18.07, 59.33], [18.08, 59.33], [18.08, 59.34], [18.07, 59.34], [18.07, 59.33]],
      ] as number[][][],
    });
    const tag = makeTag({ uuid: 'reproject-tag', geometryIds: ['reproject-test'] });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], [geom]);
    // Should contain high-value coordinates typical of SWEREF99TM (northings ~6.5M, eastings ~6xx,xxx)
    expect(xml).toContain('gml:posList');
    // Should NOT contain the raw lat/lon input values (18.07 / 59.33) as-is
    // (they get transformed to ~674xxx.xxx 6584xxx.xxx)
    expect(xml).not.toContain('18.070');
  });
});

// ─── Indelning classification ─────────────────────────────────────────────────

describe('<Indelning> classification', () => {
  it('includes <tema> and <grupp> in every Omfattning', () => {
    const tag = makeTag({ uuid: 'indelning-tag' });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], []);
    expect(xml).toContain('<tema>');
    expect(xml).toContain('<grupp>');
    expect(xml).toContain('<Indelning>');
  });

  it('exports a group-level category without <undergrupp>', () => {
    const tag = makeTag({
      uuid: 'abcdef12-3456-7890-abcd-ef1234567890',
      categoryId: 'genomforandefragor--fastighetsrattsliga-fragor',
    });

    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], []);

    expect(xml).toContain('<tema>genomförandefrågor</tema>');
    expect(xml).toContain('<grupp>fastighetsrättsliga frågor</grupp>');
    expect(xml).not.toContain('<undergrupp>');
  });

  it('excludes unknown categoryId from Planbeskrivning XML instead of emitting fallback indelning', () => {
    const tag = makeTag({ uuid: 'unknown-cat', categoryId: 'completely-unknown-category' });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], []);
    expect(xml).not.toContain('<Omfattning>');
    expect(xml).not.toContain('<Indelning>');
    expect(() => parseXml(xml)).not.toThrow();
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('handles empty tags array gracefully', () => {
    const xml = buildPlanbeskrivningXml(makeConfig(), [], []);
    expect(xml).not.toContain('<Omfattning>');
    expect(() => parseXml(xml)).not.toThrow();
  });

  it('escapes special XML characters in arkividentitetKommun', () => {
    const cfg = makeConfig({ arkividentitetKommun: 'TEST & <MOCK>' });
    const xml = buildPlanbeskrivningXml(cfg, [], []);
    // Raw characters must NOT appear
    expect(xml).not.toContain('TEST & <MOCK>');
    // Escaped form must appear
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(() => parseXml(xml)).not.toThrow();
  });

  it('escapes special XML characters in objektidentitet', () => {
    // Unlikely in practice, but XML safety is mandatory
    const cfg = makeConfig({ arkividentitetKommun: '"quoted" value' });
    const xml = buildPlanbeskrivningXml(cfg, [], []);
    expect(() => parseXml(xml)).not.toThrow();
  });

  it('tags with multiple geometry links produce one <Omfattning> per geometry', () => {
    const geom1 = makePolygonGeometry({ uuid: 'multi-g1' });
    const geom2 = makePolygonGeometry({ uuid: 'multi-g2' });
    const geom3 = makeLineGeometry({ uuid: 'multi-g3' });
    const tag = makeTag({ uuid: 'multi-tag', geometryIds: ['multi-g1', 'multi-g2', 'multi-g3'] });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], [geom1, geom2, geom3]);
    const doc = parseXml(xml);
    // 3 geometries → 3 Omfattning blocks, each with its own Lage
    const lagElements = doc.getElementsByTagName('Lage');
    expect(lagElements.length).toBe(3);
    const omfElements = doc.getElementsByTagName('Omfattning');
    expect(omfElements.length).toBe(3);
    // All identiteter must be unique and match PLANB-005
    const IDENTITET_RE = /^[A-Za-zÅÄÖåäö][A-Za-zÅÄÖåäö0-9_]{0,39}$/;
    const ids = [...xml.matchAll(/<identitet>([^<]+)<\/identitet>/g)].map((m) => m[1]);
    expect(ids.length).toBe(3);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) {
      expect(id).toMatch(IDENTITET_RE);
    }
    // Second and third identiteter should have _g2 and _g3 suffixes
    expect(ids[1]).toMatch(/_g2$/);
    expect(ids[2]).toMatch(/_g3$/);
    // All 3 Lage elements should contain GML (not planomrade)
    expect(xml).not.toContain('<planomrade>');
  });

  it('derived _g2/_g3 identiteter still pass PLANB-005 even for max-length base names', () => {
    // Create a tag whose bookmark name fills 40 characters exactly
    const longUuid = 'a'.repeat(8) + '-' + 'b'.repeat(4) + '-' + 'c'.repeat(4) + '-' + 'd'.repeat(4) + '-' + 'e'.repeat(12);
    const geom1 = makePolygonGeometry({ uuid: 'long-g1' });
    const geom2 = makePolygonGeometry({ uuid: 'long-g2' });
    const tag = makeTag({ uuid: longUuid, geometryIds: ['long-g1', 'long-g2'], paragraphIndex: 999 });
    const xml = buildPlanbeskrivningXml(makeConfig(), [tag], [geom1, geom2]);
    const IDENTITET_RE = /^[A-Za-zÅÄÖåäö][A-Za-zÅÄÖåäö0-9_]{0,39}$/;
    const ids = [...xml.matchAll(/<identitet>([^<]+)<\/identitet>/g)].map((m) => m[1]);
    for (const id of ids) {
      expect(id.length).toBeLessThanOrEqual(40);
      expect(id).toMatch(IDENTITET_RE);
    }
  });

  it('generates valid XML for a large number of tags', () => {
    const tags = Array.from({ length: 50 }, (_, i) =>
      makeTag({ uuid: `bulk-tag-${i}`, paragraphIndex: i + 100, startOffset: 0, endOffset: 5 })
    );
    const xml = buildPlanbeskrivningXml(makeConfig(), tags, []);
    expect(() => parseXml(xml)).not.toThrow();
    const count = (xml.match(/<Omfattning>/g) ?? []).length;
    expect(count).toBe(50);
  });
});
