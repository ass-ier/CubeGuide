import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AutomaticPhotoInput } from './components/AutomaticPhotoInput';
import { ColorMark } from './components/ColorMark';
import { CubeNet } from './components/CubeNet';
import type { CubeViewportHandle } from './components/CubeViewport';
import { DiscardDialog, NotationGuide, type PendingChange } from './components/Dialogs';
import { FaceInput } from './components/FaceInput';
import { Icon } from './components/Icon';
import { PracticePanel } from './components/PracticePanel';
import type { PhotoInputHandle } from './components/PhotoInput';
import { SolutionPanel, SolutionTimeline } from './components/SolutionPanel';
import { turnCue } from './cube/animation/cue';
import { cubeKey, isSolved, solvedCube, toColors } from './cube/model';
import { applyAlgorithm } from './cube/moves';
import { formatAlgorithm, formatMove } from './cube/notation';
import { generateScramble } from './cube/scramble';
import { FACE_NAMES, FACES, isFace, PRACTICE_SCHEME, type Color, type ColorScheme, type Face, type Move } from './cube/types';
import { validateColors, type ValidationIssue } from './cube/validation';
import { usePlayback } from './hooks/usePlayback';
import { useReducedMotion } from './hooks/useReducedMotion';
import { useSolver } from './hooks/useSolver';
import { AutomaticPhotoInputProvider, emptyEntry, entryWithCenters, ManualInputProvider, PhotoInputProvider, paintSticker, schemeFromCenters, type InputCapture } from './input/provider';
import type { CubeGuideInspection } from './types/diagnostics';

const PHASE_COPY = {
  initializing: { title: 'Preparing the solver', detail: 'Building the two-phase lookup tables. The first solve can take a few seconds.' },
  solving: { title: 'Finding your solution', detail: 'Searching for a valid move sequence in a background worker. You can still rotate the cube.' },
  verifying: { title: 'Checking every turn', detail: 'Replaying the solution on a copy of your original cube before accepting it.' },
};
const CubeViewport = lazy(() => import('./components/CubeViewport').then((module) => ({ default: module.CubeViewport })));

