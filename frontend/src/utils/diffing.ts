/**
 * Diff utilities for computing text differences with inline highlighting.
 */

/**
 * Represents a segment within a diff line showing what was equal, inserted, or deleted.
 */
export type DiffSegment = { type: 'equal' | 'insert' | 'delete'; text: string };

/**
 * Represents a line in a diff result.
 */
export type DiffLine =
  | { type: 'unchanged'; line: string }
  | { type: 'removed'; line: string; segments?: DiffSegment[] }
  | { type: 'added'; line: string; segments?: DiffSegment[] }
  | { type: 'modified'; oldLine: string; newLine: string; oldSegments: DiffSegment[]; newSegments: DiffSegment[] };

/**
 * Compute character-level Longest Common Subsequence (LCS) for inline diffing.
 * Falls back to empty string for very long strings to avoid O(m*n) performance issues.
 */
export function computeCharLCS(a: string, b: string): string {
  const m = a.length;
  const n = b.length;

  // For very long strings, fall back to simpler comparison
  if (m * n > 100000) return '';

  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = (dp[i - 1]?.[j - 1] ?? 0) + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]?.[j] ?? 0, dp[i]?.[j - 1] ?? 0);
      }
    }
  }

  // Backtrack
  let lcs = '';
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs = a[i - 1] + lcs;
      i--; j--;
    } else if ((dp[i - 1]?.[j] ?? 0) > (dp[i]?.[j - 1] ?? 0)) {
      i--;
    } else {
      j--;
    }
  }
  return lcs;
}

/**
 * Compute word-level diff with inline highlights.
 * Tokenizes strings into words and whitespace, then finds LCS to produce segments.
 */
export function computeInlineDiff(oldStr: string, newStr: string): { oldSegments: DiffSegment[]; newSegments: DiffSegment[] } {
  // Tokenize into words and whitespace
  const tokenize = (s: string) => s.match(/\S+|\s+/g) || [];
  const oldTokens = tokenize(oldStr);
  const newTokens = tokenize(newStr);

  // LCS on tokens
  const m = oldTokens.length;
  const n = newTokens.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldTokens[i - 1] === newTokens[j - 1]) {
        dp[i]![j] = (dp[i - 1]?.[j - 1] ?? 0) + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]?.[j] ?? 0, dp[i]?.[j - 1] ?? 0);
      }
    }
  }

  // Backtrack to build segments
  let i = m, j = n;
  const oldStack: DiffSegment[] = [];
  const newStack: DiffSegment[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      oldStack.push({ type: 'equal', text: oldTokens[i - 1]! });
      newStack.push({ type: 'equal', text: newTokens[j - 1]! });
      i--; j--;
    } else if (j > 0 && (i === 0 || (dp[i]?.[j - 1] ?? 0) >= (dp[i - 1]?.[j] ?? 0))) {
      newStack.push({ type: 'insert', text: newTokens[j - 1]! });
      j--;
    } else if (i > 0) {
      oldStack.push({ type: 'delete', text: oldTokens[i - 1]! });
      i--;
    }
  }

  // Reverse and merge adjacent same-type segments
  const merge = (stack: DiffSegment[]): DiffSegment[] => {
    const result: DiffSegment[] = [];
    for (let k = stack.length - 1; k >= 0; k--) {
      const seg = stack[k]!;
      if (result.length > 0 && result[result.length - 1]!.type === seg.type) {
        result[result.length - 1]!.text += seg.text;
      } else {
        result.push({ ...seg });
      }
    }
    return result;
  };

  return { oldSegments: merge(oldStack), newSegments: merge(newStack) };
}

/**
 * Calculate similarity ratio between two strings (0-1).
 * Uses LCS to determine how similar the strings are.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const lcs = computeCharLCS(a, b);
  return (2 * lcs.length) / (a.length + b.length);
}

/**
 * Intelligent line-based diff with inline highlighting for modified lines.
 * Uses Myers-like algorithm via LCS to find differences between old and new text.
 */
export function computeLineDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  // Use Myers-like diff algorithm via LCS
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i]![j] = (dp[i - 1]?.[j - 1] ?? 0) + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]?.[j] ?? 0, dp[i]?.[j - 1] ?? 0);
      }
    }
  }

  // Backtrack to get edit script
  type Edit = { type: 'keep' | 'delete' | 'insert'; oldIdx?: number; newIdx?: number };
  const edits: Edit[] = [];
  let i = m, j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      edits.push({ type: 'keep', oldIdx: i - 1, newIdx: j - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || (dp[i]?.[j - 1] ?? 0) >= (dp[i - 1]?.[j] ?? 0))) {
      edits.push({ type: 'insert', newIdx: j - 1 });
      j--;
    } else {
      edits.push({ type: 'delete', oldIdx: i - 1 });
      i--;
    }
  }

  edits.reverse();

  // Now process edits, looking for delete+insert pairs that should be "modified"
  const result: DiffLine[] = [];
  let idx = 0;

  while (idx < edits.length) {
    const edit = edits[idx]!;

    if (edit.type === 'keep') {
      result.push({ type: 'unchanged', line: oldLines[edit.oldIdx!]! });
      idx++;
    } else if (edit.type === 'delete') {
      // Look ahead for inserts that might pair with this delete
      const deletes: number[] = [];
      while (idx < edits.length && edits[idx]!.type === 'delete') {
        deletes.push(edits[idx]!.oldIdx!);
        idx++;
      }

      const inserts: number[] = [];
      while (idx < edits.length && edits[idx]!.type === 'insert') {
        inserts.push(edits[idx]!.newIdx!);
        idx++;
      }

      // Try to pair similar deletes and inserts as modifications
      const pairedDeletes = new Set<number>();
      const pairedInserts = new Set<number>();

      for (const delIdx of deletes) {
        let bestMatch = -1;
        let bestSim = 0.4; // Minimum similarity threshold

        for (const insIdx of inserts) {
          if (pairedInserts.has(insIdx)) continue;
          const sim = similarity(oldLines[delIdx]!, newLines[insIdx]!);
          if (sim > bestSim) {
            bestSim = sim;
            bestMatch = insIdx;
          }
        }

        if (bestMatch >= 0) {
          pairedDeletes.add(delIdx);
          pairedInserts.add(bestMatch);

          const { oldSegments, newSegments } = computeInlineDiff(
            oldLines[delIdx]!,
            newLines[bestMatch]!
          );

          result.push({
            type: 'modified',
            oldLine: oldLines[delIdx]!,
            newLine: newLines[bestMatch]!,
            oldSegments,
            newSegments
          });
        }
      }

      // Add unpaired deletes
      for (const delIdx of deletes) {
        if (!pairedDeletes.has(delIdx)) {
          result.push({ type: 'removed', line: oldLines[delIdx]! });
        }
      }

      // Add unpaired inserts
      for (const insIdx of inserts) {
        if (!pairedInserts.has(insIdx)) {
          result.push({ type: 'added', line: newLines[insIdx]! });
        }
      }
    } else {
      // Standalone insert
      result.push({ type: 'added', line: newLines[edit.newIdx!]! });
      idx++;
    }
  }

  return result;
}
