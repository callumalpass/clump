import { describe, it, expect } from 'vitest';
import { formatDuration, calculateDuration } from './useElapsedTime';

describe('formatDuration', () => {
  it('formats zero milliseconds', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('formats negative values as 0s', () => {
    expect(formatDuration(-1000)).toBe('0s');
    expect(formatDuration(-999999)).toBe('0s');
  });

  it('formats seconds only', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(30000)).toBe('30s');
    expect(formatDuration(59000)).toBe('59s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(150000)).toBe('2m 30s');
    expect(formatDuration(3599000)).toBe('59m 59s');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3600000)).toBe('1h 0m');
    expect(formatDuration(3660000)).toBe('1h 1m');
    expect(formatDuration(7200000)).toBe('2h 0m');
    expect(formatDuration(5400000)).toBe('1h 30m');
  });

  it('handles large durations', () => {
    expect(formatDuration(86400000)).toBe('24h 0m'); // 24 hours
    expect(formatDuration(90000000)).toBe('25h 0m'); // 25 hours
  });
});

describe('calculateDuration', () => {
  it('calculates duration between two Date objects', () => {
    const start = new Date('2025-01-01T00:00:00Z');
    const end = new Date('2025-01-01T00:01:30Z');
    expect(calculateDuration(start, end)).toBe('1m 30s');
  });

  it('calculates duration between two ISO strings', () => {
    const start = '2025-01-01T00:00:00Z';
    const end = '2025-01-01T01:30:00Z';
    expect(calculateDuration(start, end)).toBe('1h 30m');
  });

  it('handles naive ISO strings (without timezone) as UTC', () => {
    // Backend often sends timestamps without 'Z' suffix
    const start = '2025-01-01T00:00:00';
    const end = '2025-01-01T00:02:30';
    expect(calculateDuration(start, end)).toBe('2m 30s');
  });

  it('returns 0s for same start and end time', () => {
    const time = '2025-01-01T12:00:00Z';
    expect(calculateDuration(time, time)).toBe('0s');
  });

  it('handles mixed Date and string inputs', () => {
    const start = new Date('2025-01-01T00:00:00Z');
    const end = '2025-01-01T00:05:00Z';
    expect(calculateDuration(start, end)).toBe('5m 0s');
  });
});
