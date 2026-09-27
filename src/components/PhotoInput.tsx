import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { COLORS, COLOR_INFO, FACE_NAMES, FACES, isColor, isFace, type Color, type ColorScheme, type Face, type StickerInput } from '../cube/types';
import { ENTRY_ORDER, FACE_NEIGHBORS, orientationInstruction } from '../input/orientation';
import { analyzePhoto, reviewedColors, type Calibration, type PhotoAnalysis } from '../input/photo/analysis';
import { cropError, defaultQuad, projectiveMap, replaceCorner, rotatePixels, type Quad } from '../input/photo/geometry';
import { loadPhoto, previewFromPixels, type PhotoImage } from '../input/photo/load';
import { ColorMark } from './ColorMark';
import { DiscardDialog, type PendingChange } from './Dialogs';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  focusRequest: number;
  scheme: ColorScheme;
  entry: StickerInput;
  initialFace: Face;
  onFace(face: Face): void;
  onApply(face: Face, colors: readonly Color[]): void;
  onClose(): void;
}
export interface PhotoInputHandle { close(): void }
const CORNERS = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'] as const;
const complete = (entry: StickerInput, face: Face) => entry.slice(FACES.indexOf(face) * 9, FACES.indexOf(face) * 9 + 9).every(Boolean);

