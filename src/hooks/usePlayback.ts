import { useEffect, useReducer } from 'react';
import { createPlayback, playbackReducer } from '../cube/animation/playback';
import type { CubeState } from '../cube/types';

export function usePlayback(initialCube: CubeState) {
  const [state, dispatch] = useReducer(playbackReducer, initialCube, createPlayback);
  useEffect(() => {
    if (!state.running) return;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      dispatch({ type: 'tick', deltaMs: Math.min(64, Math.max(0, now - last)), generation: state.generation });
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state.running, state.generation]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) dispatch({ type: 'pause' });
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);
  return [state, dispatch] as const;
}
