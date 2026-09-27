import { describe, expect, it } from 'vitest';
import {
  createPlayback, DWELL_MS, estimatedPlaybackSeconds, moveDuration, playbackReducer, SPEEDS, type PlaybackState,
} from '../../src/cube/animation/playback';
import { applyAlgorithm, applyMove } from '../../src/cube/moves';
import { isSolved, solvedCube } from '../../src/cube/model';
import { parseAlgorithm, parseMove } from '../../src/cube/notation';
import { verifySolution } from '../../src/cube/solver/verification';

function ready(): PlaybackState {
  const cube = applyAlgorithm(solvedCube(), parseAlgorithm('R U2 F'));
  const solution = verifySolution(cube, parseAlgorithm("F' U2 R'"));
  return playbackReducer(createPlayback(cube), { type: 'solution', solution });
}
function tick(state: PlaybackState, ms: number) {
  return playbackReducer(state, { type: 'tick', deltaMs: ms, generation: state.generation });
}

describe('deterministic interruptible playback', () => {
  it('next animates exactly one move and only commits on completion', () => {
    let state = ready();
    const original = state.cube;
    state = playbackReducer(state, { type: 'next' });
    state = tick(state, 400);
    expect(state.step).toBe(0);
    expect(state.cube).toBe(original);
    expect(state.transition?.progress).toBeCloseTo(400 / 900);
    state = tick(state, 10000);
    expect(state.step).toBe(1);
    expect(state.cube).toBe(state.solution!.snapshots[1]);
    expect(state.running).toBe(false);
  });

  it('previous animates the inverse and reaches the exact earlier snapshot', () => {
    let state = playbackReducer(ready(), { type: 'seek', step: 2 });
    state = playbackReducer(state, { type: 'previous' });
    expect(state.transition?.move).toEqual(parseMove('U2'));
    state = tick(state, 1500);
    expect(state.step).toBe(1);
    expect(state.cube).toEqual(state.solution!.snapshots[1]);
    state = tick(playbackReducer(state, { type: 'previous' }), 1500);
    expect(state.step).toBe(0);
    expect(state.cube).toEqual(state.initialCube);
  });

  it('pause freezes a partial layer turn, including repeated frames, then resumes it', () => {
    let state = tick(playbackReducer(ready(), { type: 'play' }), 333);
    const transition = state.transition;
    state = playbackReducer(state, { type: 'pause' });
    expect(tick(state, 10000)).toBe(state);
    expect(state.transition).toBe(transition);
    state = tick(playbackReducer(state, { type: 'play' }), 200);
    expect(state.transition?.progress).toBeCloseTo(533 / 900);
    state = tick(state, 10000);
    expect(state.step).toBe(3);
    expect(isSolved(state.cube)).toBe(true);
    expect(state.running).toBe(false);
  });

  it('previous reverses a partially completed forward turn without snapping', () => {
    let state = tick(playbackReducer(ready(), { type: 'next' }), 450);
    state = playbackReducer(state, { type: 'previous' });
    expect(state.transition?.progress).toBe(0.5);
    expect(state.transition?.goal).toBe(0);
    state = tick(state, 225);
    expect(state.transition?.progress).toBeCloseTo(0.25);
    state = tick(state, 225);
    expect(state.transition).toBe(null);
    expect(state.step).toBe(0);
    expect(state.cube).toBe(state.initialCube);
  });

  it('next reverses a partial undo and returns to the current committed step', () => {
    let state = playbackReducer(ready(), { type: 'seek', step: 1 });
    const cube = state.cube;
    state = tick(playbackReducer(state, { type: 'previous' }), 400);
    state = playbackReducer(state, { type: 'next' });
    state = tick(state, 1000);
    expect(state.step).toBe(1);
    expect(state.cube).toBe(cube);
  });

  it('next during autoplay finishes only the active move', () => {
    let state = tick(playbackReducer(ready(), { type: 'play' }), 400);
    state = playbackReducer(state, { type: 'next' });
    state = tick(state, 10000);
    expect(state.step).toBe(1);
    expect(state.running).toBe(false);
  });

  it('seek/restart invalidate in-flight frames and restore exact snapshots', () => {
    let state = tick(playbackReducer(ready(), { type: 'play' }), 350);
    const staleGeneration = state.generation;
    state = playbackReducer(state, { type: 'seek', step: 2 });
    expect(state.transition).toBe(null);
    expect(state.cube).toBe(state.solution!.snapshots[2]);
    expect(playbackReducer(state, { type: 'tick', deltaMs: 2000, generation: staleGeneration })).toBe(state);
    state = tick(playbackReducer(state, { type: 'play' }), 300);
    state = playbackReducer(state, { type: 'restart' });
    expect(state.step).toBe(0);
    expect(state.cube).toBe(state.initialCube);
    expect(state.running).toBe(false);
  });

  for (const speed of SPEEDS) {
    it(`${speed}x scales elapsed time without changing the cube or move`, () => {
      let state = playbackReducer(ready(), { type: 'speed', speed });
      state = tick(playbackReducer(state, { type: 'next' }), 200);
      expect(state.transition?.progress).toBeCloseTo(200 * speed / 900);
      expect(state.step).toBe(0);
    });
  }

  it('changing speed mid-turn preserves progress and applies immediately', () => {
    let state = tick(playbackReducer(ready(), { type: 'next' }), 225);
    state = playbackReducer(state, { type: 'speed', speed: 2 });
    expect(state.transition?.progress).toBe(0.25);
    state = tick(state, 225);
    expect(state.transition?.progress).toBe(0.75);
  });

  it('pauses between moves without starting another move', () => {
    let state = tick(playbackReducer(ready(), { type: 'play' }), 900 + DWELL_MS / 2);
    expect(state.step).toBe(1);
    expect(state.transition).toBe(null);
    state = playbackReducer(state, { type: 'pause' });
    expect(tick(state, 5000).step).toBe(1);
  });

  it('loads a new cube safely even while old animation is in flight', () => {
    let state = tick(playbackReducer(ready(), { type: 'play' }), 350);
    const old = state.generation;
    const cube = applyMove(solvedCube(), parseMove('B'));
    state = playbackReducer(state, { type: 'load', cube });
    expect(state.solution).toBe(null);
    expect(state.transition).toBe(null);
    expect(state.cube).toBe(cube);
    expect(playbackReducer(state, { type: 'tick', generation: old, deltaMs: 2000 })).toBe(state);
  });

  it('supports standalone direct face turns, but not competing turns', () => {
    let state = createPlayback(solvedCube());
    state = playbackReducer(state, { type: 'turn', move: parseMove('R') });
    expect(playbackReducer(state, { type: 'turn', move: parseMove('U') })).toBe(state);
    state = tick(state, 1000);
    expect(state.cube).toEqual(applyMove(solvedCube(), parseMove('R')));
    expect(state.initialCube).toBe(state.cube);
  });

  it('handles rapid controls and double reversals without drifting', () => {
    let state = ready();
    for (let i = 0; i < 100; i++) {
      state = playbackReducer(state, { type: 'seek', step: i % 3 });
      state = tick(playbackReducer(state, { type: 'next' }), 100);
      state = playbackReducer(state, { type: 'pause' });
      state = tick(playbackReducer(state, { type: 'previous' }), 50);
      state = tick(playbackReducer(state, { type: 'next' }), 5000);
      expect(state.cube).toBe(state.solution!.snapshots[state.step]);
      expect(state.transition).toBe(null);
    }
    state = tick(playbackReducer(state, { type: 'play' }), 10000);
    expect(isSolved(state.cube)).toBe(true);
  });

  it('labels estimated animation time using both durations and inter-move pauses', () => {
    const moves = parseAlgorithm('R U2');
    expect(estimatedPlaybackSeconds(moves, 1)).toBe((moveDuration(moves[0]) + moveDuration(moves[1]) + DWELL_MS) / 1000);
    expect(estimatedPlaybackSeconds([], 2)).toBe(0);
  });
});
