/**
 * TagBadge.tsx
 *
 * A small pill/badge that visually represents a tag category.
 * Used in the sidebar tag list items.
 */

import React from 'react';
import type { Category } from '../types';

interface TagBadgeProps {
  category: Category;
  size?: 'sm' | 'md';
}

export const TagBadge: React.FC<TagBadgeProps> = ({ category, size = 'md' }) => {
  const hex = category.color;
  // Convert to rgba for bg
  const bg = hexToRgba(hex, 0.12);
  const border = hexToRgba(hex, 0.35);

  const sizeClasses = size === 'sm'
    ? 'text-xs px-1.5 py-0.5'
    : 'text-xs px-2 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses}`}
      style={{
        backgroundColor: bg,
        border: `1px solid ${border}`,
        color: hex,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: hex }}
      />
      {category.name}
    </span>
  );
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(100,100,100,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}
