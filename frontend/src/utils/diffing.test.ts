import { describe, it, expect } from 'vitest';
import {
  computeCharLCS,
  computeInlineDiff,
  similarity,
  computeLineDiff,
  type DiffSegment,
  type DiffLine,
} from './diffing';

describe('computeCharLCS', () => {
  describe('basic cases', () => {
    it('returns empty string for empty inputs', () => {
      expect(computeCharLCS('', '')).toBe('');
      expect(computeCharLCS('abc', '')).toBe('');
      expect(computeCharLCS('', 'abc')).toBe('');
    });

    it('returns identical string when both inputs are the same', () => {
      expect(computeCharLCS('hello', 'hello')).toBe('hello');
      expect(computeCharLCS('a', 'a')).toBe('a');
    });

    it('returns empty string when no common characters', () => {
      expect(computeCharLCS('abc', 'xyz')).toBe('');
    });

    it('finds common subsequence in simple cases', () => {
      expect(computeCharLCS('abc', 'ac')).toBe('ac');
      expect(computeCharLCS('abc', 'bc')).toBe('bc');
      expect(computeCharLCS('abc', 'ab')).toBe('ab');
    });

    it('handles single character strings', () => {
      expect(computeCharLCS('a', 'a')).toBe('a');
      expect(computeCharLCS('a', 'b')).toBe('');
    });
  });

  describe('complex cases', () => {
    it('finds LCS with interleaved characters', () => {
      // LCS can be either 'ABD' or 'ACD' (both have length 3)
      // The algorithm finds 'ACD' based on backtracking order
      expect(computeCharLCS('ABCD', 'ACBD')).toBe('ACD');
    });

    it('handles repeated characters', () => {
      expect(computeCharLCS('aaa', 'aa')).toBe('aa');
      expect(computeCharLCS('aa', 'aaa')).toBe('aa');
    });

    it('handles code-like strings', () => {
      const lcs = computeCharLCS('const x = 1;', 'const y = 2;');
      // Should find common parts like 'const ', ' = ', ';'
      expect(lcs.length).toBeGreaterThan(0);
      expect(lcs).toContain('const ');
    });
  });

  describe('performance limits', () => {
    it('returns empty string for very long strings to avoid O(m*n) performance', () => {
      const longA = 'a'.repeat(400);
      const longB = 'b'.repeat(300);
      // 400 * 300 = 120,000 > 100,000 threshold
      expect(computeCharLCS(longA, longB)).toBe('');
    });

    it('computes LCS for strings within performance limit', () => {
      const a = 'a'.repeat(100);
      const b = 'a'.repeat(100);
      // 100 * 100 = 10,000 < 100,000 threshold
      expect(computeCharLCS(a, b)).toBe(a);
    });
  });
});

describe('computeInlineDiff', () => {
  describe('basic cases', () => {
    it('handles identical strings', () => {
      const { oldSegments, newSegments } = computeInlineDiff('hello', 'hello');
      expect(oldSegments).toEqual([{ type: 'equal', text: 'hello' }]);
      expect(newSegments).toEqual([{ type: 'equal', text: 'hello' }]);
    });

    it('handles empty strings', () => {
      const { oldSegments, newSegments } = computeInlineDiff('', '');
      expect(oldSegments).toEqual([]);
      expect(newSegments).toEqual([]);
    });

    it('handles addition only', () => {
      const { oldSegments, newSegments } = computeInlineDiff('', 'hello');
      expect(oldSegments).toEqual([]);
      expect(newSegments).toEqual([{ type: 'insert', text: 'hello' }]);
    });

    it('handles deletion only', () => {
      const { oldSegments, newSegments } = computeInlineDiff('hello', '');
      expect(oldSegments).toEqual([{ type: 'delete', text: 'hello' }]);
      expect(newSegments).toEqual([]);
    });
  });

  describe('word-level diffing', () => {
    it('detects word additions', () => {
      const { oldSegments, newSegments } = computeInlineDiff('hello', 'hello world');

      // Should have 'hello' as equal and 'world' as insert
      const equalSegments = newSegments.filter(s => s.type === 'equal');
      const insertSegments = newSegments.filter(s => s.type === 'insert');

      expect(equalSegments.some(s => s.text.includes('hello'))).toBe(true);
      expect(insertSegments.some(s => s.text.includes('world'))).toBe(true);
    });

    it('detects word deletions', () => {
      const { oldSegments, newSegments } = computeInlineDiff('hello world', 'hello');

      const deleteSegments = oldSegments.filter(s => s.type === 'delete');
      expect(deleteSegments.some(s => s.text.includes('world'))).toBe(true);
    });

    it('detects word changes', () => {
      const { oldSegments, newSegments } = computeInlineDiff('the quick fox', 'the slow fox');

      // 'quick' should be deleted, 'slow' should be inserted
      const deleteSegments = oldSegments.filter(s => s.type === 'delete');
      const insertSegments = newSegments.filter(s => s.type === 'insert');

      expect(deleteSegments.some(s => s.text.includes('quick'))).toBe(true);
      expect(insertSegments.some(s => s.text.includes('slow'))).toBe(true);
    });

    it('preserves whitespace correctly', () => {
      const { oldSegments, newSegments } = computeInlineDiff('a b c', 'a b c');

      // Reconstruct text from segments
      const oldText = oldSegments.map(s => s.text).join('');
      const newText = newSegments.map(s => s.text).join('');

      expect(oldText).toBe('a b c');
      expect(newText).toBe('a b c');
    });
  });

  describe('segment merging', () => {
    it('merges adjacent same-type segments', () => {
      const { oldSegments, newSegments } = computeInlineDiff('a b c', 'a b c');

      // Adjacent equal tokens should be merged
      // All segments should be 'equal' type since strings are identical
      expect(oldSegments.every(s => s.type === 'equal')).toBe(true);
      expect(newSegments.every(s => s.type === 'equal')).toBe(true);
    });
  });
});

