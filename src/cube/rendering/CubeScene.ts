import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { TurnCue } from '../animation/cue';
import { FACE_AXES, isInLayer, moveAngle, STICKER_GEOMETRY, vectorKey, type Vector } from '../geometry';
import { toFacelets } from '../model';
import { COLORS, COLOR_INFO, FACES, type Color, type ColorScheme, type CubeState, type Face, type Move } from '../types';

const SPACING = 1.025;
const DEFAULT_CAMERA = new THREE.Vector3(6, 4.7, 6.6);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

interface Cubelet {
  readonly group: THREE.Group;
  readonly body: THREE.Mesh;
  readonly position: Vector;
}

interface StickerMesh {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly index: number;
  color: Color;
}

export interface CubeInspection {
  readonly cubeletCount: number;
  readonly stickerCount: number;
  readonly aligned: boolean;
  readonly facelets: string | null;
  readonly movingCubelets: number;
  readonly progress: number;
  readonly maxGridError: number;
  readonly camera: { readonly position: number[]; readonly up: number[]; readonly distance: number };
  readonly indicator: { readonly face: Face; readonly direction: 'clockwise' | 'counter-clockwise' } | null;
  readonly transforms: readonly { position: number[]; quaternion: number[] }[];
}

export class CubeScene {
  private readonly scene = new THREE.Scene();
  private readonly root = new THREE.Group();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private readonly observer: ResizeObserver;
  private readonly cubelets: Cubelet[] = [];
  private readonly stickers: StickerMesh[] = [];
  private readonly resources: { dispose(): void }[] = [];
  private readonly materials: Record<Color, THREE.MeshStandardMaterial>;
  private readonly plainMaterials: Record<Color, THREE.MeshStandardMaterial>;
  private readonly bodyMaterial = new THREE.MeshStandardMaterial({ color: '#1d2532', roughness: 0.65 });
  private readonly highlightMaterial = new THREE.MeshStandardMaterial({ color: '#344969', roughness: 0.58 });
  private arrow: THREE.Group | null = null;
  private arrowKey = '';
  private frame = 0;
  private disposed = false;
  private currentCube: CubeState | null = null;
  private currentScheme: ColorScheme | null = null;
  private symbols = true;
  private progress = 0;
  private animationFace: Face | null = null;
  private readonly onContextLost: (event: Event) => void;

  constructor(private readonly host: HTMLElement, onError: (message: string) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute('aria-label', '3D Rubik\'s Cube. Drag to orbit; pinch or scroll to zoom. Use the view controls for exact face views.');
    this.renderer.domElement.setAttribute('role', 'img');
    host.append(this.renderer.domElement);
    this.onContextLost = (event) => {
      event.preventDefault();
      onError('The 3D graphics context was lost. Your cube and solution are preserved. Reload the page to restore WebGL, or continue with the written moves.');
    };
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);

    this.camera.position.copy(DEFAULT_CAMERA);
    this.controls = this.makeControls();

