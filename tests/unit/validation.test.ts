import { describe, expect, it } from 'vitest';
import { CORNER_FACELETS, EDGE_FACELETS, solvedCube, toColors } from '../../src/cube/model';
import { PRACTICE_SCHEME, type Color } from '../../src/cube/types';
import { validateColors, type ValidationIssue } from '../../src/cube/validation';
import { emptyEntry, entryWithCenters, ManualInputProvider, paintSticker } from '../../src/input/provider';

const valid = () => [...toColors(solvedCube(), PRACTICE_SCHEME)];
function issues(input: readonly unknown[]): readonly ValidationIssue[] {
  const result = validateColors(input);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.issues;
}
function cycle(input: Color[], indices: readonly number[]) {
  const copy = [...input];
  indices.forEach((index, i) => { input[index] = copy[indices[(i + 1) % indices.length]]; });
}

describe('physical user-entry validation', () => {
  it('accepts a solved color entry and uses its centers', () => {
    const result = validateColors(valid());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cube).toEqual(solvedCube());
      expect(result.scheme).toEqual(PRACTICE_SCHEME);
    }
  });

  it('reports missing stickers separately from wrong totals', () => {
    expect(issues([])[0].code).toBe('length');
    expect(issues(valid().slice(0, 53))[0].message).toContain('53');
    const input: (Color | null)[] = valid();
    input[53] = null;
    expect(issues(input)[0]).toMatchObject({ code: 'incomplete', indices: [53] });
    expect(issues(input)[0].message).toContain('Back');
  });

  it('reports exact color counts and unknown colors', () => {
    const input = valid();
    input[0] = 'blue';
    const errors = issues(input);
    expect(errors.find((error) => error.message.includes('10 blue'))?.code).toBe('color-count');
    expect(errors.find((error) => error.message.includes('8 white'))?.code).toBe('color-count');
    expect(issues([...valid().slice(0, 53), 'magenta'])[0].code).toBe('incomplete');
  });

  it('rejects duplicate centers even when color counts remain correct', () => {
    const input = valid();
    [input[4], input[9]] = [input[9], input[4]];
    expect(issues(input).some((issue) => issue.code === 'centers')).toBe(true);
  });

  it('rejects a single edge flip without falsely localizing the error', () => {
    const input = valid();
    cycle(input, EDGE_FACELETS[0]);
    const error = issues(input).find((issue) => issue.code === 'edge-flip');
    expect(error).toBeDefined();
    expect(error?.indices).toEqual([]);
    expect(error?.message).toContain('cannot identify');
  });

  it('rejects a single corner twist', () => {
    const input = valid();
    cycle(input, CORNER_FACELETS[0]);
    expect(issues(input).some((issue) => issue.code === 'corner-twist')).toBe(true);
  });

  it('rejects corner mirroring instead of silently decoding a different cube', () => {
    const input = valid();
    cycle(input, [9, 20]);
    expect(issues(input).find((issue) => issue.code === 'corner')?.indices).toEqual(CORNER_FACELETS[0]);
  });

  it('rejects exactly two swapped edges with a global parity diagnosis', () => {
    const input = valid();
    EDGE_FACELETS[0].forEach((index, i) => {
      const other = EDGE_FACELETS[1][i];
      [input[index], input[other]] = [input[other], input[index]];
    });
    const errors = issues(input);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('parity');
    expect(errors[0].indices).toEqual([]);
  });

  it('rejects duplicate edges and reports their colors and positions', () => {
    const input = valid();
    // UR -> UF and DF -> DR preserves all color counts, duplicating UF and DR.
    [input[10], input[25]] = [input[25], input[10]];
    const errors = issues(input);
    expect(errors.filter((issue) => issue.code === 'duplicate')).toHaveLength(2);
    expect(errors.some((issue) => issue.message.includes('white/green'))).toBe(true);
  });

  it('rejects repeated/impossible corner combinations with affected indices', () => {
    const input = valid();
    [input[9], input[44]] = [input[44], input[9]];
    expect(issues(input).some((issue) => issue.code === 'corner' || issue.code === 'duplicate')).toBe(true);
  });
});

describe('manual input boundary', () => {
  it('leaves 48 distinct empty stickers after center setup and locks the centers', () => {
    expect(emptyEntry().filter((sticker) => sticker === null)).toHaveLength(54);
    const entry = entryWithCenters(PRACTICE_SCHEME);
    expect(entry.filter((sticker) => sticker === null)).toHaveLength(48);
    expect(() => paintSticker(entry, 4, 'blue')).toThrow('Centers are fixed');
    expect(paintSticker(entry, 0, 'red')[0]).toBe('red');
    expect(entry[0]).toBe(null);
    expect(new ManualInputProvider(entry).capture()).toEqual({ provider: 'manual', stickers: entry });
  });
});
