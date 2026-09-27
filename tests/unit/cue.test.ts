import { describe, expect, it } from 'vitest';
import { turnCue } from '../../src/cube/animation/cue';
import { createPlayback, playbackReducer } from '../../src/cube/animation/playback';
import { solvedCube } from '../../src/cube/model';
import { applyAlgorithm } from '../../src/cube/moves';
import { inverseAlgorithm, parseAlgorithm } from '../../src/cube/notation';
import { verifySolution } from '../../src/cube/solver/verification';
import { FACES } from '../../src/cube/types';

describe('physical cue direction is distinct from algebraic inverse notation', () => {
  for (const face of FACES) {
    it(`${face}2 reverses its partial animation counter-clockwise but keeps valid half-turn notation`, () => {
      const moves = parseAlgorithm(`${face}2`);
      const original = applyAlgorithm(solvedCube(), moves);
      const solution = verifySolution(original, inverseAlgorithm(moves));
      let state = playbackReducer(createPlayback(original), { type: 'solution', solution });
      state = playbackReducer(state, { type: 'next' });
      state = playbackReducer(state, { type: 'tick', deltaMs: 500, generation: state.generation });
      expect(turnCue(state)?.direction).toBe('clockwise');
      state = playbackReducer(state, { type: 'previous' });
      expect(turnCue(state)).toEqual({ move: { face, turns: 2 }, direction: 'counter-clockwise', partialRewind: true });
    });

    it(`${face}2 uses a clockwise half turn when undoing the whole completed move`, () => {
      const moves = parseAlgorithm(`${face}2`);
      const original = applyAlgorithm(solvedCube(), moves);
      const solution = verifySolution(original, moves);
      let state = playbackReducer(createPlayback(original), { type: 'solution', solution });
      state = playbackReducer(state, { type: 'seek', step: 1 });
      state = playbackReducer(state, { type: 'previous' });
      expect(turnCue(state)).toEqual({ move: { face, turns: 2 }, direction: 'clockwise', partialRewind: false });
    });
  }

  it('reverses a partial prime turn clockwise', () => {
    const original = applyAlgorithm(solvedCube(), parseAlgorithm('R'));
    const solution = verifySolution(original, parseAlgorithm("R'"));
    let state = playbackReducer(createPlayback(original), { type: 'solution', solution });
    state = playbackReducer(state, { type: 'next' });
    expect(turnCue(state)?.direction).toBe('counter-clockwise');
    state = playbackReducer(state, { type: 'previous' });
    expect(turnCue(state)).toMatchObject({ direction: 'clockwise', move: { face: 'R', turns: 1 } });
  });
});
