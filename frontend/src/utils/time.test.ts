import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatRelativeTime, getTimeWithTooltip } from './time';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    // Mock the current date to a fixed point in time
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('seconds ago', () => {
    it('returns "just now" for less than a minute ago', () => {
      const now = new Date();
      expect(formatRelativeTime(now.toISOString())).toBe('just now');

      const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
      expect(formatRelativeTime(thirtySecondsAgo.toISOString())).toBe('just now');

      const fiftyNineSecondsAgo = new Date(now.getTime() - 59 * 1000);
      expect(formatRelativeTime(fiftyNineSecondsAgo.toISOString())).toBe('just now');
    });
  });

  describe('minutes ago', () => {
    it('returns "1 minute ago" for exactly 1 minute', () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      expect(formatRelativeTime(oneMinuteAgo.toISOString())).toBe('1 minute ago');
    });

    it('returns "X minutes ago" for less than an hour', () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinutesAgo.toISOString())).toBe('5 minutes ago');

      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      expect(formatRelativeTime(thirtyMinutesAgo.toISOString())).toBe('30 minutes ago');

      const fiftyNineMinutesAgo = new Date(now.getTime() - 59 * 60 * 1000);
      expect(formatRelativeTime(fiftyNineMinutesAgo.toISOString())).toBe('59 minutes ago');
    });
  });

  describe('hours ago', () => {
    it('returns "1 hour ago" for exactly 1 hour', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      expect(formatRelativeTime(oneHourAgo.toISOString())).toBe('1 hour ago');
    });

    it('returns "X hours ago" for less than a day', () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoHoursAgo.toISOString())).toBe('2 hours ago');

      const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      expect(formatRelativeTime(twelveHoursAgo.toISOString())).toBe('12 hours ago');

      const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 60 * 60 * 1000);
      expect(formatRelativeTime(twentyThreeHoursAgo.toISOString())).toBe('23 hours ago');
    });
  });

  describe('days ago', () => {
    it('returns "yesterday" for exactly 1 day ago', () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(oneDayAgo.toISOString())).toBe('yesterday');
    });

    it('returns "X days ago" for less than a week', () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoDaysAgo.toISOString())).toBe('2 days ago');

      const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(sixDaysAgo.toISOString())).toBe('6 days ago');
    });
  });

  describe('weeks ago', () => {
    it('returns "1 week ago" for exactly 7 days', () => {
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(oneWeekAgo.toISOString())).toBe('1 week ago');
    });

    it('returns "X weeks ago" for less than a month', () => {
      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoWeeksAgo.toISOString())).toBe('2 weeks ago');

      const threeWeeksAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(threeWeeksAgo.toISOString())).toBe('3 weeks ago');
    });
  });

  describe('months ago', () => {
    it('returns "1 month ago" for 30-59 days', () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(thirtyDaysAgo.toISOString())).toBe('1 month ago');

      const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(fortyFiveDaysAgo.toISOString())).toBe('1 month ago');
    });

    it('returns "X months ago" for less than a year', () => {
      const now = new Date();
      const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoMonthsAgo.toISOString())).toBe('2 months ago');

      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(sixMonthsAgo.toISOString())).toBe('6 months ago');

      const elevenMonthsAgo = new Date(now.getTime() - 330 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(elevenMonthsAgo.toISOString())).toBe('11 months ago');
    });
  });

  describe('years ago (formatted date)', () => {
    it('returns formatted date for more than a year ago', () => {
      const now = new Date();
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(oneYearAgo.toISOString());
      // Should contain month, day, and year
      expect(result).toMatch(/\w+ \d+, \d{4}/);
    });

    it('returns formatted date for multi-year old dates', () => {
      const twoYearsAgo = new Date('2022-01-15T12:00:00Z');
      const result = formatRelativeTime(twoYearsAgo.toISOString());
      expect(result).toMatch(/Jan 15, 2022/);
    });
  });

  describe('future dates', () => {
    it('returns "just now" for future dates', () => {
      const now = new Date();
      const future = new Date(now.getTime() + 60 * 60 * 1000);
      expect(formatRelativeTime(future.toISOString())).toBe('just now');
    });
  });

  describe('edge cases', () => {
    it('handles ISO date strings', () => {
      const date = new Date();
      expect(() => formatRelativeTime(date.toISOString())).not.toThrow();
    });

    it('handles date strings with timezone offset', () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      // Format as ISO string which is always in UTC
      expect(formatRelativeTime(twoHoursAgo.toISOString())).toBe('2 hours ago');
    });

    it('returns empty string for invalid date strings', () => {
      expect(formatRelativeTime('not-a-date')).toBe('');
      expect(formatRelativeTime('invalid')).toBe('');
      expect(formatRelativeTime('')).toBe('');
    });

    it('returns empty string for malformed date strings', () => {
      expect(formatRelativeTime('2024-13-45')).toBe(''); // Invalid month/day
      expect(formatRelativeTime('abc-def-ghi')).toBe('');
    });
  });
});

describe('getTimeWithTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns object with relative and full properties', () => {
    const now = new Date();
    const result = getTimeWithTooltip(now.toISOString());

    expect(result).toHaveProperty('relative');
    expect(result).toHaveProperty('full');
  });

  it('relative matches formatRelativeTime output', () => {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const result = getTimeWithTooltip(fiveMinutesAgo.toISOString());

    expect(result.relative).toBe('5 minutes ago');
  });

  it('full contains readable date and time', () => {
    const testDate = new Date('2024-06-15T14:30:00Z');
    const result = getTimeWithTooltip(testDate.toISOString());

    // Full should contain day, month, year, and time
    // Exact format depends on locale, but should include these elements
    expect(result.full).toBeTruthy();
    expect(typeof result.full).toBe('string');
    expect(result.full.length).toBeGreaterThan(10);
  });

  it('works with various date formats', () => {
    const dates = [
      new Date('2024-01-01T00:00:00Z'),
      new Date('2023-12-31T23:59:59Z'),
      new Date('2024-06-15T12:00:00Z'),
    ];

    dates.forEach((date) => {
      const result = getTimeWithTooltip(date.toISOString());
      expect(result.relative).toBeTruthy();
      expect(result.full).toBeTruthy();
    });
  });

  describe('invalid date handling', () => {
    it('returns empty strings for invalid date string', () => {
      const result = getTimeWithTooltip('not-a-date');
      expect(result.relative).toBe('');
      expect(result.full).toBe('');
    });

    it('returns empty strings for empty string', () => {
      const result = getTimeWithTooltip('');
      expect(result.relative).toBe('');
      expect(result.full).toBe('');
    });

    it('returns empty strings for malformed date', () => {
      const result = getTimeWithTooltip('2024-13-45');
      expect(result.relative).toBe('');
      expect(result.full).toBe('');
    });

    it('returns empty strings for garbage input', () => {
      const result = getTimeWithTooltip('abc-def-ghi');
      expect(result.relative).toBe('');
      expect(result.full).toBe('');
    });

    it('handles consistent behavior between relative and full', () => {
      // Both should return empty for invalid dates, not a mix of empty and "Invalid Date"
      const invalidInputs = ['invalid', '', 'not-a-date', '2024-13-45'];

      invalidInputs.forEach((input) => {
        const result = getTimeWithTooltip(input);
        expect(result.relative).toBe('');
        expect(result.full).toBe('');
        // Critically: full should NOT be "Invalid Date"
        expect(result.full).not.toBe('Invalid Date');
      });
    });
  });
});