    this.scene.add(this.root);
    this.scene.add(new THREE.AmbientLight(0xffffff, 2.3));
    const key = new THREE.DirectionalLight(0xffffff, 3.1);
    key.position.set(4, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.normalBias = 0.04;
    this.resources.push(key.shadow);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xe2ecff, 1.5);
    fill.position.set(-5, 1, -4);
    this.scene.add(fill);
    const shadowGeometry = new THREE.PlaneGeometry(16, 16);
    const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.14 });
    const floor = new THREE.Mesh(shadowGeometry, shadowMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.62;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.resources.push(shadowGeometry, shadowMaterial, this.bodyMaterial, this.highlightMaterial);

    this.materials = this.makeStickerMaterials(true);
    this.plainMaterials = this.makeStickerMaterials(false);
    const bodyGeometry = new RoundedBoxGeometry(0.985, 0.985, 0.985, 2, 0.07);
    const stickerGeometry = new RoundedBoxGeometry(0.835, 0.835, 0.025, 2, 0.065);
    this.resources.push(bodyGeometry, stickerGeometry);
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const group = new THREE.Group();
          group.position.set(x * SPACING, y * SPACING, z * SPACING);
          const body = new THREE.Mesh(bodyGeometry, this.bodyMaterial);
          body.castShadow = true;
          body.receiveShadow = true;
          group.add(body);
          this.root.add(group);
          const position: Vector = [x, y, z];
          this.cubelets.push({ group, body, position });
          for (const sticker of STICKER_GEOMETRY.filter((s) => s.position.every((value, i) => value === position[i]))) {
            const mesh = new THREE.Mesh(stickerGeometry, this.materials.white);
            const normal = new THREE.Vector3(...sticker.normal);
            mesh.position.copy(normal).multiplyScalar(0.499);
            mesh.quaternion.setFromUnitVectors(Z_AXIS, normal);
            mesh.castShadow = true;
            group.add(mesh);
            this.stickers.push({ mesh, index: sticker.index, color: 'white' });
          }
        }
      }
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    const render = () => {
      if (this.disposed) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(render);
    };
    this.frame = requestAnimationFrame(render);
  }

  private makeControls(): OrbitControls {
    const controls = new OrbitControls(this.camera, this.renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.enablePan = false;
    controls.minDistance = 5.8;
    controls.maxDistance = 14;
    controls.target.set(0, 0, 0);
    controls.update();
    return controls;
  }

  private makeStickerMaterials(symbols: boolean): Record<Color, THREE.MeshStandardMaterial> {
    return Object.fromEntries(COLORS.map((color) => {
      const info = COLOR_INFO[color];
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable for cube stickers.');
      context.fillStyle = info.hex;
      context.fillRect(0, 0, 128, 128);
      if (symbols) {
        context.fillStyle = info.ink;
        context.font = '600 36px system-ui, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(info.symbol, 64, 66);
      }
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
      this.resources.push(map, material);
      return [color, material];
    })) as Record<Color, THREE.MeshStandardMaterial>;
  }

  setFrame(
    cube: CubeState,
    scheme: ColorScheme,
    animation: { move: Move; progress: number } | null,
    highlight: TurnCue | null,
    symbols: boolean,
  ): void {
    if (cube !== this.currentCube || scheme !== this.currentScheme || symbols !== this.symbols) {
      const facelets = toFacelets(cube);
      for (const sticker of this.stickers) {
        sticker.color = scheme[facelets[sticker.index]];
        sticker.mesh.material = (symbols ? this.materials : this.plainMaterials)[sticker.color];
      }
      this.currentCube = cube;
      this.currentScheme = scheme;
      this.symbols = symbols;
    }
    this.progress = animation?.progress ?? 0;
    this.animationFace = animation?.move.face ?? null;
    const rotation = new THREE.Quaternion();
    if (animation) {
      const axis = FACE_AXES[animation.move.face].axis;
      const vector = new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
      const eased = animation.progress * animation.progress * (3 - 2 * animation.progress);
      rotation.setFromAxisAngle(vector, moveAngle(animation.move) * eased);
    }
    for (const cubelet of this.cubelets) {
      // Rebuild from exact lattice coordinates every frame; never accumulate transforms.
      cubelet.group.position.set(...cubelet.position).multiplyScalar(SPACING);
      cubelet.group.quaternion.identity();
      if (animation && isInLayer(cubelet.position, animation.move.face)) {
        cubelet.group.position.applyQuaternion(rotation);
        cubelet.group.quaternion.copy(rotation);
      }
      cubelet.body.material = highlight && isInLayer(cubelet.position, highlight.move.face)
        ? this.highlightMaterial : this.bodyMaterial;
    }
    this.setArrow(highlight);
    this.root.updateMatrixWorld(true);
  }

  private setArrow(cue: TurnCue | null): void {
    const move = cue?.move;
    const key = move ? `${move.face}:${move.turns}:${cue.direction}` : '';
    if (key === this.arrowKey) return;
    this.arrowKey = key;
    if (this.arrow) {
      this.root.remove(this.arrow);
      this.arrow.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      this.arrow = null;
    }
    if (!move || !cue) return;
    const arrow = new THREE.Group();
    const direction = cue.direction === 'counter-clockwise' ? 1 : -1;
    const start = Math.PI * 0.72;
    const arc = move.turns === 2 ? Math.PI : Math.PI / 2;
    const points = Array.from({ length: 33 }, (_, i) => {
      const angle = start + direction * arc * i / 32;
      return new THREE.Vector3(1.83 * Math.cos(angle), 1.83 * Math.sin(angle), 0);
    });
    const path = new THREE.CatmullRomCurve3(points);
    const material = new THREE.MeshBasicMaterial({ color: '#334fa4' });
    arrow.add(new THREE.Mesh(new THREE.TubeGeometry(path, 32, 0.029, 6, false), material));
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.21, 10), material.clone());
    head.name = 'direction-head';
    const last = points[points.length - 1];
    const tangent = path.getTangent(1).normalize();
    head.position.copy(last).addScaledVector(tangent, 0.07);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    arrow.add(head);
    const normal = new THREE.Vector3(...FACE_AXES[move.face].normal);
    arrow.position.copy(normal).multiplyScalar(1.57);
    arrow.quaternion.setFromUnitVectors(Z_AXIS, normal);
    this.root.add(arrow);
    this.arrow = arrow;
  }

  lookAt(face: Face | null): void {
    this.controls.dispose();
    if (face) {
      this.camera.position.set(...FACE_AXES[face].normal).multiplyScalar(9);
      this.camera.up.set(0, 1, 0);
      if (face === 'U') this.camera.up.set(0, 0, -1);
      if (face === 'D') this.camera.up.set(0, 0, 1);
    } else {
      this.camera.position.copy(DEFAULT_CAMERA);
      this.camera.up.set(0, 1, 0);
    }
    this.camera.lookAt(0, 0, 0);
    // OrbitControls caches the camera's up axis and residual damping at construction.
    this.controls = this.makeControls();
  }

  inspect(): CubeInspection {
    this.root.updateMatrixWorld(true);
    const result: (Face | null)[] = Array(54).fill(null);
    const lookup = new Map(STICKER_GEOMETRY.map((s) => [vectorKey(s.position, s.normal), s.index]));
    let aligned = true;
    let maxGridError = 0;
    for (const cubelet of this.cubelets) {
      const position = cubelet.group.position.clone().divideScalar(SPACING);
      maxGridError = Math.max(maxGridError, ...position.toArray().map((value) => Math.abs(value - Math.round(value))));
    }
    const worldPosition = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    for (const sticker of this.stickers) {
      sticker.mesh.getWorldPosition(worldPosition);
      sticker.mesh.getWorldQuaternion(quaternion);
      const normal = Z_AXIS.clone().applyQuaternion(quaternion);
      const normalValues = normal.toArray();
      if (normalValues.some((value) => Math.abs(value - Math.round(value)) > 1e-6)) aligned = false;
      const roundedNormal: Vector = [Math.round(normal.x), Math.round(normal.y), Math.round(normal.z)];
      const cubeletPosition = worldPosition.clone().addScaledVector(normal, -0.499).divideScalar(SPACING);
      const roundedPosition: Vector = [Math.round(cubeletPosition.x), Math.round(cubeletPosition.y), Math.round(cubeletPosition.z)];
      const index = lookup.get(vectorKey(roundedPosition, roundedNormal));
      const face = this.currentScheme ? FACES.find((candidate) => this.currentScheme?.[candidate] === sticker.color) : undefined;
      if (index === undefined || !face || result[index] !== null) {
        aligned = false;
      } else {
        result[index] = face;
      }
    }
    aligned &&= maxGridError < 1e-6 && result.every((face) => face !== null);
    let indicator: CubeInspection['indicator'] = null;
    const head = this.arrow?.getObjectByName('direction-head');
    if (this.arrow && head) {
      const tangent = new THREE.Vector3(0, 1, 0).applyQuaternion(head.quaternion);
      const winding = head.position.x * tangent.y - head.position.y * tangent.x;
      const normal = Z_AXIS.clone().applyQuaternion(this.arrow.quaternion);
      const face = FACES.find((candidate) => FACE_AXES[candidate].normal.every((value, i) => Math.abs(value - normal.getComponent(i)) < 1e-6));
      if (face) indicator = { face, direction: winding < 0 ? 'clockwise' : 'counter-clockwise' };
    }
    return {
      cubeletCount: this.cubelets.length,
      stickerCount: this.stickers.length,
      aligned,
      facelets: aligned ? result.join('') : null,
      movingCubelets: this.animationFace ? this.cubelets.filter((cubelet) => isInLayer(cubelet.position, this.animationFace!)).length : 0,
      progress: this.progress,
      maxGridError,
      camera: { position: this.camera.position.toArray(), up: this.camera.up.toArray(), distance: this.camera.position.length() },
      indicator,
      transforms: this.cubelets.map(({ group }) => ({ position: group.position.toArray(), quaternion: group.quaternion.toArray() })),
    };
  }

  private resize(): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    this.setArrow(null);
    this.resources.forEach((resource) => resource.dispose());
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
