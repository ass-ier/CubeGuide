import { useEffect, useId, useRef } from 'react';
import { FACE_NAMES, FACES } from '../cube/types';
import { Icon, TurnArrow } from './Icon';

export interface PendingChange {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  run(): void;
}

export function DiscardDialog({ change, onCancel, onConfirm }: {
  change: PendingChange | null; onCancel(): void; onConfirm(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (change && !ref.current?.open) ref.current?.showModal();
    if (!change && ref.current?.open) ref.current.close();
  }, [change]);
  return (
    <dialog ref={ref} className="app-dialog" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <h2 id={titleId}>{change?.title}</h2>
      <p>{change?.description}</p>
      <div className="dialog-actions">
        <button className="button secondary" autoFocus onClick={onCancel}>{change?.cancelLabel ?? 'Keep my cube'}</button>
        <button className="button primary" onClick={onConfirm}>{change?.confirmLabel}</button>
      </div>
    </dialog>
  );
}

export function NotationGuide({ open, onClose }: { open: boolean; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog className="app-dialog notation-dialog" ref={ref} aria-labelledby="notation-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="section-heading">
        <h2 id="notation-title">A quick guide to turns</h2>
        <button className="icon-button" aria-label="Close notation guide" onClick={onClose}><Icon name="close" /></button>
      </div>
      <p>Keep your chosen Up color on top and Front color facing you. Those names stay fixed, even when you orbit the virtual camera.</p>
      <div className="face-legend">{FACES.map((face) => <span key={face}><b className="face-letter">{face}</b>{FACE_NAMES[face]}</span>)}</div>
      <div className="notation-examples">
        <div><b>R</b><span><TurnArrow inverse={false} />Clockwise quarter turn</span></div>
        <div><b>R&apos;</b><span><TurnArrow inverse />Counter-clockwise quarter turn</span></div>
        <div><b>R2</b><span>180°<br />Half turn (two quarter turns)</span></div>
      </div>
      <p><strong>Direction is always relative to looking straight at the named face.</strong> A right turn can look different from your camera angle. Use &ldquo;View the face&rdquo; for a head-on view.</p>
      <p>Each move rotates one outer layer, not the whole cube. After looking at another face, return to your original Up/Front orientation.</p>
      <h3>Keyboard shortcuts</h3>
      <p>When no control is focused: Space plays or pauses; left/right arrows step; Home restarts. In Advanced practice mode, use U/R/F/D/L/B, Shift for inverse, or hold 2 for a double turn.</p>
      <p className="small muted">QTM counts a double turn as two quarter turns. The move count counts each double turn once. Two-phase solutions are verified, but not guaranteed optimal.</p>
      <button className="button primary full-width" onClick={onClose}>Got it</button>
    </dialog>
  );
}
