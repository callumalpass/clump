import { describe, it, expect } from 'vitest';
import { focusRing, focusRingGray800, focusRingInset } from './styles';

describe('focusRing', () => {
  it('includes focus:outline-none', () => {
    expect(focusRing).toContain('focus:outline-none');
  });

  it('includes focus-visible:ring-2 for keyboard navigation', () => {
    expect(focusRing).toContain('focus-visible:ring-2');
  });

  it('uses blurple-400 ring color', () => {
    expect(focusRing).toContain('focus-visible:ring-blurple-400');
  });

  it('has ring-offset for dark backgrounds (gray-900)', () => {
    expect(focusRing).toContain('focus-visible:ring-offset-1');
    expect(focusRing).toContain('focus-visible:ring-offset-gray-900');
  });
});

describe('focusRingGray800', () => {
  it('includes focus:outline-none', () => {
    expect(focusRingGray800).toContain('focus:outline-none');
  });

  it('includes focus-visible:ring-2 for keyboard navigation', () => {
    expect(focusRingGray800).toContain('focus-visible:ring-2');
  });

  it('uses blurple-400 ring color', () => {
    expect(focusRingGray800).toContain('focus-visible:ring-blurple-400');
  });

  it('has ring-offset for gray-800 backgrounds', () => {
    expect(focusRingGray800).toContain('focus-visible:ring-offset-1');
    expect(focusRingGray800).toContain('focus-visible:ring-offset-gray-800');
  });
});

describe('focusRingInset', () => {
  it('includes focus:outline-none', () => {
    expect(focusRingInset).toContain('focus:outline-none');
  });

  it('includes focus-visible:ring-2 for keyboard navigation', () => {
    expect(focusRingInset).toContain('focus-visible:ring-2');
  });

  it('uses blurple-300 ring color for better visibility in dropdowns', () => {
    expect(focusRingInset).toContain('focus-visible:ring-blurple-300');
  });

  it('uses inset ring to avoid overflow clipping', () => {
    expect(focusRingInset).toContain('focus-visible:ring-inset');
  });

  it('does not include ring-offset (inset ring does not need it)', () => {
    expect(focusRingInset).not.toContain('ring-offset');
  });
});
