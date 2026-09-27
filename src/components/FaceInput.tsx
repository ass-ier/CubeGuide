import { memo, useEffect, useRef, type Ref } from 'react';
import { COLORS, COLOR_INFO, FACE_NAMES, FACES, type Color, type ColorScheme, type Face, type StickerInput } from '../cube/types';
import type { ValidationIssue } from '../cube/validation';
import { ENTRY_ORDER, FACE_NEIGHBORS, orientationInstruction } from '../input/orientation';
import { schemeFromCenters } from '../input/provider';
import { ColorMark, colorStyle } from './ColorMark';
import { Icon } from './Icon';
import { PhotoInput, type PhotoInputHandle } from './PhotoInput';

interface Props {
  centers: Partial<Record<Face, Color>>;
  scheme: ColorScheme | null;
  entry: StickerInput;
  selectedColor: Color | null;
  activeFace: Face;
  issues: readonly ValidationIssue[];
  photoOpen: boolean;
  focusRequest: number;
  photoRef: Ref<PhotoInputHandle>;
  onCenter(face: Face, color: Color | null): void;
  onLock(): void;
  onChangeCenters(): void;
  onColor(color: Color | null): void;
  onPaint(index: number): void;
  onActiveFace(face: Face): void;
  onViewFace(face: Face): void;
  onSolve(): void;
  onPhotoFace(face: Face, colors: readonly Color[]): void;
  onPhotoClose(): void;
  onManualEntry(): void;
}