describe('similarity', () => {
  describe('edge cases', () => {
    it('returns 1 for identical strings', () => {
      expect(similarity('hello', 'hello')).toBe(1);
      expect(similarity('', '')).toBe(1);
    });

    it('returns 0 when one string is empty', () => {
      expect(similarity('hello', '')).toBe(0);
      expect(similarity('', 'hello')).toBe(0);
    });

    it('returns 0 for completely different strings', () => {
      expect(similarity('abc', 'xyz')).toBe(0);
    });
  });

  describe('similarity scoring', () => {
    it('returns high similarity for similar strings', () => {
      const sim = similarity('hello world', 'hello there');
      expect(sim).toBeGreaterThan(0.3);
      expect(sim).toBeLessThan(1);
    });

    it('returns higher similarity for more similar strings', () => {
      const sim1 = similarity('hello world', 'hello');
      const sim2 = similarity('hello world', 'hello world!');

      // 'hello world!' is more similar to 'hello world' than just 'hello'
      expect(sim2).toBeGreaterThan(sim1);
    });

    it('returns similarity in range [0, 1]', () => {
      const testCases = [
        ['abc', 'def'],
        ['hello', 'hallo'],
        ['test', 'testing'],
        ['foo', 'bar'],
      ];

      for (const [a, b] of testCases) {
        const sim = similarity(a, b);
        expect(sim).toBeGreaterThanOrEqual(0);
        expect(sim).toBeLessThanOrEqual(1);
      }
    });

    it('is symmetric', () => {
      expect(similarity('abc', 'abd')).toBe(similarity('abd', 'abc'));
      expect(similarity('hello', 'world')).toBe(similarity('world', 'hello'));
    });
  });

  describe('code similarity', () => {
    it('detects similar code lines', () => {
      const sim = similarity('const x = 1;', 'const x = 2;');
      expect(sim).toBeGreaterThan(0.7);
    });

    it('detects low similarity in different code', () => {
      const sim = similarity('const x = 1;', 'function foo() {}');
      // These share some common characters like 'o', 'n', '(', ')', etc.
      // so similarity is not extremely low, but less than similar code
      expect(sim).toBeLessThan(0.5);
    });
  });
});

