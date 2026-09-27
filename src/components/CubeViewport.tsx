import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { CubeScene, type CubeInspection } from '../cube/rendering/CubeScene';
import type { TurnCue } from '../cube/animation/cue';
import type { ColorScheme, CubeState, Face, Move } from '../cube/types';

export interface CubeViewportHandle {
  lookAt(face: Face | null): void;
  inspect(): CubeInspection | null;
}

interface Props {
  cube: CubeState;
  scheme: ColorScheme;
  animation: { move: Move; progress: number } | null;
  highlight: TurnCue | null;
  symbols: boolean;
  reducedMotion: boolean;
}

export const CubeViewport = forwardRef<CubeViewportHandle, Props>(function CubeViewport(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<CubeScene | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    lookAt: (face) => scene.current?.lookAt(face),
    inspect: () => scene.current?.inspect() ?? null,
  }), []);

  useEffect(() => {
    if (!host.current) return;
    try {
      scene.current = new CubeScene(host.current, setError);
      const p = latest.current;
      scene.current.setFrame(p.cube, p.scheme, p.reducedMotion ? null : p.animation, p.highlight, p.symbols);
    } catch (error) {
      setError(`3D view unavailable: ${error instanceof Error ? error.message : 'WebGL could not start'}. Enable WebGL or hardware acceleration. You can still use the face diagrams and written instructions.`);
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    scene.current?.setFrame(
      props.cube, props.scheme, props.reducedMotion ? null : props.animation, props.highlight, props.symbols,
    );
  }, [props.cube, props.scheme, props.animation, props.highlight, props.symbols, props.reducedMotion]);

  return (
    <div className="cube-viewport" data-testid="cube-viewport">
      <div ref={host} className="webgl-host" />
      {error && <div className="webgl-error" role="alert">{error}</div>}
    </div>
  );
});
