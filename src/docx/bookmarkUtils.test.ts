import { describe, it, expect } from 'vitest';
import { generateBookmarkName } from './bookmarkUtils';
import type { Tag } from '../types';

describe('generateBookmarkName', () => {
  it('generates a clean bookmark name for a given tag', () => {
    const tag: Tag = {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      categoryId: 'area-park',
      text: 'Sample text',
      paragraphIndex: 1,
      startOffset: 0,
      endOffset: 5,
      createdAt: new Date().toISOString()
    };

    // We expect the category label resolution.
    // Fallback if not found uses categoryId.
    const name = generateBookmarkName(tag);

    // The format is base_uuid-prefix
    expect(name).toMatch(/^[a-zA-Z]/); // Must start with letter
    expect(name).toMatch(/_550e8400$/); // Ends with the short ID
    expect(name).not.toContain(' '); // No spaces allowed
  });

  it('strips invalid characters', () => {
    const tag: Tag = {
      uuid: '123e4567-e89b-12d3-a456-426614174000',
      categoryId: 'invalid! @#$ %^&*() chars',
      text: 'Sample text',
      paragraphIndex: 1,
      startOffset: 0,
      endOffset: 5,
      createdAt: new Date().toISOString()
    };

    const name = generateBookmarkName(tag);
    expect(name).not.toContain('!');
    expect(name).not.toContain('@');
    expect(name).toMatch(/^[a-zA-Z0-9_]+$/);
  });
});