export default function App() {
  const initial = useMemo(solvedCube, []);
  const [state, dispatch] = usePlayback(initial);
  const solver = useSolver();
  const [source, setSource] = useState<'photo' | 'entry' | 'practice'>('photo');
  const [centers, setCenters] = useState<Partial<Record<Face, Color>>>({});
  const [scheme, setScheme] = useState<ColorScheme | null>(null);
  const [entry, setEntry] = useState(emptyEntry);
  const [selectedColor, setSelectedColor] = useState<Color | null>('white');
  const [activeFace, setActiveFace] = useState<Face>('F');
  const [issues, setIssues] = useState<readonly ValidationIssue[]>([]);
  const [entryPreview, setEntryPreview] = useState(false);
  const [photoEntryOpen, setPhotoEntryOpen] = useState(false);
  const [entryFocusRequest, setEntryFocusRequest] = useState(0);
  const [photoCount, setPhotoCount] = useState(0);
  const [photoWorking, setPhotoWorking] = useState(false);
  const [photoSession, setPhotoSession] = useState(0);
  const photoVersion = useRef(0);
  const [scramble, setScramble] = useState<readonly Move[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [symbols, setSymbols] = useState(true);
  const [reducedMotion, setReducedMotion] = useReducedMotion();
  const [guideOpen, setGuideOpen] = useState(false);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const viewport = useRef<CubeViewportHandle>(null);
  const photoInput = useRef<PhotoInputHandle>(null);
  const manualLock = useRef(false);
  const busy = solver.status.kind === 'working';
  const displayScheme = scheme ?? PRACTICE_SCHEME;
  const solution = state.solution;
  const cue = turnCue(state);
  const meaningful = source === 'practice' || !!solution || Object.keys(centers).length > 0 || entry.some(Boolean) || photoCount > 0;
  const showWorkspace = source !== 'photo' || entryPreview;
  const solved = !!solution && !state.transition && isSolved(state.cube);
  const animation = useMemo(() => state.transition
    ? { move: state.transition.move, progress: state.transition.progress } : null, [state.transition]);

  useEffect(() => { manualLock.current = !!state.transition; }, [state.transition]);

  function requestChange(change: PendingChange) {
    if (meaningful || busy || photoWorking) {
      dispatch({ type: 'pause' });
      setPendingChange(change);
    } else change.run();
  }

  function clearPhotoSession() {
    setPhotoSession(++photoVersion.current);
    setPhotoCount(0);
    setPhotoWorking(false);
  }

  function clearToEntry(nextSource: 'photo' | 'entry' = 'photo') {
    solver.cancel();
    dispatch({ type: 'load', cube: solvedCube() });
    clearPhotoSession();
    setSource(nextSource);
    setCenters({});
    setScheme(null);
    setEntry(emptyEntry());
    setScramble([]);
    setIssues([]);
    setOperationError(null);
    setEntryPreview(false);
    setPhotoEntryOpen(false);
    setEntryFocusRequest((request) => request + 1);
    setActiveFace('F');
    manualLock.current = false;
    viewport.current?.lookAt(null);
  }

  function requestNewCube() {
    requestChange({
      title: 'Start with a new cube?',
      description: 'Your photos, entered colors, practice cube, and current solution will be discarded. Keep your cube to continue where you are.',
      confirmLabel: 'Start new cube',
      run: clearToEntry,
    });
  }

  function requestManualMode() {
    requestChange({
      title: 'Switch to manual entry?',
      description: 'Your photos and current cube will be cleared. You can enter all six faces by hand, or use the optional photo alignment tools.',
      confirmLabel: 'Enter colors manually',
      run: () => clearToEntry('entry'),
    });
  }

  function requestAutomaticMode() {
    requestChange({
      title: 'Switch to automatic photos?',
      description: 'Your manual entry and any solution will be cleared. Add six face photos; their centers and colors will be read automatically.',
      confirmLabel: 'Use automatic photos',
      run: clearToEntry,
    });
  }

  function retakePhotos() {
    requestChange({
      title: 'Retake a face photo?',
      description: 'Your current solution will be removed. All six accepted photos stay available; a failed or cancelled replacement will not remove them.',
      confirmLabel: 'Retake photos',
      run: () => {
        solver.cancel();
        dispatch({ type: 'load', cube: state.initialCube });
        setEntryPreview(false);
        setEntryFocusRequest((request) => request + 1);
      },
    });
  }

  function requestPhotoEntry() {
    setPhotoEntryOpen(true);
    setEntryFocusRequest((request) => request + 1);
  }

  function finishPhotoEntry() {
    setPhotoEntryOpen(false);
    setEntryFocusRequest((request) => request + 1);
  }

  function requestManualEntry() {
    if (photoEntryOpen && photoInput.current) photoInput.current.close();
    else finishPhotoEntry();
  }

  function createPractice() {
    try {
      const moves = generateScramble();
      const cube = applyAlgorithm(solvedCube(), moves);
      solver.cancel();
      clearPhotoSession();
      dispatch({ type: 'load', cube });
      setSource('practice');
      setScheme(PRACTICE_SCHEME);
      setCenters({ ...PRACTICE_SCHEME });
      setEntry(emptyEntry());
      setScramble(moves);
      setIssues([]);
      setOperationError(null);
      setEntryPreview(false);
      setPhotoEntryOpen(false);
      setEntryFocusRequest(0);
      manualLock.current = false;
      viewport.current?.lookAt(null);
    } catch (error) {
      setOperationError(`Could not generate a scramble: ${error instanceof Error ? error.message : 'random number generation failed'}. Your previous cube is preserved.`);
    }
  }

  function requestPractice() {
    requestChange({
      title: 'Try a new practice scramble?',
      description: 'This replaces your current cube, photos, and any solution with a newly generated, legal scramble.',
      confirmLabel: 'Generate scramble',
      run: createPractice,
    });
  }

  function lockCenters() {
    const selectedScheme = schemeFromCenters(centers);
    if (!selectedScheme) {
      setOperationError('Choose six distinct center colors before entering stickers.');
      return;
    }
    setScheme(selectedScheme);
    setEntry(entryWithCenters(selectedScheme));
    setActiveFace('F');
    setIssues([]);
    setOperationError(null);
  }

  function changeCenters() {
    requestChange({
      title: 'Change your reference colors?',
      description: 'Changing the centers clears the other 48 stickers and any solution so they cannot be interpreted in the wrong orientation.',
      confirmLabel: 'Change centers',
      run: () => {
        solver.cancel();
        setScheme(null);
        setEntry(emptyEntry());
        setIssues([]);
        setEntryPreview(false);
        dispatch({ type: 'load', cube: solvedCube() });
      },
    });
  }

  function editColors() {
    requestChange({
      title: 'Edit the starting cube?',
      description: `The current solution will be removed. Your original cube colors will stay in the face editor, ready to correct and solve again.${source === 'photo' ? ' Photo previews will be cleared.' : ''}`,
      confirmLabel: 'Edit colors',
      run: () => {
        solver.cancel();
        clearPhotoSession();
        setEntry(toColors(state.initialCube, displayScheme));
        setScheme(displayScheme);
        setCenters({ ...displayScheme });
        setSource('entry');
        setIssues([]);
        setEntryPreview(true);
        setPhotoEntryOpen(false);
        setEntryFocusRequest((request) => request + 1);
        dispatch({ type: 'load', cube: state.initialCube });
      },
    });
  }

  async function solveColors(capture: InputCapture) {
    const result = validateColors(capture.stickers);
    if (!result.ok) {
      setIssues(result.issues);
      if (capture.provider === 'photo') setOperationError(result.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setIssues([]);
    setOperationError(null);
    setEntry(capture.stickers);
    setCenters({ ...result.scheme });
    setScheme(result.scheme);
    setEntryPreview(true);
    dispatch({ type: 'load', cube: result.cube });
    const verified = await solver.solve(result.cube);
    if (verified) dispatch({ type: 'solution', solution: verified });
  }

  async function solveEntry() {
    await solveColors(new ManualInputProvider(entry).capture());
  }

  async function solvePractice() {
    if (state.transition) return;
    const verified = await solver.solve(state.cube);
    if (verified) dispatch({ type: 'solution', solution: verified });
  }

  function applyDirectTurn(turn: Move) {
    if (manualLock.current || state.transition || busy || solution || source !== 'practice' || !advanced) return;
    manualLock.current = true;
    setScramble((previous) => Object.freeze([...previous, turn]));
    dispatch({ type: 'turn', move: turn });
  }

  const latest = useRef({ state, source, advanced, busy, guideOpen, pendingChange, applyDirectTurn, entry, solverStatus: solver.status.kind });
  latest.current = { state, source, advanced, busy, guideOpen, pendingChange, applyDirectTurn, entry, solverStatus: solver.status.kind };
  useEffect(() => {
    let doubleHeld = false;
    const keydown = (event: KeyboardEvent) => {
      const current = latest.current;
      const target = event.target;
      if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey
        || current.busy || current.guideOpen || current.pendingChange
        || (target instanceof Element && target.closest('input, select, textarea, button, a, [contenteditable="true"], [role="slider"], dialog'))) return;
      if (current.state.solution) {
        if (event.code === 'Space') {
          event.preventDefault();
          dispatch({ type: current.state.running ? 'pause' : 'play' });
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'Home') {
          event.preventDefault();
          dispatch({ type: event.key === 'Home' ? 'restart' : event.key === 'ArrowRight' ? 'next' : 'previous' });
        }
      } else if (current.source === 'practice' && current.advanced) {
        if (event.key === '2') { doubleHeld = true; return; }
        const face = event.key.toUpperCase();
        if (isFace(face)) {
          event.preventDefault();
          current.applyDirectTurn({ face, turns: doubleHeld ? 2 : event.shiftKey ? -1 : 1 });
        }
      }
    };
    const keyup = (event: KeyboardEvent) => { if (event.key === '2') doubleHeld = false; };
    const blur = () => { doubleHeld = false; };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    const inspect = (): CubeGuideInspection => {
      const current = latest.current;
      const playback = current.state;
      return Object.freeze({
        app: 'CubeGuide', source: current.source,
        cubeFacelets: cubeKey(playback.cube), initialFacelets: cubeKey(playback.initialCube),
        solved: isSolved(playback.cube), verified: !!playback.solution,
        step: playback.step, speed: playback.speed, running: playback.running,
        transition: playback.transition ? {
          progress: playback.transition.progress, goal: playback.transition.goal, move: formatMove(playback.transition.move),
        } : null,
        solutionLength: playback.solution?.moves.length ?? 0,
        solutionMoves: formatAlgorithm(playback.solution?.moves ?? []),
        snapshots: Object.freeze(playback.solution?.snapshots.map(cubeKey) ?? []),
        solverStatus: current.solverStatus, entry: current.entry,
        visual: viewport.current?.inspect() ?? null,
      });
    };
    Object.defineProperty(window, '__cubeGuide', { value: Object.freeze({ inspect }), configurable: true });
    return () => { Reflect.deleteProperty(window, '__cubeGuide'); };
  }, []);

  return (
    <>
      <a className="skip-link" href="#main">Skip to cube solver</a>
      <header className={`site-header ${showWorkspace ? '' : 'photo-header'}`}>
        <a className="brand" href="#main" aria-label="CubeGuide home"><span className="brand-symbol"><Icon name="cube" size={30} /></span><span>CubeGuide<small>Rubik&apos;s Cube solver</small></span></a>
        <div className="header-actions">
          {!showWorkspace && (photoCount > 0 || photoWorking) && <button className="text-button" onClick={requestNewCube}>New cube</button>}
          {showWorkspace && <>
          <button className="text-button guide-button" aria-label="Turn guide" onClick={() => setGuideOpen(true)}><Icon name="help" size={18} /><span>Turn guide</span></button>
          <div className="mode-switch" role="group" aria-label="Instruction style">
            <button aria-pressed={!advanced} onClick={() => setAdvanced(false)}>Beginner</button>
            <button aria-pressed={advanced} onClick={() => setAdvanced(true)}>Advanced</button>
          </div>
          </>}
        </div>
      </header>

      <main id="main" className={`page-shell ${solution ? 'has-solution' : ''} ${showWorkspace ? '' : 'photo-landing'}`}>
        {showWorkspace && <div className="page-heading">
          <div>
            <h1>{solved ? 'A good turn of events.' : solution ? 'Let\u2019s bring it all together.' : 'Every cube has a way home.'}</h1>
            <p>{solution ? 'Follow the turns. Find your rhythm. You\u2019re in control.' : 'Your colors. A clear solution. One turn at a time.'}</p>
          </div>
          <button className="button secondary new-cube-button" onClick={requestNewCube}><Icon name="cube" size={18} /> New cube</button>
        </div>}

        {source === 'entry' && !solution && !busy && (
          <section className="entry-actions" aria-label="Choose how to enter your cube">
            <div className="entry-action-buttons">
              <button className="text-button" onClick={requestAutomaticMode}><Icon name="camera" size={18} /> Use automatic photos</button>
              {scheme && <button className="text-button" aria-expanded={photoEntryOpen}
                aria-controls="cube-entry" onClick={requestPhotoEntry}><Icon name="upload" size={17} /> Align/review a face photo</button>}
              {photoEntryOpen && <button className="text-button" onClick={requestManualEntry}>
                <Icon name="edit" size={17} /> Enter colors manually
              </button>}
              <button className="text-button" onClick={requestPractice}><Icon name="shuffle" size={17} /> Try a scramble</button>
            </div>
          </section>
        )}

        {operationError && <div className="error-banner" role="alert"><Icon name="alert" /><p>{operationError}</p><button className="text-button" onClick={() => setOperationError(null)}>Dismiss</button></div>}

        {source === 'photo' && <div hidden={showWorkspace}>
          <AutomaticPhotoInput key={photoSession} visible={!showWorkspace} focusRequest={entryFocusRequest}
            onCount={(count) => { if (photoVersion.current === photoSession) setPhotoCount(count); }}
            onWorking={(working) => { if (photoVersion.current === photoSession) setPhotoWorking(working); }}
            onComplete={(stickers) => {
              if (photoVersion.current === photoSession) void solveColors(new AutomaticPhotoInputProvider(stickers).capture());
            }} onManual={requestManualMode} onPractice={requestPractice} />
        </div>}

        {showWorkspace && <div className="workspace">
          <section className="cube-column" aria-label="Interactive cube and orientation">
            <div className="cube-stage">
              <div className="stage-toolbar">
                <span className={`stage-status ${solved ? 'stage-solved' : ''}`}>
                  <span className="status-dot" />
                  {solved ? 'Solved state' : solution ? `Move ${state.step} / ${solution.moves.length}` : source === 'practice' ? 'Practice cube' : entryPreview ? 'Your entered cube' : 'Orientation preview'}
                </span>
                <button className="text-button" onClick={() => viewport.current?.lookAt(null)}><Icon name="restart" size={16} /> Reset view</button>
              </div>
              <Suspense fallback={<div className="cube-viewport viewport-loading" role="status">Loading the interactive cube...</div>}>
                <CubeViewport ref={viewport} cube={state.cube} scheme={displayScheme} animation={animation}
                  highlight={cue} symbols={symbols} reducedMotion={reducedMotion} />
              </Suspense>
              <div className="stage-hint"><span className="drag-icon" aria-hidden="true">↔</span> Drag to orbit <span className="separator">·</span> Scroll or pinch to zoom</div>
              <div className="camera-controls">
                <label>Look at
                  <select aria-label="Camera view" value="" onChange={(event) => {
                    viewport.current?.lookAt(isFace(event.target.value) ? event.target.value : null);
                  }}>
                    <option value="" disabled>Choose view</option>
                    <option value="overview">Overview</option>
                    {FACES.map((face) => <option value={face} key={face}>{FACE_NAMES[face]} ({face})</option>)}
                  </select>
                </label>
                <span className="camera-note">Camera only. Your face names stay fixed.</span>
              </div>
            </div>
            <div className="home-orientation">
              <Icon name="cube" size={22} />
              {scheme ? <p>Your home position: <strong><ColorMark color={scheme.U} name /> on top</strong><span className="separator">·</span><strong><ColorMark color={scheme.F} name /> facing you</strong></p>
                : <p>The cube above is an example. <strong>Choose your own center colors</strong> to set your orientation.</p>}
            </div>
            {source === 'entry' && !entryPreview && !solution && scheme &&
              <p className="small muted preview-note">This is an orientation reference, not a live sticker preview. Check your colors to load your entered cube.</p>}
            <div className="view-preferences">
              <label><input type="checkbox" checked={symbols} onChange={(event) => setSymbols(event.target.checked)} /> Sticker letters</label>
              <label><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /> Reduce motion</label>
            </div>
            {reducedMotion && <p className="small muted motion-note">Reduced motion: timed step changes replace layer rotations. Playback controls still work.</p>}
            <details className="net-details">
              <summary>See all six faces <span>{state.transition ? 'Last complete move' : 'Flat cube view'}</span></summary>
              <CubeNet cube={state.cube} scheme={displayScheme} />
            </details>
          </section>

          <aside className="task-panel">
            {!solution && !busy && source === 'practice' && (
              <div className="input-tabs" role="group" aria-label="Cube source">
                <button aria-pressed={false} onClick={requestNewCube}><Icon name="edit" size={17} /> Enter my cube</button>
                <button aria-pressed={true} onClick={requestPractice}><Icon name="shuffle" size={17} /> Try a scramble</button>
              </div>
            )}
            {solver.status.kind === 'error' && (
              <div className="solver-error" role="alert">
                <h3>We couldn&apos;t finish this solve.</h3><p>{solver.status.message}</p>
                <details><summary>Diagnostic input</summary><code>{cubeKey(state.cube)}</code></details>
                <p className="small">Your cube is preserved. Check its colors or try solving again.</p>
              </div>
            )}
            {busy && solver.status.kind === 'working' ? (
              <section className="solving-panel">
                <div className="solver-graphic" aria-hidden="true"><Icon name="cube" size={54} /><div className="loading-bars"><i /><i /><i /></div></div>
                <div role="status" aria-live="polite"><h2>{PHASE_COPY[solver.status.phase].title}</h2><p>{PHASE_COPY[solver.status.phase].detail}</p></div>
                <p className="small muted">Everything stays in this browser. A result is only accepted after replay verifies it.</p>
                <button className="button secondary full-width" onClick={solver.cancel}>Cancel solving</button>
              </section>
            ) : solution ? (
              <SolutionPanel state={state} scheme={displayScheme} advanced={advanced} onAction={dispatch} focusOnReady={source === 'photo'}
                onViewFace={(face) => viewport.current?.lookAt(face)} onEdit={editColors} />
            ) : source === 'practice' ? (
              <PracticePanel scramble={scramble} advanced={advanced} animating={!!state.transition}
                running={state.running} activeTurn={state.transition?.move ?? null}
                onToggleTurn={() => dispatch({ type: state.running ? 'pause' : 'play' })}
                onSolve={solvePractice} onScramble={requestPractice} onEnter={requestNewCube} onTurn={applyDirectTurn} />
            ) : source === 'photo' ? (
              <section className="entry-content photo-ready-panel">
                <h2>Your photos are ready.</h2>
                <p>Your cube and all six photos are preserved. Find its solution, or retake a face.</p>
                <button className="button primary full-width" onClick={() => void solveEntry()}>Find my solution <Icon name="arrow" /></button>
                <button className="text-button" onClick={retakePhotos}>Retake a face photo</button>
                <button className="text-button" onClick={editColors}>Correct colors manually</button>
              </section>
            ) : (
              <FaceInput centers={centers} scheme={scheme} entry={entry} selectedColor={selectedColor}
                activeFace={activeFace} issues={issues}
                photoOpen={photoEntryOpen} focusRequest={entryFocusRequest} photoRef={photoInput}
                onPhotoClose={finishPhotoEntry} onManualEntry={requestManualEntry}
                onCenter={(face, color) => setCenters((previous) => {
                  const next = { ...previous };
                  if (color) next[face] = color; else delete next[face];
                  return next;
                })}
                onLock={lockCenters} onChangeCenters={changeCenters} onColor={setSelectedColor}
                onPaint={(index) => {
                  setEntry((previous) => paintSticker(previous, index, selectedColor));
                  setIssues([]);
                  if (entryPreview) dispatch({ type: 'load', cube: solvedCube() });
                  setEntryPreview(false);
                }}
                onActiveFace={setActiveFace} onViewFace={(face) => viewport.current?.lookAt(face)} onSolve={solveEntry}
                onPhotoFace={(face, colors) => {
                  if (!scheme) return;
                  setEntry((previous) => new PhotoInputProvider(previous, face, colors, scheme).capture().stickers);
                  setIssues([]);
                  if (entryPreview) dispatch({ type: 'load', cube: solvedCube() });
                  setEntryPreview(false);
                }} />
            )}
          </aside>
        </div>}
        {showWorkspace && solution && <SolutionTimeline state={state} onAction={dispatch} />}
        {showWorkspace && solution && source === 'photo' && <div className="photo-retake-action"><button className="text-button" onClick={retakePhotos}><Icon name="camera" size={17} /> Retake a face photo</button></div>}
      </main>

      <footer className={`site-footer ${showWorkspace ? '' : 'photo-footer'}`}>{showWorkspace
        ? <><span>A little guidance for the cube in your hands.</span><span>Manual or photo entry <span className="separator">·</span> On-device solving</span></>
        : <span>Photos are processed on your device. Nothing is uploaded to a server.</span>}</footer>
      <DiscardDialog change={pendingChange} onCancel={() => setPendingChange(null)} onConfirm={() => {
        const change = pendingChange;
        setPendingChange(null);
        change?.run();
      }} />
      <NotationGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}
