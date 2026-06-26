import { describe, expect, it } from 'vitest';
import {
  createUniqueGroupId,
  createUniqueUndergroupId,
  flattenCategories,
  getCategoryLabel,
  mergeCustomCategories,
  slugifyCategoryId,
} from '../src/data/categoryUtils';
import type { Tema } from '../src/types';

const teman: Tema[] = [
  {
    id: 'genomforandefragor',
    name: 'Genomförandefrågor',
    color: '#8b5cf6',
    grupper: [
      {
        id: 'fastighetsrattsliga-fragor',
        name: 'Fastighetsrättsliga frågor',
        undergrupper: [
          { id: 'rattigheter', name: 'Rättigheter' },
        ],
      },
    ],
  },
];

describe('categoryUtils', () => {
  it('creates both group and undergrupp selectable categories', () => {
    const categories = flattenCategories(teman);

    expect(categories.map((c) => c.id)).toEqual([
      'genomforandefragor--fastighetsrattsliga-fragor',
      'genomforandefragor--fastighetsrattsliga-fragor--rattigheter',
    ]);
    expect(categories[0]).toMatchObject({
      level: 'grupp',
      name: 'Fastighetsrättsliga frågor',
    });
    expect(categories[0].undergruppName).toBeUndefined();
    expect(categories[1]).toMatchObject({
      level: 'undergrupp',
      name: 'Rättigheter',
      undergruppId: 'rattigheter',
      undergruppName: 'Rättigheter',
    });
  });

  it('labels group and undergrupp levels distinctly', () => {
    const [grupp, undergrupp] = flattenCategories(teman);

    expect(getCategoryLabel(grupp)).toBe('Genomförandefrågor › Fastighetsrättsliga frågor');
    expect(getCategoryLabel(undergrupp)).toBe('Genomförandefrågor › Fastighetsrättsliga frågor › Rättigheter');
  });

  it('slugifies Swedish names and creates duplicate-safe ids', () => {
    expect(slugifyCategoryId('Rättigheter & Åtgärder')).toBe('rattigheter-atgarder');
    expect(createUniqueGroupId(teman, 'genomforandefragor', 'Fastighetsrättsliga frågor')).toBe(
      'fastighetsrattsliga-fragor-2'
    );
    expect(
      createUniqueUndergroupId(
        teman,
        'genomforandefragor',
        'fastighetsrattsliga-fragor',
        'Rättigheter'
      )
    ).toBe('rattigheter-2');
  });

  it('merges custom groups and undergroups as selectable categories', () => {
    const merged = mergeCustomCategories(teman, {
      customGroups: [
        {
          temaId: 'genomforandefragor',
          id: 'kommunala-fragor',
          name: 'Kommunala frågor',
          undergrupper: [
            { id: 'drift', name: 'Drift' },
          ],
        },
      ],
      customUndergroups: [
        {
          temaId: 'genomforandefragor',
          gruppId: 'fastighetsrattsliga-fragor',
          id: 'servitut',
          name: 'Servitut',
        },
      ],
    });

    const categories = flattenCategories(merged);

    expect(categories.find((category) => category.id === 'genomforandefragor--kommunala-fragor'))
      .toMatchObject({ custom: true, name: 'Kommunala frågor', level: 'grupp' });
    expect(categories.find((category) => category.id === 'genomforandefragor--kommunala-fragor--drift'))
      .toMatchObject({ custom: true, name: 'Drift', level: 'undergrupp' });
    expect(categories.find((category) => category.id === 'genomforandefragor--fastighetsrattsliga-fragor--servitut'))
      .toMatchObject({ custom: true, name: 'Servitut', level: 'undergrupp' });

    expect(teman[0].grupper).toHaveLength(1);
  });

  it('treats missing category config as no custom categories', () => {
    const merged = mergeCustomCategories(teman, undefined);

    expect(flattenCategories(merged).map((category) => category.id)).toEqual([
      'genomforandefragor--fastighetsrattsliga-fragor',
      'genomforandefragor--fastighetsrattsliga-fragor--rattigheter',
    ]);
  });
});
