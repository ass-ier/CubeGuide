import type { CubeInspection } from '../cube/rendering/CubeScene';
import type { StickerInput } from '../cube/types';

export interface CubeGuideInspection {
  readonly app: 'CubeGuide';
  readonly source: 'entry' | 'practice';
  readonly cubeFacelets: string;
  readonly initialFacelets: string;
  readonly solved: boolean;
  readonly verified: boolean;
  readonly step: number;
  readonly speed: number;
  readonly running: boolean;
  readonly transition: { readonly progress: number; readonly goal: number; readonly move: string } | null;
  readonly solutionLength: number;
  readonly solutionMoves: string;
  readonly snapshots: readonly string[];
  readonly solverStatus: string;
  readonly entry: StickerInput;
  readonly visual: CubeInspection | null;
}

declare global {
  interface Window {
    readonly __cubeGuide: {
      inspect(): CubeGuideInspection;
    };
  }
}
