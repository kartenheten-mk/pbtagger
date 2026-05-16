import { describe, expect, it } from 'vitest';
import { flattenCategories, getCategoryLabel } from '../src/data/categoryUtils';
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
});
