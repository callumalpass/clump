import { describe, it, expect } from 'vitest';
import { getContrastColor, TAG_COLORS } from './colors';

describe('getContrastColor', () => {
  it('returns black for bright colors', () => {
    expect(getContrastColor('#ffffff')).toBe('#000000'); // white
    expect(getContrastColor('#ffff00')).toBe('#000000'); // yellow
    expect(getContrastColor('#00ff00')).toBe('#000000'); // bright green
  });

  it('returns white for dark colors', () => {
    expect(getContrastColor('#000000')).toBe('#ffffff'); // black
    expect(getContrastColor('#0000ff')).toBe('#ffffff'); // blue
    expect(getContrastColor('#800000')).toBe('#ffffff'); // dark red
  });

  it('handles colors without hash prefix', () => {
    expect(getContrastColor('ffffff')).toBe('#000000');
    expect(getContrastColor('000000')).toBe('#ffffff');
  });

  it('handles 3-character hex codes', () => {
    expect(getContrastColor('#fff')).toBe('#000000'); // white -> needs black text
    expect(getContrastColor('#000')).toBe('#ffffff'); // black -> needs white text
    expect(getContrastColor('abc')).toBe('#000000'); // #aabbcc is light blue-gray -> needs black text
    expect(getContrastColor('#ff0')).toBe('#000000'); // yellow -> needs black text
    expect(getContrastColor('#369')).toBe('#ffffff'); // #336699 is dark blue -> needs white text
  });

  it('handles mid-luminance colors correctly', () => {
    // Gray at ~50% luminance - should be close to the threshold
    expect(getContrastColor('#808080')).toBe('#000000'); // slightly above 0.5
    expect(getContrastColor('#707070')).toBe('#ffffff'); // slightly below 0.5
  });

  it('returns white for invalid hex codes', () => {
    expect(getContrastColor('')).toBe('#ffffff');
    expect(getContrastColor('#')).toBe('#ffffff');
    expect(getContrastColor('#gg0000')).toBe('#ffffff'); // invalid hex chars
    expect(getContrastColor('#12345')).toBe('#ffffff'); // wrong length
    expect(getContrastColor('#1234567')).toBe('#ffffff'); // wrong length
    expect(getContrastColor('not-a-color')).toBe('#ffffff');
  });

  it('works with TAG_COLORS', () => {
    // All TAG_COLORS should return a valid contrast color
    TAG_COLORS.forEach((color) => {
      const result = getContrastColor(color);
      expect(['#000000', '#ffffff']).toContain(result);
    });
  });
});

describe('TAG_COLORS', () => {
  it('contains expected number of colors', () => {
    expect(TAG_COLORS).toHaveLength(8);
  });

  it('all colors are valid hex format', () => {
    TAG_COLORS.forEach((color) => {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});