export const PhotoInput = forwardRef<PhotoInputHandle, Props>(function PhotoInput({ open, focusRequest, scheme, entry, initialFace, onFace, onApply, onClose }, ref) {
  const reviewId = useId();
  const [face, setFace] = useState(initialFace);
  const [photo, setPhoto] = useState<PhotoImage | null>(null);
  const [quad, setQuad] = useState<Quad>(() => defaultQuad(320, 320));
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);
  const [corrections, setCorrections] = useState<readonly (Color | null)[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [centerConfirmed, setCenterConfirmed] = useState(false);
  const [calibration, setCalibration] = useState<Calibration>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [change, setChange] = useState<PendingChange | null>(null);
  const photoRef = useRef<PhotoImage | null>(null);
  const version = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const cropArea = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const entryHeading = useRef<HTMLHeadingElement>(null);
  const previousFocus = useRef({ open: false, request: 0 });
  const totalComplete = FACES.filter((candidate) => complete(entry, candidate)).length;
  const expected = scheme[face];
  const neighbors = FACE_NEIGHBORS[face];
  const cropProblem = photo ? cropError(quad, photo.width, photo.height) : null;
  const map = photo && !cropProblem ? projectiveMap(quad) : null;

  useImperativeHandle(ref, () => ({ close: closePhotoEntry }));
  useEffect(() => {
    const opening = open && !previousFocus.current.open;
    if (open && (opening || focusRequest !== previousFocus.current.request)) {
      if (opening) setFace(initialFace);
      entryHeading.current?.focus({ preventScroll: true });
      entryHeading.current?.scrollIntoView({ block: 'start' });
    }
    previousFocus.current = { open, request: focusRequest };
  }, [open, focusRequest, initialFace]);
  useEffect(() => () => {
    version.current++;
    controller.current?.abort();
    if (timeout.current) clearTimeout(timeout.current);
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.url);
  }, []);
  useEffect(() => {
    if (analysis) reviewHeading.current?.focus();
  }, [analysis]);
  useEffect(() => {
    const cancelled = () => setNotice('No photo selected. Your entered colors and current review are unchanged. If camera access is unavailable, use Upload photo or the manual grids.');
    const inputs = [camera.current, upload.current];
    inputs.forEach((input) => input?.addEventListener('cancel', cancelled));
    return () => inputs.forEach((input) => input?.removeEventListener('cancel', cancelled));
  }, [open]);

  function clearDraft() {
    version.current++;
    controller.current?.abort();
    if (timeout.current) clearTimeout(timeout.current);
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.url);
    photoRef.current = null;
    setPhoto(null);
    setAnalysis(null);
    setCorrections([]);
    setReviewed(false);
    setCenterConfirmed(false);
    setBusy(null);
    setError(null);
  }

  function switchFace(next: Face) {
    const run = () => {
      clearDraft();
      setFace(next);
      onFace(next);
      setNotice('Your saved face colors are unchanged. Choose a photo of this face.');
    };
    if (photo || busy) setChange({
      title: `Leave the ${FACE_NAMES[face].toLowerCase()} photo?`,
      description: 'Only this uncommitted photo review will be discarded. All colors already entered in the cube stay unchanged.',
      confirmLabel: 'Change photo face', cancelLabel: 'Keep this photo', run,
    });
    else run();
  }

  async function prepare(operation: (signal: AbortSignal) => Promise<PhotoImage>, label: string) {
    const id = ++version.current;
    controller.current?.abort();
    if (timeout.current) clearTimeout(timeout.current);
    const abort = new AbortController();
    controller.current = abort;
    setBusy(label); setError(null); setNotice(null);
    timeout.current = setTimeout(() => {
      if (version.current !== id) return;
      version.current++;
      abort.abort();
      setBusy(null);
      setError('Photo decoding took too long. Try a smaller JPEG, PNG, or WebP, or enter colors manually. Your cube has not changed.');
    }, 20_000);
    try {
      const next = await operation(abort.signal);
      if (version.current !== id) { URL.revokeObjectURL(next.url); return; }
      if (photoRef.current) URL.revokeObjectURL(photoRef.current.url);
      photoRef.current = next;
      setPhoto(next);
      setQuad(defaultQuad(next.width, next.height));
      setAnalysis(null); setCorrections([]); setReviewed(false); setCenterConfirmed(false);
      setNotice('Align the four numbered corners with this face. The photo has not changed your cube.');
    } catch (error) {
      if (version.current === id && !abort.signal.aborted) setError(error instanceof Error ? error.message : 'Could not read the photo. Try another image; your cube is unchanged.');
    } finally {
      if (version.current === id) {
        if (timeout.current) clearTimeout(timeout.current);
        setBusy(null);
      }
    }
  }

  function choose(file: File | undefined) {
    if (file) void prepare((signal) => loadPhoto(file, signal), 'Loading photo locally...');
  }

  async function detect() {
    if (!photo || cropProblem || busy) return;
    const id = ++version.current;
    setBusy('Estimating nine sticker colors...'); setError(null); setNotice(null);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (version.current !== id) return;
    try {
      const result = analyzePhoto(photo, quad, expected, calibration);
      if (version.current !== id) return;
      setAnalysis(result);
      setCorrections(result.predictions.map((prediction) => prediction.color));
      setReviewed(false); setCenterConfirmed(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The selected region could not be analyzed. Realign it or use manual entry.');
    } finally {
      if (version.current === id) setBusy(null);
    }
  }

  function applyReviewed() {
    if (!analysis) return;
    let colors: readonly Color[];
    try { colors = reviewedColors(analysis, corrections, reviewed, centerConfirmed); }
    catch (error) { setError(error instanceof Error ? error.message : 'Complete the photo review first.'); return; }
    const run = () => {
      onApply(face, colors);
      const center = analysis.predictions[4];
      if (!analysis.centerNeedsConfirmation && center.color === expected) {
        setCalibration((previous) => ({ ...previous, [expected]: center.sample }));
      }
      const next = ENTRY_ORDER.find((candidate) => candidate !== face && !complete(entry, candidate));
      clearDraft();
      setNotice(`${FACE_NAMES[face]} face saved.${next ? ` Next: ${FACE_NAMES[next]}.` : ' All six faces are entered. Check colors & solve below.'}`);
      if (next) { setFace(next); onFace(next); }
    };
    const base = FACES.indexOf(face) * 9;
    if (entry.slice(base, base + 9).some((color, i) => i !== 4 && color !== null)) setChange({
      title: `Replace the ${FACE_NAMES[face].toLowerCase()} face colors?`,
      description: 'This applies your reviewed photo only to this face. Its fixed center and the other five faces stay unchanged.',
      confirmLabel: 'Replace face colors', cancelLabel: 'Keep entered colors', run,
    });
    else run();
  }

  function closePhotoEntry() {
    const run = () => { clearDraft(); setNotice(null); onClose(); };
    if (photo || busy) setChange({
      title: 'Close this photo review?', description: 'Uncommitted predictions will be discarded. Colors already in your cube are kept.',
      confirmLabel: 'Close photo entry', cancelLabel: 'Keep reviewing', run,
    });
    else run();
  }

  const canApply = analysis && reviewed && corrections.every((color, i) => i === 4 || isColor(color))
    && (!analysis.centerNeedsConfirmation || centerConfirmed) && !busy;

  if (!open) return null;

  return (
    <section className="photo-entry" data-testid="photo-input" aria-label="Photo-assisted cube entry">
        <div className="photo-workflow">
          <div className="section-heading"><h3 ref={entryHeading} tabIndex={-1}>Photo-assisted entry</h3><button className="icon-button" aria-label="Close photo entry" onClick={closePhotoEntry}><Icon name="close" size={17} /></button></div>
          <p className="photo-intro">A single picture hides stickers. Photograph <strong>all six faces</strong> separately, in even light without flash. Every estimate needs your review.</p>
          <div className="photo-face-progress" role="group" aria-label="Photo face progress">
            {ENTRY_ORDER.map((candidate) => (
              <button key={candidate} aria-pressed={candidate === face}
                aria-label={`Photograph ${FACE_NAMES[candidate]}${complete(entry, candidate) ? ', face entered' : ', not entered'}`}
                onClick={() => { if (candidate !== face) switchFace(candidate); }}>
                {candidate}{complete(entry, candidate) && <Icon name="check" size={12} />}
              </button>
            ))}
          </div>
          <p className="photo-progress-text" role="status">{totalComplete} of 6 faces entered. Now photographing <strong>{FACE_NAMES[face]}</strong>.</p>
          <label className="photo-face-select">Photo face
            <select aria-label="Photo face" value={face} onChange={(event) => { if (isFace(event.target.value)) switchFace(event.target.value); }}>
              {ENTRY_ORDER.map((candidate) => <option key={candidate} value={candidate}>{FACE_NAMES[candidate]} ({candidate}) - {COLOR_INFO[scheme[candidate]].name} center</option>)}
            </select>
          </label>
          <div className="photo-orientation"><span>Top edge: <ColorMark color={scheme[neighbors.top]} name /> ({neighbors.top})</span><span>Right edge: <ColorMark color={scheme[neighbors.right]} name /> ({neighbors.right})</span></div>
          <details className="photo-hold-guide"><summary>How to hold this face for the photo</summary><p>{orientationInstruction(face, scheme)}</p></details>
          <input ref={camera} type="file" hidden accept="image/*" capture="environment" data-testid="photo-camera"
            onChange={(event) => { choose(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
          <input ref={upload} type="file" hidden accept="image/*" data-testid="photo-upload"
            onChange={(event) => { choose(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
          <div className="photo-file-actions">
            <button className="button secondary" disabled={!!busy} onClick={() => camera.current?.click()}><Icon name="camera" size={17} /> Take a photo</button>
            <button className="button secondary" disabled={!!busy} onClick={() => upload.current?.click()}><Icon name="upload" size={17} /> Upload photo</button>
          </div>
          <p className="photo-help">Take a photo opens a native camera only where your device/browser supports it; otherwise use Upload. JPEG, PNG, or WebP, up to 16 MB / 24 MP. Nothing is sent to a server.</p>
          {busy && <p className="photo-notice" role="status">{busy}</p>}
          {notice && <p className="photo-notice" role="status">{notice}</p>}
          {error && <div className="photo-error" role="alert">{error}</div>}
          {photo && (
            <>
              <h4 className="photo-step-title">{analysis ? 'Photo used for these estimates' : 'Align the face, not the whole cube'}</h4>
              {!analysis && <p className="photo-help">Rotate the photo upright. Drag corners 1-4 to the outside corners of the nine stickers: top-left, top-right, bottom-right, bottom-left. Focus a handle and use arrow keys for fine adjustment; Shift moves faster.</p>}
              <div className={`photo-crop-area ${analysis ? 'review-photo' : ''}`} ref={cropArea}>
                <img src={photo.url} alt={`${FACE_NAMES[face]} face photo selected for local color analysis`} draggable={false} data-testid="photo-preview" />
                {!analysis && (
                  <>
                    <svg className="photo-crop-grid" viewBox={`0 0 ${photo.width} ${photo.height}`} aria-hidden="true">
                      <polygon points={quad.map((point) => `${point.x},${point.y}`).join(' ')} fill="#3552ba0a" stroke={cropProblem ? '#b32338' : '#ffffff'} strokeWidth={photo.width / 140} />
                      {map && [1 / 3, 2 / 3].flatMap((value) => {
                        const a = map(value, 0), b = map(value, 1), c = map(0, value), d = map(1, value);
                        return [<line key={`v-${value}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />, <line key={`h-${value}`} x1={c.x} y1={c.y} x2={d.x} y2={d.y} />];
                      })}
                    </svg>
                    {quad.map((point, index) => (
                      <button key={index} type="button" className="crop-handle" data-testid={`crop-corner-${index}`} disabled={!!busy}
                        style={{ left: `${point.x / photo.width * 100}%`, top: `${point.y / photo.height * 100}%` }}
                        aria-label={`${CORNERS[index]} crop corner. Arrow keys adjust position.`}
                        onPointerDown={(event) => { drag.current = index; event.currentTarget.setPointerCapture(event.pointerId); }}
                        onPointerMove={(event) => {
                          if (drag.current !== index || !cropArea.current) return;
                          const rect = cropArea.current.getBoundingClientRect();
                          const x = Math.max(0, Math.min(photo.width - 1, (event.clientX - rect.left) / rect.width * photo.width));
                          const y = Math.max(0, Math.min(photo.height - 1, (event.clientY - rect.top) / rect.height * photo.height));
                          setQuad((previous) => replaceCorner(previous, index, { x, y }));
                        }}
                        onPointerUp={() => { drag.current = null; }}
                        onPointerCancel={() => { drag.current = null; }}
                        onKeyDown={(event) => {
                          const directions: Record<string, readonly [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
                          const direction = directions[event.key];
                          if (!direction) return;
                          event.preventDefault();
                          const step = event.shiftKey ? 10 : 1;
                          setQuad((previous) => replaceCorner(previous, index, {
                            x: Math.max(0, Math.min(photo.width - 1, previous[index].x + direction[0] * step)),
                            y: Math.max(0, Math.min(photo.height - 1, previous[index].y + direction[1] * step)),
                          }));
                        }}>{index + 1}</button>
                    ))}
                  </>
                )}
              </div>
              {!analysis ? (
                <>
                  {cropProblem && <p className="photo-error" role="alert">{cropProblem}</p>}
                  <div className="photo-alignment-actions">
                    <button className="text-button" disabled={!!busy} onClick={() => void prepare((signal) => previewFromPixels(rotatePixels(photo, false), photo.name, signal), 'Rotating photo...')}>Rotate left</button>
                    <button className="text-button" disabled={!!busy} onClick={() => void prepare((signal) => previewFromPixels(rotatePixels(photo, true), photo.name, signal), 'Rotating photo...')}>Rotate right</button>
                    <button className="text-button" disabled={!!busy} onClick={() => setQuad(defaultQuad(photo.width, photo.height))}>Reset corners</button>
                  </div>
                  <button className="button primary full-width" disabled={!!busy || !!cropProblem} onClick={detect}>Detect nine colors</button>
                </>
              ) : (
                <div className="photo-review">
                  <h4 ref={reviewHeading} tabIndex={-1}>Review the {FACE_NAMES[face].toLowerCase()} face</h4>
                  <p className="photo-help">These are estimates, not a completed cube entry. Correct any color below. Numbering is left to right, top to bottom.</p>
                  {analysis.warnings.length > 0 && <div className="photo-warnings">{analysis.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
                  <div className="photo-review-grid">
                    {analysis.predictions.map((prediction, i) => (
                      <div key={i} className={`photo-review-cell ${prediction.reason || !prediction.color ? 'uncertain-photo-cell' : ''}`}>
                        <span className="review-cell-title">{i + 1}{prediction.color && <ColorMark color={corrections[i] ?? prediction.color} />}</span>
                        {i === 4 ? <div className="photo-center-readout"><span>{prediction.color ? COLOR_INFO[prediction.color].name : 'Uncertain'}</span><small>Detected center</small></div>
                          : <select aria-label={`Review ${FACE_NAMES[face]} sticker ${i + 1} color`} value={corrections[i] ?? ''} disabled={!!busy}
                            aria-describedby={prediction.reason ? `${reviewId}-reason-${i}` : undefined}
                            onChange={(event) => {
                              const value = event.target.value;
                              setCorrections((previous) => previous.map((color, index) => index === i && isColor(value) ? value : color));
                              setReviewed(false);
                            }}>
                            <option value="" disabled>Choose...</option>
                            {COLORS.map((color) => <option key={color} value={color}>{COLOR_INFO[color].name}</option>)}
                          </select>}
                        <small className="prediction-confidence">{prediction.reason || !prediction.color ? 'Check this color' : 'Clear estimate'}</small>
                        {prediction.reason && <span id={`${reviewId}-reason-${i}`} className="sr-only">{prediction.reason}</span>}
                      </div>
                    ))}
                  </div>
                  <p className="photo-help">Configured center: <strong>{COLOR_INFO[expected].name}</strong>. Its identity stays fixed.</p>
                  {analysis.centerNeedsConfirmation && (
                    <div className="photo-center-warning" role="alert">
                      <p>The center estimate {analysis.predictions[4].color !== expected ? 'does not match' : 'needs checking against'} your configured {COLOR_INFO[expected].name.toLowerCase()} center. Recheck face orientation, crop, and lighting; retake if needed.</p>
                      <label><input type="checkbox" disabled={!!busy} checked={centerConfirmed} onChange={(event) => setCenterConfirmed(event.target.checked)} /> I checked this is the {COLOR_INFO[expected].name.toLowerCase()} center; keep that fixed identity.</label>
                    </div>
                  )}
                  <label className="photo-review-confirm"><input type="checkbox" disabled={!!busy} checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> I checked all nine colors against this face.</label>
                  <button className="button primary full-width" disabled={!canApply} onClick={applyReviewed}>Use reviewed {FACE_NAMES[face].toLowerCase()} face</button>
                  <button className="text-button" disabled={!!busy} onClick={() => { setAnalysis(null); setReviewed(false); setCenterConfirmed(false); }}>Back to alignment</button>
                </div>
              )}
            </>
          )}
          <p className="photo-help photo-manual-fallback">Prefer to enter by hand? Close photo entry and use the six sticker grids below. Saved colors are always kept.</p>
        </div>
      <DiscardDialog change={change} onCancel={() => setChange(null)} onConfirm={() => { const pending = change; setChange(null); pending?.run(); }} />
    </section>
  );
});
