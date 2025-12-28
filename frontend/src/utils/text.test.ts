import { describe, it, expect } from 'vitest';
import { stripAnsiCodes, deduplicateLines, cleanTerminalOutput } from './text';

describe('stripAnsiCodes', () => {
  it('removes CSI sequences (colors, styles)', () => {
    expect(stripAnsiCodes('\x1b[32mGreen text\x1b[0m')).toBe('Green text');
    expect(stripAnsiCodes('\x1b[1;31mBold red\x1b[0m')).toBe('Bold red');
  });

  it('removes OSC sequences (bell terminated)', () => {
    expect(stripAnsiCodes('\x1b]0;Window Title\x07Content')).toBe('Content');
  });

  it('removes OSC sequences (ST terminated)', () => {
    expect(stripAnsiCodes('\x1b]0;Window Title\x1b\\Content')).toBe('Content');
  });

  it('removes DCS, SOS, PM, APC sequences', () => {
    expect(stripAnsiCodes('\x1bPDevice control\x1b\\text')).toBe('text');
    expect(stripAnsiCodes('\x1bXSOS data\x1b\\text')).toBe('text');
  });

  it('removes Fe sequences', () => {
    expect(stripAnsiCodes('\x1bMtext')).toBe('text');
    expect(stripAnsiCodes('\x1bEtext')).toBe('text');
  });

  it('removes mode sequences', () => {
    expect(stripAnsiCodes('\x1b[?25lHidden cursor\x1b[?25h')).toBe('Hidden cursor');
    expect(stripAnsiCodes('\x1b[12htext\x1b[12l')).toBe('text');
  });

  it('removes control characters', () => {
    expect(stripAnsiCodes('Hello\x00World')).toBe('HelloWorld');
    expect(stripAnsiCodes('Line\x0bBreak')).toBe('LineBreak');
  });

  it('preserves normal text', () => {
    expect(stripAnsiCodes('Hello, World!')).toBe('Hello, World!');
    expect(stripAnsiCodes('Line 1\nLine 2')).toBe('Line 1\nLine 2');
  });

  it('handles complex mixed input', () => {
    const input = '\x1b[32mGreen\x1b[0m and \x1b[1;31mbold red\x1b[0m text';
    expect(stripAnsiCodes(input)).toBe('Green and bold red text');
  });
});

describe('deduplicateLines', () => {
  it('removes consecutive duplicate lines', () => {
    const lines = ['hello', 'hello', 'world'];
    expect(deduplicateLines(lines)).toEqual(['hello', 'world']);
  });

  it('removes consecutive blank lines', () => {
    const lines = ['hello', '', '', 'world'];
    expect(deduplicateLines(lines)).toEqual(['hello', '', 'world']);
  });

  it('preserves non-consecutive duplicates', () => {
    const lines = ['hello', 'world', 'hello'];
    expect(deduplicateLines(lines)).toEqual(['hello', 'world', 'hello']);
  });

  it('preserves indentation', () => {
    const lines = ['  indented', '  indented', 'not indented'];
    expect(deduplicateLines(lines)).toEqual(['  indented', 'not indented']);
  });

  it('handles empty input', () => {
    expect(deduplicateLines([])).toEqual([]);
  });

  it('handles single line', () => {
    expect(deduplicateLines(['hello'])).toEqual(['hello']);
  });

  it('handles lines that differ only by whitespace', () => {
    const lines = ['hello  ', '  hello', 'hello'];
    // These all trim to 'hello', so second and third are considered duplicates of first
    expect(deduplicateLines(lines)).toEqual(['hello  ']);
  });
});

describe('cleanTerminalOutput', () => {
  it('strips ANSI codes and cleans output', () => {
    const input = '\x1b[32mGreen\x1b[0m text';
    expect(cleanTerminalOutput(input)).toBe('Green text');
  });

  it('removes carriage returns', () => {
    expect(cleanTerminalOutput('Hello\r\nWorld')).toBe('Hello\nWorld');
    expect(cleanTerminalOutput('Progress: 50%\rProgress: 100%')).toBe('Progress: 50%Progress: 100%');
  });

  it('deduplicates lines', () => {
    const input = 'line1\nline1\nline2';
    expect(cleanTerminalOutput(input)).toBe('line1\nline2');
  });

  it('collapses multiple blank lines', () => {
    const input = 'hello\n\n\n\nworld';
    expect(cleanTerminalOutput(input)).toBe('hello\n\nworld');
  });

  it('handles complex terminal output', () => {
    const input = '\x1b[32mBuilding...\x1b[0m\nBuilding...\nBuilding...\n\n\n\x1b[32mDone!\x1b[0m';
    expect(cleanTerminalOutput(input)).toBe('Building...\n\nDone!');
  });

  it('preserves meaningful content structure', () => {
    const input = 'Header\n\nParagraph 1\n\nParagraph 2';
    expect(cleanTerminalOutput(input)).toBe('Header\n\nParagraph 1\n\nParagraph 2');
  });
});
