import { describe, expect, it } from 'vitest';
import { exportGeometryDocWithMotivAsString } from '../../src/geometry/geoJsonConverter';
import type { Geometry, GeometryDoc, Tag } from '../../src/types';

const MOTIV_CATEGORY_ID =
  'motiv-till-detaljplanens-regleringar--motiv-till-reglering';

function makeRawJson(): Record<string, unknown> {
  return {
    type: 'FeatureCollection',
    features: [
      {
        id: 'plan-1',
        type: 'Feature',
        properties: {
          'feature:typ': 'detaljplan',
          namn: 'Testplan',
        },
      },
      {
        id: 'best-1',
        type: 'Feature',
        properties: {
          'feature:typ': 'användningsbestämmelse',
          bestammelseformulering: 'Bostäder',
          planbestammelsebeskrivning: {
            motiv: 'Gammalt motiv',
            annan: 'ska bevaras',
          },
        },
      },
      {
        id: 'best-2',
        type: 'Feature',
        properties: {
          'feature:typ': 'egenskapsbestämmelse',
          bestammelseformulering: 'Högsta nockhöjd',
          planbestammelsebeskrivning: {
            motiv: 'Oförändrat motiv',
          },
        },
      },
    ],
  };
}

function makeDoc(rawJson: Record<string, unknown> = makeRawJson()): GeometryDoc {
  return {
    id: 'plan-1',
    name: 'Testplan',
    fileName: 'testplan.json',
    rawJson,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeGeometry(overrides: Partial<Geometry> = {}): Geometry {
  return {
    uuid: 'best-1',
    name: 'Bestämmelse',
    type: 'polygon',
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    featureType: 'användningsbestämmelse',
    sourceDocId: 'plan-1',
    source: 'json',
    properties: {},
    ...overrides,
  };
}

function makeMotivTag(overrides: Partial<Tag> = {}): Tag {
  return {
    uuid: 'tag-1',
    categoryId: MOTIV_CATEGORY_ID,
    text: 'Nytt motiv',
    paragraphIndex: 0,
    startOffset: 0,
    endOffset: 10,
    geometryIds: ['best-1'],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function parseExport(
  doc: GeometryDoc,
  tags: Tag[],
  geometries: Geometry[]
): Record<string, unknown> {
  return JSON.parse(
    exportGeometryDocWithMotivAsString(doc, tags, geometries)
  ) as Record<string, unknown>;
}

function getFeature(rawJson: Record<string, unknown>, id: string): Record<string, unknown> {
  const features = rawJson['features'] as Array<Record<string, unknown>>;
  const feature = features.find((f) => f['id'] === id);
  if (!feature) throw new Error(`Missing feature ${id}`);
  return feature;
}

function getProperties(feature: Record<string, unknown>): Record<string, unknown> {
  return feature['properties'] as Record<string, unknown>;
}

describe('exportGeometryDocWithMotivAsString', () => {
  it('replaces existing motiv for the linked feature and leaves other features unchanged', () => {
    const rawJson = makeRawJson();
    const doc = makeDoc(rawJson);
    const output = parseExport(
      doc,
      [makeMotivTag({ text: '  Nytt motiv från tagg  ' })],
      [makeGeometry(), makeGeometry({ uuid: 'best-2', featureType: 'egenskapsbestämmelse' })]
    );

    const best1Description = getProperties(getFeature(output, 'best-1'))[
      'planbestammelsebeskrivning'
    ] as Record<string, unknown>;

    expect(best1Description['motiv']).toBe('Nytt motiv från tagg');
    expect(best1Description['annan']).toBe('ska bevaras');
    expect(getFeature(output, 'best-2')).toEqual(getFeature(rawJson, 'best-2'));
  });

  it('creates planbestammelsebeskrivning with only motiv when it is missing', () => {
    const rawJson = makeRawJson();
    const best1Properties = getProperties(getFeature(rawJson, 'best-1'));
    delete best1Properties['planbestammelsebeskrivning'];
    const doc = makeDoc(rawJson);

    const output = parseExport(doc, [makeMotivTag()], [makeGeometry()]);
    const description = getProperties(getFeature(output, 'best-1'))[
      'planbestammelsebeskrivning'
    ];

    expect(description).toEqual({ motiv: 'Nytt motiv' });
  });

  it('converts double quotes inside motiv text to single quotes', () => {
    const doc = makeDoc();
    const output = parseExport(
      doc,
      [makeMotivTag({ text: 'Motivet "centrum" gäller.' })],
      [makeGeometry()]
    );
    const description = getProperties(getFeature(output, 'best-1'))[
      'planbestammelsebeskrivning'
    ] as Record<string, unknown>;

    expect(description['motiv']).toBe("Motivet 'centrum' gäller.");
  });

  it('blocks duplicate motiv tags pointing at the same geometry', () => {
    const doc = makeDoc();

    expect(() =>
      exportGeometryDocWithMotivAsString(
        doc,
        [
          makeMotivTag({ uuid: 'tag-1', text: 'Motiv ett' }),
          makeMotivTag({ uuid: 'tag-2', text: 'Motiv två' }),
        ],
        [makeGeometry()]
      )
    ).toThrow(/Flera motiv-taggar pekar på samma geometri/);
  });

  it('blocks a motiv tag linked to the detaljplan instead of a planbestämmelse', () => {
    const doc = makeDoc();

    expect(() =>
      exportGeometryDocWithMotivAsString(
        doc,
        [makeMotivTag({ geometryIds: ['plan-1'] })],
        [makeGeometry({ uuid: 'plan-1', featureType: 'detaljplan' })]
      )
    ).toThrow(/inte är en planbestämmelse/);
  });

  it('blocks a motiv tag without a linked planbestämmelse in the active JSON', () => {
    const doc = makeDoc();

    expect(() =>
      exportGeometryDocWithMotivAsString(
        doc,
        [makeMotivTag({ geometryIds: ['best-1'] })],
        [makeGeometry({ sourceDocId: 'other-plan' })]
      )
    ).toThrow(/saknar länkad planbestämmelse/);
  });

  it('blocks empty motiv text after trimming', () => {
    const doc = makeDoc();

    expect(() =>
      exportGeometryDocWithMotivAsString(
        doc,
        [makeMotivTag({ text: '   ' })],
        [makeGeometry()]
      )
    ).toThrow(/tom motivtext/);
  });

  it('does not mutate the source GeometryDoc, tags, or geometries', () => {
    const doc = makeDoc();
    const tags = [makeMotivTag()];
    const geometries = [makeGeometry()];
    const rawBefore = JSON.stringify(doc.rawJson);
    const tagsBefore = JSON.stringify(tags);
    const geometriesBefore = JSON.stringify(geometries);

    exportGeometryDocWithMotivAsString(doc, tags, geometries);

    expect(JSON.stringify(doc.rawJson)).toBe(rawBefore);
    expect(JSON.stringify(tags)).toBe(tagsBefore);
    expect(JSON.stringify(geometries)).toBe(geometriesBefore);
  });
});
