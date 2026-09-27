import { estimatedPlaybackSeconds, SPEEDS, type PlaybackAction, type PlaybackState } from '../cube/animation/playback';
import { turnCue } from '../cube/animation/cue';
import { isSolved } from '../cube/model';
import { describeMove, formatMove } from '../cube/notation';
import { COLOR_INFO, FACE_NAMES, type ColorScheme, type Face } from '../cube/types';
import { ColorMark } from './ColorMark';
import { Icon, TurnArrow } from './Icon';

interface Props {
  state: PlaybackState;
  scheme: ColorScheme;
  advanced: boolean;
  onAction(action: PlaybackAction): void;
  onViewFace(face: Face): void;
  onEdit(): void;
}

export function SolutionPanel({ state, scheme, advanced, onAction, onViewFace, onEdit }: Props) {
  const solution = state.solution;
  if (!solution) return null;
  const cue = turnCue(state);
  const move = cue?.move;
  const solved = !state.transition && isSolved(state.cube);
  const hasStarted = state.step > 0 || !!state.transition;
  const paused = !state.running && !!state.transition;
  const reversing = state.transition?.kind === 'backward' || state.transition?.goal === 0;
  const phase = solved ? 'Cube solved' : paused ? 'Paused in a turn' : !hasStarted ? 'Solution ready' : state.running ? 'Following your solution' : 'Ready when you are';
  const canPrevious = state.step > 0 || (state.transition?.kind === 'forward' && state.transition.progress > 0);
  const canNext = state.step < solution.moves.length || state.transition?.kind === 'backward';

  return (
    <section className={`solution-panel ${advanced ? 'advanced-solution' : ''}`} aria-label="Solution playback">
      <div className={`solution-status ${solved ? 'success-status' : ''}`} role="status">
        <Icon name={solved || !hasStarted ? 'check' : paused ? 'pause' : 'play'} size={17} />
        <span>{phase}</span>
      </div>
      <h2>{solved ? 'Back to six happy faces.' : advanced ? 'Your move sequence.' : 'One turn at a time.'}</h2>
      {solved ? <p>{solution.moves.length === 0 ? 'Your entered cube is already solved. No moves needed.' : 'Every face is complete. Your current cube matches the verified solved state.'}</p>
        : <p>{advanced ? 'Step through the notation, or play the full sequence.' : 'Keep your physical cube nearby. You can pause for as long as you need.'}</p>}

      <dl className="solution-metrics">
        <div><dt>Moves</dt><dd>{solution.metrics.moves}</dd></div>
        <div><dt>Quarter turns</dt><dd>{solution.metrics.quarterTurns}</dd></div>
        <div><dt>Double turns</dt><dd>{solution.metrics.doubleTurns}</dd></div>
      </dl>

      {move && cue ? (
        <div className="move-instruction" aria-live="polite" aria-atomic="true">
          <div className="move-step-label">
            <span>{reversing ? 'Undoing a turn' : `${state.transition ? 'Turning' : 'Next'}: move ${Math.min(state.step + 1, solution.moves.length)} of ${solution.moves.length}`}</span>
            <span className="move-face-label"><ColorMark color={scheme[move.face]} /> {FACE_NAMES[move.face]} face</span>
          </div>
          <div className="move-visual">
            <strong className="move-notation">{formatMove(move)}</strong>
            <span className="direction-indicator" data-direction={cue.direction}>
              <TurnArrow inverse={cue.direction === 'counter-clockwise'} />
              <span>{cue.partialRewind ? `${cue.direction === 'clockwise' ? 'Clockwise' : 'Counter-clockwise'} rewind` : move.turns === 2 ? '180°' : cue.direction === 'counter-clockwise' ? 'Counter-clockwise' : 'Clockwise'}</span>
            </span>
          </div>
          <h3>{cue.partialRewind ? `Return the ${FACE_NAMES[move.face].toLowerCase()} face ${cue.direction}.` : describeMove(move)}</h3>
          {!advanced && (
            <p>Look straight at the <strong>{FACE_NAMES[move.face].toLowerCase()} ({COLOR_INFO[scheme[move.face]].name.toLowerCase()})</strong> face.
              {state.transition?.goal === 0
                ? ' We are reversing the unfinished part of this turn.'
                : move.turns === 2 ? ' Rotate that layer halfway around, in the direction of the arrow.' : ` Turn only that layer ${move.turns === -1 ? 'counter-clockwise' : 'clockwise'} from this face's point of view.`}
            </p>
          )}
          <button className="text-button face-view-button" onClick={() => onViewFace(move.face)}>
            <Icon name="eye" size={17} /> View the {FACE_NAMES[move.face].toLowerCase()} face
          </button>
        </div>
      ) : (
        <div className="solved-illustration" aria-hidden="true">
          <Icon name="cube" size={82} />
          <div className="solved-colors">{Object.values(scheme).map((color) => <ColorMark key={color} color={color} />)}</div>
        </div>
      )}

      <div className="playback-controls">
        <div className="mobile-move-cue" aria-live="polite">
          {move && cue ? <><strong>{formatMove(move)}</strong><span>{FACE_NAMES[move.face]} <span className="separator">·</span> {cue.partialRewind ? 'Rewind' : move.turns === 2 ? 'Half turn' : cue.direction}</span><TurnArrow inverse={cue.direction === 'counter-clockwise'} /></>
            : <><Icon name="check" size={18} /><span>Cube solved</span></>}
          <small>{state.step}/{solution.moves.length}</small>
        </div>
        <button className="button secondary step-button" aria-label="Previous move" disabled={!canPrevious}
          onClick={() => onAction({ type: 'previous' })}><Icon name="previous" /><span>Previous</span></button>
        <button className="button primary play-button"
          disabled={!solution.moves.length}
          onClick={() => onAction({ type: state.running ? 'pause' : 'play' })}>
          <Icon name={state.running ? 'pause' : 'play'} />
          {state.running ? 'Pause' : solved ? 'Replay' : hasStarted ? 'Resume' : 'Play solution'}
        </button>
        <button className="button secondary step-button" aria-label="Next move" disabled={!canNext}
          onClick={() => onAction({ type: 'next' })}><Icon name="next" /><span>Next</span></button>
      </div>
      <div className="playback-options">
        <button className="text-button" disabled={state.step === 0 && !state.transition}
          onClick={() => onAction({ type: 'restart' })}><Icon name="restart" size={17} /> Restart</button>
        <label className="speed-control">Speed
          <select aria-label="Animation speed" value={state.speed}
            onChange={(event) => {
              const speed = SPEEDS.find((value) => value === Number(event.target.value));
              if (speed) onAction({ type: 'speed', speed });
            }}>
            {SPEEDS.map((speed) => <option value={speed} key={speed}>{speed}×</option>)}
          </select>
        </label>
      </div>
      <p className="small muted estimate">Animation estimate: {Math.ceil(estimatedPlaybackSeconds(solution.moves, state.speed))} sec at {state.speed}×. Take more time with your physical cube.</p>
      <div className="solution-footer">
        <span>{solution.metrics.quarterTurnMetric} QTM <span className="separator">·</span> Verified two-phase solution</span>
        <button className="text-button" onClick={onEdit}>Edit colors</button>
      </div>
    </section>
  );
}

