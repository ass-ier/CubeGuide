import { FACES, type Move } from '../cube/types';
import { formatAlgorithm, formatMove } from '../cube/notation';
import { Icon } from './Icon';

interface Props {
  scramble: readonly Move[];
  advanced: boolean;
  animating: boolean;
  running: boolean;
  activeTurn: Move | null;
  onSolve(): void;
  onScramble(): void;
  onEnter(): void;
  onTurn(move: Move): void;
  onToggleTurn(): void;
}

export function PracticePanel({ scramble, advanced, animating, running, activeTurn, onSolve, onScramble, onEnter, onTurn, onToggleTurn }: Props) {
  return (
    <section className="practice-panel" aria-labelledby="practice-title">
      <h2 id="practice-title">A fresh twist to try.</h2>
      <p>This is a legal, randomly scrambled cube. Find its solution, then follow along at your own pace.</p>
      <div className="practice-sequence">
        <div className="section-heading"><h3>Starting sequence</h3><span>{scramble.length} moves</span></div>
        <p className="scramble-notation" data-testid="scramble-notation">{formatAlgorithm(scramble)}</p>
        <p className="small muted">Applied to a solved practice cube. It isn&apos;t the solution.</p>
      </div>
      {activeTurn && (
        <div className="manual-turn-status">
          <div role="status"><strong>{running ? 'Turning' : 'Turn paused'}: {formatMove(activeTurn)}</strong><p>Finish this turn before solving or starting another.</p></div>
          <button className="button secondary" onClick={onToggleTurn}>
            <Icon name={running ? 'pause' : 'play'} size={17} />{running ? 'Pause turn' : 'Resume turn'}
          </button>
        </div>
      )}
      <button className="button primary full-width" onClick={onSolve} disabled={animating}>Solve scramble <Icon name="arrow" /></button>
      <button className="button secondary full-width" onClick={onScramble}><Icon name="shuffle" /> Generate scramble</button>
      {advanced && (
        <div className="direct-turns">
          <h3>Take a turn yourself</h3>
          <p className="small muted">U/R/F/D/L/B keys turn a face. Shift reverses; hold 2 for a half turn. Shortcuts leave focused controls alone.</p>
          <div className="turn-buttons" role="group" aria-label="Direct face turns">
            {([1, -1, 2] as const).flatMap((turns) => FACES.map((face) => {
              const move = { face, turns };
              return (
                <button className="button turn-button" key={formatMove(move)} disabled={animating}
                  aria-label={`Apply ${formatMove(move)}`} onClick={() => onTurn(move)}>{formatMove(move)}</button>
              );
            }))}
          </div>
        </div>
      )}
      <div className="practice-tip"><Icon name="help" /><p>Using a physical cube? Enter its six faces instead of following an unrelated practice scramble.</p></div>
      <button className="text-button" onClick={onEnter}>Enter my physical cube <Icon name="arrow" size={16} /></button>
    </section>
  );
}
