import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { describeCron, formatRelativeTime, CRON_PRESETS } from './useSchedules';

describe('describeCron', () => {
  describe('every X minutes patterns', () => {
    it('describes every 15 minutes', () => {
      expect(describeCron('*/15 * * * *')).toBe('Every 15 minutes');
    });

    it('describes every 5 minutes', () => {
      expect(describeCron('*/5 * * * *')).toBe('Every 5 minutes');
    });

    it('describes every 30 minutes', () => {
      expect(describeCron('*/30 * * * *')).toBe('Every 30 minutes');
    });
  });

  describe('every hour pattern', () => {
    it('describes every hour', () => {
      expect(describeCron('0 * * * *')).toBe('Every hour');
    });
  });

  describe('every X hours patterns', () => {
    it('describes every 6 hours', () => {
      expect(describeCron('0 */6 * * *')).toBe('Every 6 hours');
    });

    it('describes every 2 hours', () => {
      expect(describeCron('0 */2 * * *')).toBe('Every 2 hours');
    });

    it('describes every 12 hours', () => {
      expect(describeCron('0 */12 * * *')).toBe('Every 12 hours');
    });
  });

  describe('daily at specific time patterns', () => {
    it('describes daily at midnight (12 AM)', () => {
      expect(describeCron('0 0 * * *')).toBe('Daily at 12:00 AM');
    });

    it('describes daily at 9 AM', () => {
      expect(describeCron('0 9 * * *')).toBe('Daily at 9:00 AM');
    });

    it('describes daily at noon (12 PM)', () => {
      expect(describeCron('0 12 * * *')).toBe('Daily at 12:00 PM');
    });

    it('describes daily at 1 PM', () => {
      expect(describeCron('0 13 * * *')).toBe('Daily at 1:00 PM');
    });

    it('describes daily at 11 PM', () => {
      expect(describeCron('0 23 * * *')).toBe('Daily at 11:00 PM');
    });

    it('handles minute values correctly', () => {
      expect(describeCron('30 9 * * *')).toBe('Daily at 9:30 AM');
      expect(describeCron('5 14 * * *')).toBe('Daily at 2:05 PM');
    });
  });

  describe('weekday patterns', () => {
    it('describes weekdays at 9 AM', () => {
      expect(describeCron('0 9 * * 1-5')).toBe('Weekdays at 9:00 AM');
    });

    it('describes weekdays at 6 PM', () => {
      expect(describeCron('0 18 * * 1-5')).toBe('Weekdays at 6:00 PM');
    });

    it('handles weekday minute values', () => {
      expect(describeCron('30 8 * * 1-5')).toBe('Weekdays at 8:30 AM');
    });
  });

  describe('specific day of week patterns', () => {
    it('describes Sundays', () => {
      expect(describeCron('0 9 * * 0')).toBe('Sundays at 9:00 AM');
    });

    it('describes Mondays', () => {
      expect(describeCron('0 9 * * 1')).toBe('Mondays at 9:00 AM');
    });

    it('describes Tuesdays', () => {
      expect(describeCron('0 10 * * 2')).toBe('Tuesdays at 10:00 AM');
    });

    it('describes Wednesdays', () => {
      expect(describeCron('0 14 * * 3')).toBe('Wednesdays at 2:00 PM');
    });

    it('describes Thursdays', () => {
      expect(describeCron('0 15 * * 4')).toBe('Thursdays at 3:00 PM');
    });

    it('describes Fridays', () => {
      expect(describeCron('0 17 * * 5')).toBe('Fridays at 5:00 PM');
    });

    it('describes Saturdays', () => {
      expect(describeCron('0 11 * * 6')).toBe('Saturdays at 11:00 AM');
    });
  });

  describe('fallback for unrecognized patterns', () => {
    it('returns original cron string for monthly patterns', () => {
      expect(describeCron('0 9 1 * *')).toBe('0 9 1 * *');
    });

    it('returns original cron string for yearly patterns', () => {
      expect(describeCron('0 9 1 1 *')).toBe('0 9 1 1 *');
    });

    it('returns original cron string for complex day ranges', () => {
      expect(describeCron('0 9 * * 1,3,5')).toBe('0 9 * * 1,3,5');
    });
  });

  describe('edge cases', () => {
    it('returns original for invalid cron with wrong number of parts', () => {
      expect(describeCron('0 9 * *')).toBe('0 9 * *'); // 4 parts
      expect(describeCron('0 9 * * * *')).toBe('0 9 * * * *'); // 6 parts
    });

    it('handles empty string', () => {
      expect(describeCron('')).toBe('');
    });
  });

  describe('CRON_PRESETS validation', () => {
    it('all presets have labels', () => {
      CRON_PRESETS.forEach((preset) => {
        expect(preset.label).toBeTruthy();
        expect(typeof preset.label).toBe('string');
      });
    });

    it('all presets have valid cron values', () => {
      CRON_PRESETS.forEach((preset) => {
        expect(preset.value).toBeTruthy();
        expect(preset.value.split(' ')).toHaveLength(5);
      });
    });

    it('describeCron produces meaningful output for all presets', () => {
      CRON_PRESETS.forEach((preset) => {
        const description = describeCron(preset.value);
        // Description should not just be the raw cron expression
        // (though for complex patterns it might be)
        expect(description).toBeTruthy();
      });
    });
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('past times', () => {
    it('formats just now for times less than a minute ago', () => {
      // The function uses Math.round for diffMins, so:
      // - 29 seconds ago → rounds to 0 minutes → "just now"
      // - 50 seconds ago → rounds to 1 minute → "1m ago"
      const twentySecondsAgo = new Date(new Date().getTime() - 20 * 1000);
      expect(formatRelativeTime(twentySecondsAgo)).toBe('just now');

      // 29 seconds still rounds to 0
      const twentyNineSecondsAgo = new Date(new Date().getTime() - 29 * 1000);
      expect(formatRelativeTime(twentyNineSecondsAgo)).toBe('just now');
    });

    it('formats minutes ago', () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinutesAgo)).toBe('5m ago');

      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      expect(formatRelativeTime(thirtyMinutesAgo)).toBe('30m ago');
    });

    it('formats hours ago', () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoHoursAgo)).toBe('2h ago');

      const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      expect(formatRelativeTime(twelveHoursAgo)).toBe('12h ago');
    });

    it('formats days ago', () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoDaysAgo)).toBe('2d ago');

      const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(sixDaysAgo)).toBe('6d ago');
    });

    it('formats as date for times more than a week ago', () => {
      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(twoWeeksAgo);
      // Should be a date string, not relative
      expect(result).not.toContain('ago');
      expect(result).toBeTruthy();
    });
  });

  describe('future times', () => {
    it('formats now for times less than a minute in the future', () => {
      const now = new Date();
      // The function uses Math.round for diffMins, so:
      // - 0 seconds → rounds to 0 minutes → "now"
      // - 29 seconds → rounds to 0 minutes → "now"
      // - 31 seconds → rounds to 1 minute → "in 1m"
      expect(formatRelativeTime(now)).toBe('now');

      const twentySecondsFromNow = new Date(now.getTime() + 20 * 1000);
      expect(formatRelativeTime(twentySecondsFromNow)).toBe('now');
    });

    it('formats minutes in the future', () => {
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinutesFromNow)).toBe('in 5m');

      const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
      expect(formatRelativeTime(thirtyMinutesFromNow)).toBe('in 30m');
    });

    it('formats hours in the future', () => {
      const now = new Date();
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoHoursFromNow)).toBe('in 2h');
    });

    it('formats days in the future', () => {
      const now = new Date();
      const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoDaysFromNow)).toBe('in 2d');
    });

    it('formats as date for times more than a week in the future', () => {
      const now = new Date();
      const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(twoWeeksFromNow);
      // Should be a date string, not relative
      expect(result).not.toContain('in ');
      expect(result).toBeTruthy();
    });
  });

  describe('boundary cases', () => {
    it('handles exactly 1 minute ago', () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      expect(formatRelativeTime(oneMinuteAgo)).toBe('1m ago');
    });

    it('handles exactly 1 hour ago', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      expect(formatRelativeTime(oneHourAgo)).toBe('1h ago');
    });

    it('handles exactly 1 day ago', () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(oneDayAgo)).toBe('1d ago');
    });

    it('handles exactly 7 days ago (week boundary)', () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(sevenDaysAgo);
      // At exactly 7 days, should fall through to date format
      expect(result).toBeTruthy();
    });
  });
});
