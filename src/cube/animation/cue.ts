import { inverseMove } from '../notation';
import type { Move } from '../types';
import type { PlaybackState } from './playback';

export interface TurnCue {
  readonly move: Move;
  readonly direction: 'clockwise' | 'counter-clockwise';
  readonly partialRewind: boolean;
}

export function turnCue(state: PlaybackState): TurnCue | null {
  const transition = state.transition;
  const source = transition?.move ?? state.solution?.moves[state.step];
  if (!source) return null;
  const partialRewind = transition?.goal === 0;
  // R2 is its own algebraic inverse, but rewinding its animation reverses physical direction.
  const physicalTurns = source.turns * (partialRewind ? -1 : 1);
  return {
    move: partialRewind ? inverseMove(source) : source,
    direction: physicalTurns > 0 ? 'clockwise' : 'counter-clockwise',
    partialRewind,
  };
}
