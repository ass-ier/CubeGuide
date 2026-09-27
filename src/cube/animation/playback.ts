import { applyMove } from '../moves';
import { inverseMove } from '../notation';
import type { VerifiedSolution } from '../solver/verification';
import type { CubeState, Move } from '../types';

export const SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const;
export type Speed = (typeof SPEEDS)[number];
export const DWELL_MS = 240;

export interface Transition {
  readonly move: Move;
  readonly kind: 'forward' | 'backward' | 'manual';
  readonly progress: number;
  readonly goal: 0 | 1;
  readonly durationMs: number;
  readonly targetCube: CubeState;
  readonly targetStep: number;
}

export interface PlaybackState {
  readonly initialCube: CubeState;
  readonly cube: CubeState;
  readonly solution: VerifiedSolution | null;
  readonly step: number;
  readonly transition: Transition | null;
  readonly running: boolean;
  readonly autoPlay: boolean;
  readonly speed: Speed;
  readonly dwellMs: number;
  readonly generation: number;
}

export type PlaybackAction =
  | { type: 'load'; cube: CubeState }
  | { type: 'solution'; solution: VerifiedSolution }
  | { type: 'tick'; deltaMs: number; generation: number }
  | { type: 'speed'; speed: Speed }
  | { type: 'seek'; step: number }
  | { type: 'turn'; move: Move }
  | { type: 'play' | 'pause' | 'next' | 'previous' | 'restart' };

export function moveDuration(move: Move): number {
  return move.turns === 2 ? 1250 : 900;
}

export function estimatedPlaybackSeconds(moves: readonly Move[], speed: Speed): number {
  return (moves.reduce((total, move) => total + moveDuration(move), 0) + Math.max(0, moves.length - 1) * DWELL_MS) / speed / 1000;
}

export function createPlayback(cube: CubeState): PlaybackState {
  return {
    initialCube: cube, cube, solution: null, step: 0, transition: null,
    running: false, autoPlay: false, speed: 1, dwellMs: 0, generation: 0,
  };
}

function startStep(state: PlaybackState, backward: boolean): PlaybackState {
  if (!state.solution) return state;
  const step = backward ? state.step - 1 : state.step + 1;
  if (step < 0 || step > state.solution.moves.length) return { ...state, running: false, autoPlay: false };
  const move = backward ? inverseMove(state.solution.moves[step]) : state.solution.moves[state.step];
  return {
    ...state,
    running: true,
    dwellMs: 0,
    transition: {
      move, kind: backward ? 'backward' : 'forward',
      progress: 0, goal: 1, durationMs: moveDuration(move),
      targetCube: state.solution.snapshots[step], targetStep: step,
    },
  };
}

function seek(state: PlaybackState, step: number): PlaybackState {
  if (!state.solution) return state;
  if (!Number.isInteger(step) || step < 0 || step > state.solution.moves.length) {
    throw new RangeError('Solution step is outside the available snapshots.');
  }
  return {
    ...state, cube: state.solution.snapshots[step], step,
    transition: null, running: false, autoPlay: false, dwellMs: 0,
    generation: state.generation + 1,
  };
}

function advance(state: PlaybackState, deltaMs: number): PlaybackState {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Animation delta must be a finite non-negative duration.');
  if (!state.running || deltaMs === 0) return state;
  let budget = deltaMs * state.speed;
  let next = state;
  while (budget > 0 && next.running) {
    const transition = next.transition;
    if (transition) {
      const remaining = Math.abs(transition.goal - transition.progress) * transition.durationMs;
      if (budget + 1e-8 < remaining) {
        const direction = transition.goal === 1 ? 1 : -1;
        return { ...next, transition: { ...transition, progress: transition.progress + direction * budget / transition.durationMs } };
      }
      budget = Math.max(0, budget - remaining);
      const cube = transition.goal === 1 ? transition.targetCube : next.cube;
      const step = transition.goal === 1 ? transition.targetStep : next.step;
      const keepPlaying = next.autoPlay && !!next.solution && step < next.solution.moves.length;
      next = {
        ...next, cube, step,
        initialCube: transition.kind === 'manual' ? cube : next.initialCube,
        transition: null, running: keepPlaying, autoPlay: keepPlaying,
        dwellMs: keepPlaying ? DWELL_MS : 0,
      };
    } else if (next.autoPlay && next.solution && next.step < next.solution.moves.length) {
      if (budget < next.dwellMs) return { ...next, dwellMs: next.dwellMs - budget };
      budget -= next.dwellMs;
      next = startStep(next, false);
    } else {
      return { ...next, running: false, autoPlay: false };
    }
  }
  return next;
}

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case 'load':
      return { ...createPlayback(action.cube), speed: state.speed, generation: state.generation + 1 };
    case 'solution': {
      const cube = action.solution.snapshots[0];
      return {
        ...createPlayback(cube), solution: action.solution, speed: state.speed,
        generation: state.generation + 1,
      };
    }
    case 'tick':
      return action.generation === state.generation ? advance(state, action.deltaMs) : state;
    case 'speed':
      if (!SPEEDS.includes(action.speed)) throw new RangeError('Unsupported playback speed.');
      return { ...state, speed: action.speed };
    case 'seek': return seek(state, action.step);
    case 'restart': return seek(state, 0);
    case 'pause': return { ...state, running: false };
    case 'play': {
      if (!state.solution) {
        return state.transition ? { ...state, running: true } : state;
      }
      let next = state;
      if (state.step === state.solution.moves.length && !state.transition) next = seek(state, 0);
      if (!next.solution?.moves.length) return next;
      next = { ...next, running: true, autoPlay: true };
      return next.transition ? next : startStep(next, false);
    }
    case 'next':
    case 'previous': {
      if (!state.solution) return state;
      const backward = action.type === 'previous';
      if (state.transition) {
        const goal = (state.transition.kind === 'backward') === backward ? 1 : 0;
        return {
          ...state, running: true, autoPlay: false, dwellMs: 0,
          transition: { ...state.transition, goal },
        };
      }
      return startStep({ ...state, autoPlay: false }, backward);
    }
    case 'turn':
      if (state.solution || state.transition) return state;
      return {
        ...state, running: true, autoPlay: false,
        transition: {
          move: action.move, kind: 'manual', progress: 0, goal: 1,
          durationMs: moveDuration(action.move), targetCube: applyMove(state.cube, action.move), targetStep: 0,
        },
      };
  }
}
