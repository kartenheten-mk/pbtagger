/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AssignTagPanel } from '../../../src/components/sidebar/AssignTagPanel';
import { flattenCategories, mergeCustomCategories } from '../../../src/data/categoryUtils';
import type { Tema } from '../../../src/types';

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

const categories = flattenCategories(teman);

const singleOptionTeman: Tema[] = [
  {
    id: 'motiv-till-detaljplanens-regleringar',
    name: 'Motiv till detaljplanens regleringar',
    color: '#f59e0b',
    grupper: [
      {
        id: 'motiv-till-reglering',
        name: 'Motiv till reglering',
        undergrupper: [],
      },
    ],
  },
];

const singleOptionCategories = flattenCategories(singleOptionTeman);

describe('AssignTagPanel', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('requires explicit confirmation and can assign an auto-selected only group', () => {
    const onApply = vi.fn();

    render(
      <AssignTagPanel
        teman={teman}
        categories={categories}
        pendingText="Markerad text"
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );

    const applyButton = screen.getByRole('button', { name: 'Tilldela tagg' });
    expect(applyButton.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Genomförandefrågor' }));

    expect(onApply).not.toHaveBeenCalled();
    expect(applyButton.hasAttribute('disabled')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Fastighetsrättsliga frågor/ }));

    expect(onApply).not.toHaveBeenCalled();
    expect(applyButton.hasAttribute('disabled')).toBe(false);

    fireEvent.click(applyButton);

    expect(onApply).toHaveBeenCalledWith(
      'genomforandefragor--fastighetsrattsliga-fragor',
      ''
    );
  });

  it('auto-selects the only available group when a theme has one group and no undergroups', () => {
    const onApply = vi.fn();

    render(
      <AssignTagPanel
        teman={singleOptionTeman}
        categories={singleOptionCategories}
        pendingText="Markerad text"
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );

    const applyButton = screen.getByRole('button', { name: 'Tilldela tagg' });
    expect(applyButton.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Motiv till detaljplanens regleringar' }));

    expect(applyButton.hasAttribute('disabled')).toBe(false);
    expect(screen.getByText('Motiv till detaljplanens regleringar › Motiv till reglering')).toBeTruthy();

    fireEvent.click(applyButton);

    expect(onApply).toHaveBeenCalledWith(
      'motiv-till-detaljplanens-regleringar--motiv-till-reglering',
      ''
    );
  });

  it('can refine a selected group to an optional undergrupp before confirmation', () => {
    const onApply = vi.fn();

    render(
      <AssignTagPanel
        teman={teman}
        categories={categories}
        pendingText="Markerad text"
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Genomförandefrågor' }));
    fireEvent.click(screen.getByRole('button', { name: /Fastighetsrättsliga frågor/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Rättigheter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tilldela tagg' }));

    expect(onApply).toHaveBeenCalledWith(
      'genomforandefragor--fastighetsrattsliga-fragor--rattigheter',
      ''
    );
  });

  it('selects search results without applying until confirmed', () => {
    const onApply = vi.fn();

    render(
      <AssignTagPanel
        teman={teman}
        categories={categories}
        pendingText="Markerad text"
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Sök tagg...'), {
      target: { value: 'rättigheter' },
    });

    expect(screen.getByText('Undergrupp')).toBeTruthy();
    fireEvent.click(screen.getByText('Rättigheter'));

    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Tilldela tagg' }));

    expect(onApply).toHaveBeenCalledWith(
      'genomforandefragor--fastighetsrattsliga-fragor--rattigheter',
      ''
    );
  });

  it('shows merged custom categories in search results', () => {
    const mergedTeman = mergeCustomCategories(teman, {
      customGroups: [
        {
          temaId: 'genomforandefragor',
          id: 'kommunala-fragor',
          name: 'Kommunala frågor',
          undergrupper: [],
        },
      ],
      customUndergroups: [],
    });

    render(
      <AssignTagPanel
        teman={mergedTeman}
        categories={flattenCategories(mergedTeman)}
        pendingText="Markerad text"
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Sök tagg...'), {
      target: { value: 'kommunala' },
    });

    expect(screen.getByText('Kommunala frågor')).toBeTruthy();
  });

  it('does not render the custom category add button inside the assign panel', () => {
    render(
      <AssignTagPanel
        teman={teman}
        categories={categories}
        pendingText="Markerad text"
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'Lägg till' })).toBeNull();
  });
});
