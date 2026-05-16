/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AssignTagPanel } from '../../../src/components/sidebar/AssignTagPanel';
import { flattenCategories } from '../../../src/data/categoryUtils';
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

describe('AssignTagPanel', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('requires explicit confirmation and can assign a group without undergrupp', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /Fastighetsrättsliga frågor/ }));

    expect(onApply).not.toHaveBeenCalled();
    expect(applyButton.hasAttribute('disabled')).toBe(false);

    fireEvent.click(applyButton);

    expect(onApply).toHaveBeenCalledWith(
      'genomforandefragor--fastighetsrattsliga-fragor',
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
});