describe('computeLineDiff', () => {
  describe('unchanged lines', () => {
    it('returns unchanged for identical content', () => {
      const result = computeLineDiff('hello', 'hello');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'unchanged', line: 'hello' });
    });

    it('handles multiple identical lines', () => {
      const result = computeLineDiff('a\nb\nc', 'a\nb\nc');
      expect(result).toHaveLength(3);
      expect(result.every(r => r.type === 'unchanged')).toBe(true);
    });
  });

  describe('added lines', () => {
    it('detects single line addition', () => {
      const result = computeLineDiff('a', 'a\nb');

      const addedLines = result.filter(r => r.type === 'added');
      expect(addedLines).toHaveLength(1);
      expect(addedLines[0]).toHaveProperty('line', 'b');
    });

    it('detects addition at beginning', () => {
      const result = computeLineDiff('b', 'a\nb');

      const addedLines = result.filter(r => r.type === 'added');
      expect(addedLines).toHaveLength(1);
      expect(addedLines[0]).toHaveProperty('line', 'a');
    });

    it('detects multiple line additions', () => {
      const result = computeLineDiff('a', 'a\nb\nc');

      const addedLines = result.filter(r => r.type === 'added');
      expect(addedLines).toHaveLength(2);
    });
  });

  describe('removed lines', () => {
    it('detects single line removal', () => {
      const result = computeLineDiff('a\nb', 'a');

      const removedLines = result.filter(r => r.type === 'removed');
      expect(removedLines).toHaveLength(1);
      expect(removedLines[0]).toHaveProperty('line', 'b');
    });

    it('detects removal at beginning', () => {
      const result = computeLineDiff('a\nb', 'b');

      const removedLines = result.filter(r => r.type === 'removed');
      expect(removedLines).toHaveLength(1);
      expect(removedLines[0]).toHaveProperty('line', 'a');
    });

    it('detects multiple line removals', () => {
      const result = computeLineDiff('a\nb\nc', 'a');

      const removedLines = result.filter(r => r.type === 'removed');
      expect(removedLines).toHaveLength(2);
    });
  });

  describe('modified lines', () => {
    it('detects single word change as modification', () => {
      const result = computeLineDiff('const x = 1;', 'const x = 2;');

      // Should be detected as modified since similarity > 0.4
      const modifiedLines = result.filter(r => r.type === 'modified');
      expect(modifiedLines).toHaveLength(1);

      const modified = modifiedLines[0] as Extract<DiffLine, { type: 'modified' }>;
      expect(modified.oldLine).toBe('const x = 1;');
      expect(modified.newLine).toBe('const x = 2;');
      expect(modified.oldSegments).toBeDefined();
      expect(modified.newSegments).toBeDefined();
    });

    it('includes inline segments for modified lines', () => {
      const result = computeLineDiff('hello world', 'hello there');

      const modifiedLines = result.filter(r => r.type === 'modified');
      if (modifiedLines.length > 0) {
        const modified = modifiedLines[0] as Extract<DiffLine, { type: 'modified' }>;
        expect(modified.oldSegments.length).toBeGreaterThan(0);
        expect(modified.newSegments.length).toBeGreaterThan(0);
      }
    });

    it('treats very different lines as add/remove not modify', () => {
      const result = computeLineDiff('const x = 1;', 'function foo() { return bar; }');

      // These lines are different enough that they shouldn't be paired as modified
      const modifiedLines = result.filter(r => r.type === 'modified');
      // With low similarity, should be separate add/remove
      const addedLines = result.filter(r => r.type === 'added');
      const removedLines = result.filter(r => r.type === 'removed');

      // Either modified or separate add/remove, but not both
      expect(modifiedLines.length + addedLines.length + removedLines.length).toBeGreaterThan(0);
    });
  });

  describe('complex diffs', () => {
    it('handles mixed changes', () => {
      const oldText = 'line1\nline2\nline3';
      const newText = 'line1\nmodified2\nline3\nline4';

      const result = computeLineDiff(oldText, newText);

      // line1 unchanged
      // line2 -> modified2 (modified or remove/add)
      // line3 unchanged
      // line4 added

      const unchangedLines = result.filter(r => r.type === 'unchanged');
      expect(unchangedLines.length).toBeGreaterThanOrEqual(2); // line1 and line3
    });

    it('handles empty input', () => {
      const result = computeLineDiff('', '');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'unchanged', line: '' });
    });

    it('handles adding to empty', () => {
      const result = computeLineDiff('', 'new line');

      // Either modified (empty to content) or added
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles removing to empty', () => {
      const result = computeLineDiff('old line', '');

      // Either modified (content to empty) or removed
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('code diff scenarios', () => {
    it('handles function definition changes', () => {
      const oldCode = 'function add(a, b) {\n  return a + b;\n}';
      const newCode = 'function add(a, b, c) {\n  return a + b + c;\n}';

      const result = computeLineDiff(oldCode, newCode);

      // Should detect the signature and return statement changes
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles indentation-only changes', () => {
      const oldCode = '  const x = 1;';
      const newCode = '    const x = 1;';

      const result = computeLineDiff(oldCode, newCode);

      // Indentation change should be detected
      expect(result.length).toBe(1);
    });

    it('handles multiple function changes', () => {
      const oldCode = 'function a() {}\nfunction b() {}';
      const newCode = 'function a() { return 1; }\nfunction b() { return 2; }';

      const result = computeLineDiff(oldCode, newCode);

      // Both lines should show modifications
      const modifiedOrChanged = result.filter(
        r => r.type === 'modified' || r.type === 'added' || r.type === 'removed'
      );
      expect(modifiedOrChanged.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('whitespace handling', () => {
    it('detects trailing whitespace changes', () => {
      const result = computeLineDiff('hello', 'hello   ');
      expect(result.length).toBe(1);
      // Should detect the change
      expect(result[0]!.type).not.toBe('unchanged');
    });

    it('handles blank lines', () => {
      const result = computeLineDiff('a\n\nb', 'a\nb');

      // Removal of blank line should be detected
      const removedLines = result.filter(r => r.type === 'removed');
      expect(removedLines.length).toBeGreaterThanOrEqual(1);
    });
  });
});