export const FaceInput = memo(function FaceInput(props: Props) {
  const { centers, scheme, entry, selectedColor, activeFace, issues, photoOpen, focusRequest } = props;
  const errorRef = useRef<HTMLDivElement>(null);
  const centerHeading = useRef<HTMLHeadingElement>(null);
  const stickerHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (issues.length) errorRef.current?.focus();
  }, [issues]);
  useEffect(() => {
    if (!focusRequest || scheme && photoOpen) return;
    const heading = scheme ? stickerHeading.current : centerHeading.current;
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'start' });
  }, [focusRequest, scheme, photoOpen]);
  const filled = entry.filter(Boolean).length;
  const completeFaces = FACES.filter((_, index) => entry.slice(index * 9, index * 9 + 9).every(Boolean)).length;
  const errorIndices = new Set(issues.flatMap((issue) => [...issue.indices]));

  if (!scheme) {
    return (
      <section id="cube-entry" className="entry-content" aria-labelledby="center-title">
        <h2 id="center-title" ref={centerHeading} tabIndex={-1}>First, find your bearings.</h2>
        {photoOpen && <p className="photo-setup-note" role="status">Photo entry selected. Set your six center colors first; capture and upload will open automatically when you lock them.</p>}
        <p>Pick a face to be <strong>Front</strong>, then a neighboring face to be <strong>Up</strong>. Match the six center colors below.</p>
        <div className="orientation-note">
          <Icon name="cube" size={26} />
          <p>Centers never move relative to one another. They tell us which color belongs on each face of <em>your</em> cube.</p>
        </div>
        <div className="center-selects">
          {FACES.map((face) => (
            <label className="center-select" key={face} htmlFor={`center-${face}`}>
              <span><b className="face-letter">{face}</b>{FACE_NAMES[face]} center</span>
              <span className="select-with-color">
                {centers[face] && <ColorMark color={centers[face]} />}
                <select id={`center-${face}`} value={centers[face] ?? ''} aria-label={`${FACE_NAMES[face]} center color`}
                  onChange={(event) => props.onCenter(face, COLORS.find((color) => color === event.target.value) ?? null)}>
                  <option value="">Choose color</option>
                  {COLORS.map((color) => (
                    <option key={color} value={color}
                      disabled={FACES.some((other) => other !== face && centers[other] === color)}>
                      {COLOR_INFO[color].name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          ))}
        </div>
        <p className="muted center-progress">{Object.values(centers).filter(Boolean).length} of 6 centers chosen. No color scheme is assumed.</p>
        <button className="button primary full-width" disabled={!schemeFromCenters(centers)} onClick={props.onLock}>
          {photoOpen ? 'Lock centers & open photos' : 'Lock centers & enter stickers'} <Icon name="arrow" />
        </button>
        {photoOpen && <button className="text-button manual-setup-action" onClick={props.onManualEntry}>Use manual entry instead</button>}
        <p className="small muted privacy-note">{photoOpen ? 'Next: take or upload one face at a time. Nothing leaves your device.' : 'Manual entry uses fixed centers. For automatic color detection instead, choose Use automatic photos above.'}</p>
      </section>
    );
  }

  return (
    <section id="cube-entry" className="entry-content" aria-labelledby="sticker-title">
      <div className="section-heading">
        <h2 id="sticker-title" ref={stickerHeading} tabIndex={-1}>{photoOpen ? 'Photograph your cube.' : 'Now, match your stickers.'}</h2>
        <button className="text-button" onClick={props.onChangeCenters} aria-label="Change center orientation"><Icon name="edit" size={16} /> Centers</button>
      </div>
      <p>{photoOpen ? 'Your centers are locked. Review each face before adding its colors.' : 'Select a color, then tap each matching sticker. The center stickers are locked.'}</p>
      <PhotoInput ref={props.photoRef} open={photoOpen} focusRequest={focusRequest} onClose={props.onPhotoClose}
        scheme={scheme} entry={entry} initialFace={activeFace} onFace={props.onActiveFace} onApply={props.onPhotoFace} />
      <div className="palette-wrap">
        <div className="palette" role="group" aria-label="Sticker paint colors">
          {COLORS.map((color) => {
            const count = entry.filter((value) => value === color).length;
            return (
              <button key={color} className={`color-choice ${selectedColor === color ? 'selected' : ''}`}
                aria-pressed={selectedColor === color} aria-label={`Paint ${color} stickers`}
                onClick={() => props.onColor(color)}>
                <ColorMark color={color} />
                <span>{COLOR_INFO[color].name}<small className={count > 9 ? 'over-count' : ''}>{count}/9{count > 9 ? ' !' : ''}</small></span>
              </button>
            );
          })}
        </div>
        <div className="entry-progress-line">
          <span>{filled}/54 stickers <span className="separator">·</span> {completeFaces}/6 faces</span>
          <button className={`text-button ${selectedColor === null ? 'active-text' : ''}`} aria-pressed={selectedColor === null}
            onClick={() => props.onColor(null)}>Erase</button>
        </div>
      </div>

      <details className="capture-guide" open>
        <summary>How to hold the {FACE_NAMES[activeFace].toLowerCase()} face</summary>
        <p>{orientationInstruction(activeFace, scheme)}</p>
        <button className="text-button" onClick={() => props.onViewFace(activeFace)}>
          <Icon name="eye" size={16} /> Show this view on the 3D cube
        </button>
      </details>

      <div className="face-editors">
        {ENTRY_ORDER.map((face) => {
          const base = FACES.indexOf(face) * 9;
          const neighbors = FACE_NEIGHBORS[face];
          const complete = entry.slice(base, base + 9).every(Boolean);
          return (
            <fieldset className={`face-editor ${face === activeFace ? 'active-face' : ''}`} key={face}>
              <legend>
                <button className="face-heading" onClick={() => props.onActiveFace(face)}
                  aria-label={`Orientation guide for ${FACE_NAMES[face]}`}>
                  <b className="face-letter">{face}</b> {FACE_NAMES[face]}
                  {complete && <Icon name="check" size={15} />}
                </button>
              </legend>
              <div className="face-edge-label">Top: {COLOR_INFO[scheme[neighbors.top]].name} ({neighbors.top})</div>
              <div className="sticker-grid" role="group" aria-label={`${FACE_NAMES[face]} face stickers`}>
                {Array.from({ length: 9 }, (_, cell) => {
                  const color = entry[base + cell];
                  const center = cell === 4;
                  const name = color ? COLOR_INFO[color].name : 'empty';
                  return (
                    <button key={cell} type="button" disabled={center}
                      data-testid={`sticker-${face}-${cell}`}
                      className={`sticker ${color ? '' : 'empty-sticker'} ${center ? 'center-sticker' : ''} ${errorIndices.has(base + cell) ? 'sticker-error' : ''}`}
                      style={color ? colorStyle(color) : undefined}
                      aria-label={`${FACE_NAMES[face]} row ${Math.floor(cell / 3) + 1} column ${cell % 3 + 1}: ${name}${center ? ', fixed center' : ''}`}
                      title={`${name}${center ? ' (fixed center)' : ''}`}
                      onClick={() => { props.onActiveFace(face); props.onPaint(base + cell); }}>
                      {color ? COLOR_INFO[color].symbol : '?'}
                      {center && <Icon name="lock" size={10} />}
                    </button>
                  );
                })}
              </div>
              <div className="face-edge-label">Right: {COLOR_INFO[scheme[neighbors.right]].name} ({neighbors.right})</div>
            </fieldset>
          );
        })}
      </div>
      <p className="small muted entry-reminder">Look straight at each face; never mirror a grid. Return to your Up/Front home position before finding the next face.</p>
      {issues.length > 0 && (
        <div className="validation-errors" ref={errorRef} role="alert" tabIndex={-1}>
          <h3><Icon name="alert" /> Let&apos;s check those colors.</h3>
          <ul>{issues.map((issue, i) => <li key={`${issue.code}-${i}`}>{issue.message}</li>)}</ul>
        </div>
      )}
      <button className="button primary full-width" onClick={props.onSolve}>
        Check colors & solve <Icon name="arrow" />
      </button>
      <p className="small muted privacy-note">We check every piece and verify the solution before you see it.</p>
    </section>
  );
});
