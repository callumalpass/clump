/**
 * Text processing utilities for terminal output cleaning
 */

/**
 * Strips ANSI escape codes from text.
 * Handles CSI, OSC, DCS, SOS, PM, APC, Fe sequences, mode sequences, and control characters.
 */
export function stripAnsiCodes(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // CSI sequences
    .replace(/\x1b\][^\x07]*\x07/g, '') // OSC sequences (bell terminated)
    .replace(/\x1b\][^\x1b]*\x1b\\/g, '') // OSC sequences (ST terminated)
    .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '') // DCS, SOS, PM, APC sequences
    .replace(/\x1b[@-Z\\-_]/g, '') // Fe sequences
    .replace(/\x1b\[[\?]?[0-9;]*[hl]/g, '') // Mode sequences
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''); // Other control chars
}

/**
 * Removes consecutive duplicate lines and collapses multiple blank lines.
 * Preserves original indentation of non-duplicate lines.
 */
export function deduplicateLines(lines: string[]): string[] {
  const deduped: string[] = [];
  let prevLine = '';

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip consecutive blank lines
    if (trimmed === '' && prevLine === '') continue;
    // Skip exact duplicate content
    if (trimmed === prevLine) continue;
    deduped.push(line);
    prevLine = trimmed;
  }

  return deduped;
}

/**
 * Cleans terminal output by stripping ANSI codes, removing carriage returns,
 * deduplicating lines, and collapsing excessive blank lines.
 */
export function cleanTerminalOutput(text: string): string {
  // Strip ANSI escape codes
  let cleaned = stripAnsiCodes(text);

  // Remove carriage returns
  cleaned = cleaned.replace(/\r/g, '');

  // Deduplicate consecutive lines
  const lines = cleaned.split('\n');
  const dedupedLines = deduplicateLines(lines);

  // Collapse 3+ consecutive newlines to 2
  return dedupedLines.join('\n').replace(/\n{3,}/g, '\n\n');
}
