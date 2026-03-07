import { describe, it, expect } from 'vitest';
import { hexToRgba } from './utils';

describe('hexToRgba', () => {
  it('converts a standard 6-character hex color to rgba string', () => {
    expect(hexToRgba('#3b82f6', 0.5)).toBe('rgba(59,130,246,0.5)');
  });

  it('works without a leading hash', () => {
    expect(hexToRgba('10b981', 0.8)).toBe('rgba(16,185,129,0.8)');
  });

  it('handles invalid hex by returning a grey fallback', () => {
    expect(hexToRgba('invalid', 0.5)).toBe('rgba(100,100,100,0.5)');
  });
});