export function SolutionTimeline({ state, onAction }: { state: PlaybackState; onAction(action: PlaybackAction): void }) {
  if (!state.solution) return null;
  const moves = state.solution.moves;
  return (
    <section className="timeline-section" aria-labelledby="timeline-title">
      <div className="section-heading">
        <h2 id="timeline-title">The whole journey</h2>
        <span className="timeline-count" aria-live="polite">{state.step} / {moves.length} moves complete</span>
      </div>
      <label className="timeline-slider">
        <span className="sr-only">Solution step</span>
        <input type="range" min={0} max={moves.length || 1} step={1} value={state.step} disabled={!moves.length}
          aria-label="Solution step" aria-valuetext={`${state.step} of ${moves.length} moves complete`}
          onChange={(event) => onAction({ type: 'seek', step: Number(event.target.value) })} />
      </label>
      <div className="timeline-endpoints"><span>Starting cube</span><span>Solved</span></div>
      <ol className="move-list" aria-label="Complete solution notation">
        <li><button className={`move-chip start-chip ${state.step === 0 ? 'current-chip' : ''}`}
          aria-label="Jump to start" aria-current={state.step === 0 ? 'step' : undefined}
          onClick={() => onAction({ type: 'seek', step: 0 })}>Start</button></li>
        {moves.map((move, i) => (
          <li key={i}>
            <button className={`move-chip ${i < state.step ? 'completed-chip' : ''} ${state.step === i + 1 ? 'current-chip' : ''} ${i === state.step ? 'next-chip' : ''}`}
              aria-label={`Jump to after move ${i + 1}: ${formatMove(move)}`}
              aria-current={state.step === i + 1 ? 'step' : undefined}
              onClick={() => onAction({ type: 'seek', step: i + 1 })}>
              <small>{i + 1}</small>{formatMove(move)}
            </button>
          </li>
        ))}
      </ol>
      <div className="timeline-note">
        <p>Select a move to see the cube just after it. Jumping pauses playback.</p>
        <p>Valid solution, not guaranteed shortest.</p>
      </div>
    </section>
  );
}
