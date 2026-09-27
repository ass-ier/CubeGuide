import { useCallback, useEffect, useRef, useState } from 'react';
import { SolverClient } from '../cube/solver/client';
import type { SolverPhase } from '../cube/solver/solve';
import type { VerifiedSolution } from '../cube/solver/verification';
import type { CubeState } from '../cube/types';

export type SolverStatus =
  | { kind: 'idle' }
  | { kind: 'working'; phase: SolverPhase }
  | { kind: 'error'; message: string };

export function useSolver() {
  const client = useRef<SolverClient | null>(null);
  const version = useRef(0);
  const [status, setStatus] = useState<SolverStatus>({ kind: 'idle' });
  useEffect(() => () => {
    version.current++;
    client.current?.dispose();
  }, []);

  const cancel = useCallback(() => {
    version.current++;
    client.current?.cancel();
    setStatus({ kind: 'idle' });
  }, []);

  const solve = useCallback(async (cube: CubeState): Promise<VerifiedSolution | null> => {
    const ownVersion = ++version.current;
    client.current ??= new SolverClient();
    try {
      const solution = await client.current.solve(cube, (phase) => {
        if (ownVersion === version.current) setStatus({ kind: 'working', phase });
      });
      if (ownVersion !== version.current) return null;
      setStatus({ kind: 'idle' });
      return solution;
    } catch (error) {
      if (ownVersion !== version.current || (error instanceof Error && error.name === 'AbortError')) return null;
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'The solver failed. Your input is preserved; try again.' });
      return null;
    }
  }, []);

  return { status, solve, cancel };
}
