import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { COLOR_INFO, FACE_NAMES, FACES, type Color, type Face } from '../cube/types';
import { ENTRY_ORDER, FACE_NEIGHBORS, photoOrientationInstruction } from '../input/orientation';
import type { CapturedFace, PhotoAssembly, PhotoProblem } from '../input/photo/automatic';
import { PhotoClient } from '../input/photo/client';
import { loadPhoto, previewFromPixels, type PhotoImage } from '../input/photo/load';
import { Icon } from './Icon';

interface StoredPhoto extends CapturedFace {
  readonly center: Color;
  readonly url: string;
}
type Photos = Partial<Record<Face, StoredPhoto>>;
type Working = 'decoding' | 'reading' | 'checking';
interface Props {
  visible: boolean;
  focusRequest: number;
  onCount(count: number): void;
  onWorking(working: boolean): void;
  onComplete(stickers: readonly Color[]): void;
  onManual(): void;
  onPractice(): void;
}

export function AutomaticPhotoInput(props: Props) {
  const [photos, setPhotos] = useState<Photos>({});
  const [active, setActive] = useState<Face>('F');
  const [working, setWorking] = useState<Working | null>(null);
  const [problem, setProblem] = useState<PhotoProblem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState<Extract<PhotoAssembly, { ok: true }> | null>(null);
  const saved = useRef<Photos>({});
  const version = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const client = useRef<PhotoClient | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const targetFace = useRef<Face>('F');
  const uploadButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorElement = useRef<HTMLDivElement>(null);
  const focusUpload = useRef(false);
  const count = Object.keys(photos).length;
  const neighbor = FACE_NEIGHBORS[active].top;

  useEffect(() => () => {
    version.current++;
    controller.current?.abort();
    if (timeout.current) clearTimeout(timeout.current);
    client.current?.dispose();
    Object.values(saved.current).forEach((photo) => URL.revokeObjectURL(photo.url));
  }, []);

  useEffect(() => {
    if (!props.visible || !props.focusRequest) return;
    const frame = requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [props.visible, props.focusRequest]);
  useEffect(() => {
    if (problem && !working && props.visible) errorElement.current?.focus();
  }, [problem, working, props.visible]);
  useEffect(() => {
    if (focusUpload.current && !working && props.visible) {
      focusUpload.current = false;
      uploadButton.current?.focus({ preventScroll: true });
    }
  }, [active, working, props.visible]);

  function start(phase: Working, face: Face = active) {
    const ownVersion = ++version.current;
    controller.current?.abort();
    if (timeout.current) clearTimeout(timeout.current);
    client.current?.cancel();
    const abort = new AbortController();
    controller.current = abort;
    client.current ??= new PhotoClient();
    setWorking(phase);
    setNotice(null);
    callbacks.current.onWorking(true);
    timeout.current = setTimeout(() => {
      if (ownVersion !== version.current) return;
      report(new Error('Photo processing took too long. Try a smaller, clearer image; your accepted photos are preserved.'), ownVersion, face);
      version.current++;
      abort.abort();
      client.current?.cancel();
      controller.current = null;
      timeout.current = null;
      setWorking(null);
      callbacks.current.onWorking(false);
    }, 20_000);
    return { ownVersion, abort };
  }

  function finish(ownVersion: number) {
    if (ownVersion !== version.current) return;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    controller.current = null;
    setWorking(null);
    callbacks.current.onWorking(false);
  }

  function report(error: unknown, ownVersion: number, face: Face) {
    if (ownVersion !== version.current) return;
    const message = error instanceof Error ? error.message : 'The photo could not be read. Retake this face or use manual entry.';
    setProblem({
      code: 'unclear', faces: [face],
      message: `${message}${saved.current[face] ? ` Previous ${FACE_NAMES[face].toLowerCase()} photo kept.` : ''}`,
    });
  }

  async function check(current: Photos, ownVersion: number) {
    const captures = FACES.flatMap((face) => {
      const photo = current[face];
      return photo ? [{ face, samples: photo.samples }] : [];
    });
    if (captures.length !== 6) throw new Error('Add all six face photos before checking them.');
    if (!client.current) throw new Error('Photo processing is not ready. Try checking the photos again.');
    setWorking('checking');
    const result = await client.current.assemble(captures);
    if (ownVersion !== version.current) return;
    if (!result.ok) {
      setProblem(result.problem);
      if (result.problem.faces[0]) setActive(result.problem.faces[0]);
      return;
    }
    setProblem(null);
    setReady(result);
    callbacks.current.onComplete(result.stickers);
  }

  async function read(file: File, face: Face) {
    const { ownVersion, abort } = start('decoding', face);
    let image: PhotoImage | null = null;
    let thumbnail: PhotoImage | null = null;
    try {
      image = await loadPhoto(file, abort.signal);
      if (ownVersion !== version.current) return;
      if (!client.current) throw new Error('Photo processing is not ready. Choose the photo again.');
      setWorking('reading');
      const reading = await client.current.read(image);
      if (ownVersion !== version.current) return;
      const duplicate = Object.values(saved.current).find((photo) => photo.face !== face && photo.center === reading.center);
      if (duplicate) throw new Error(`${FACE_NAMES[face]} looks like ${FACE_NAMES[duplicate.face]}: both have ${reading.center} centers. Retake the correct ${FACE_NAMES[face].toLowerCase()} face.`);
      thumbnail = await previewFromPixels(reading.thumbnail, file.name, abort.signal);
      if (ownVersion !== version.current) return;
      const previous = saved.current[face];
      const next = {
        ...saved.current,
        [face]: { face, center: reading.center, samples: reading.samples, url: thumbnail.url },
      };
      saved.current = next;
      setPhotos(next);
      thumbnail = null;
      if (previous) URL.revokeObjectURL(previous.url);
      setReady(null);
      setProblem(null);
      callbacks.current.onCount(Object.keys(next).length);
      const nextFace = ENTRY_ORDER.find((candidate) => !next[candidate]);
      if (nextFace) {
        focusUpload.current = true;
        setActive(nextFace);
        setNotice(`${FACE_NAMES[face]} added. Next: ${FACE_NAMES[nextFace]}.`);
      } else {
        await check(next, ownVersion);
      }
    } catch (error) {
      report(error, ownVersion, face);
    } finally {
      if (image) URL.revokeObjectURL(image.url);
      if (thumbnail) URL.revokeObjectURL(thumbnail.url);
      finish(ownVersion);
    }
  }

  async function retry() {
    if (ready) {
      setProblem(null);
      callbacks.current.onComplete(ready.stickers);
      return;
    }
    const { ownVersion } = start('checking');
    try { await check(saved.current, ownVersion); }
    catch (error) { report(error, ownVersion, active); }
    finally { finish(ownVersion); }
  }

  function cancel() {
    version.current++;
    controller.current?.abort();
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    controller.current = null;
    client.current?.cancel();
    setWorking(null);
    setNotice('Processing cancelled. Your accepted photos are unchanged.');
    callbacks.current.onWorking(false);
    uploadButton.current?.focus();
  }

  function choose(useCamera = false) {
    targetFace.current = active;
    (useCamera ? camera : input).current?.click();
  }
  function selected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void read(file, targetFace.current);
  }
  function selectFace(face: Face) {
    targetFace.current = face;
    focusUpload.current = true;
    setActive(face);
    setNotice(null);
    if (face === active) uploadButton.current?.focus();
  }

  return (
    <section className="automatic-entry" aria-labelledby="automatic-title">
      <div className="automatic-intro">
        <h1 id="automatic-title" ref={heading} tabIndex={-1}>Your cube, in six photos.</h1>
        <p>Add each face. We&apos;ll read the colors and find a verified solution. No color setup needed.</p>
      </div>

      <div className="auto-face-guide" aria-live="polite" aria-atomic="true">
        <div className="auto-step-heading">
          <h2>{FACE_NAMES[active]} face</h2>
          <span>Top edge: <strong>{FACE_NAMES[neighbor]}{photos[neighbor] ? ` (${photos[neighbor].center})` : ''}</strong></span>
        </div>
        <p id="automatic-orientation">{photoOrientationInstruction(active)}</p>
      </div>
      <button className="button primary auto-upload-button" ref={uploadButton}
        data-testid="landing-photo-action" disabled={!!working}
        aria-describedby="automatic-orientation"
        aria-label={`${photos[active] ? 'Retake' : 'Take or upload'} ${FACE_NAMES[active]} face photo`}
        onClick={() => choose()}>
        <Icon name="camera" size={21} />
        {working === 'checking' ? 'Checking the six faces...' : working ? 'Reading your photo...' : photos[active] ? `Retake ${FACE_NAMES[active].toLowerCase()} photo` : 'Take or upload a photo'}
      </button>
      <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp"
        aria-label={`Upload ${FACE_NAMES[active]} face photo`} data-testid="automatic-photo-file"
        onChange={(event) => { targetFace.current = active; selected(event); }} />
      <input ref={camera} type="file" hidden accept="image/jpeg,image/png,image/webp" capture="environment"
        aria-label={`Take ${FACE_NAMES[active]} face photo with camera`}
        onChange={(event) => { targetFace.current = active; selected(event); }} />
      <div className="auto-file-options">
        <p>JPEG, PNG or WebP. Up to 16 MB.</p>
        <button className="text-button" disabled={!!working} onClick={() => choose(true)}
          title="Opens your device camera when supported; otherwise opens the photo picker.">Use device camera</button>
      </div>

      <div className="auto-status">
        <p role="status">{working === 'checking' ? 'Matching all colors and checking every piece.'
          : working ? `Reading ${FACE_NAMES[active].toLowerCase()} photo on your device.`
            : notice ?? `${count} of 6 photos added.`}</p>
        {working && <button className="text-button" onClick={cancel}>Cancel processing</button>}
      </div>
      {problem && !working && (
        <div className="auto-photo-error" ref={errorElement} tabIndex={-1} role="alert">
          <Icon name="alert" size={19} />
          <div>
            <p>{problem.message}</p>
            {!!problem.details?.length && <details><summary>What did not match</summary><ul>{problem.details.map((detail, i) => <li key={i}>{detail}</li>)}</ul></details>}
          </div>
        </div>
      )}
      <ol className="auto-photo-slots" aria-label="Six cube face photos">
        {ENTRY_ORDER.map((face) => {
          const photo = photos[face], needsRetake = problem?.faces.includes(face);
          return (
            <li key={face}>
              <button className={`auto-photo-slot ${face === active ? 'active' : ''}`} disabled={!!working}
                aria-current={face === active ? 'step' : undefined}
                aria-label={`${FACE_NAMES[face]} photo: ${photo ? `${photo.center} center, added` : 'not added'}${needsRetake ? ', check this face' : ''}. Select ${photo ? 'to retake' : 'face'}.`}
                data-testid={`auto-slot-${face}`} onClick={() => selectFace(face)}>
                <span className="auto-face-thumbnail">
                  {photo ? <img src={photo.url} alt={`${FACE_NAMES[face]} detected face`} width={70} height={70} /> : <span aria-hidden="true">{face}</span>}
                  {photo && <span className="auto-photo-check"><Icon name={needsRetake ? 'alert' : 'check'} size={13} /></span>}
                </span>
                <strong>{FACE_NAMES[face]}</strong>
                <small>{photo ? `${COLOR_INFO[photo.center].name} center` : 'No photo'}</small>
              </button>
            </li>
          );
        })}
      </ol>
      {count === 6 && !working && <button className="text-button auto-retry" onClick={() => void retry()}>{ready ? 'Use these photos again' : 'Check photos again'}</button>}
      <details className="auto-photo-tips">
        <summary>Tips for a clear photo</summary>
        <p>Show one whole face with all nine stickers and visible gaps. Leave a little space around it. Use even light, avoid flash glare, and keep the top edge shown above upright. Do not turn individual layers between photos.</p>
        <p>Faded colors, small scratches, and center logos can be read when enough original color remains visible. In low light, hold the camera steady and add diffuse light if asked to retake. Hidden, fully washed-out, or glare-covered colors cannot be recovered.</p>
        <p>For standard six-color 3x3 cubes. If a face still will not read, choose Enter colors manually for optional photo alignment and editable color review. We never fill in unseen stickers.</p>
      </details>
      <div className="automatic-alternatives">
        <button className="text-button" onClick={props.onManual}>Enter colors manually</button>
        <button className="text-button" onClick={props.onPractice}>Try a scramble</button>
      </div>
    </section>
  );
}
