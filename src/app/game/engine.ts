import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Character } from '../characters';
import { buildCharacter } from './character-model';
import { buildClassroom, CEILING_LIGHTS, PLAYER_BOUNDS } from './classroom';
import { loadLayout } from './furniture';
import { makeNameSprite } from './textures';

export interface Dialogue {
  name: string;
  line: string;
  color: number;
}

export interface EngineCallbacks {
  onObjective: (text: string) => void;
  onProgress: (talked: number, total: number) => void;
  onPrompt: (text: string | null) => void;
  onDialogue: (d: Dialogue | null) => void;
  onTime: (seconds: number) => void;
  onWin: (seconds: number) => void;
  onLockChange: (locked: boolean) => void;
}

interface Interactable {
  pos: THREE.Vector3;
  range: number;
  id: string;
  name: string;
  line: string;
  color: number;
}

const EYE_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.35;
const MAX_SPEED = 4.2;
const ACCEL_DAMP = 12;

export class GameEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private controls: PointerLockControls;

  private colliders: THREE.Box3[] = [];
  private interactables: Interactable[] = [];

  private talked = new Set<string>();
  private total = 0;
  private dialogueOpen = false;
  private pendingWin = false;
  private activePrompt: string | null = null;

  private velocity = new THREE.Vector3();
  private keys = { fwd: false, back: false, left: false, right: false };

  private clock = new THREE.Clock();
  private elapsed = 0;
  private lastWholeSecond = -1;
  private playing = false;
  private won = false;
  private rafId = 0;
  private disposed = false;

  private readonly onResize = () => this.resize();
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (this.isInteractKey(e)) {
      e.preventDefault();
      this.onInteract();
      return;
    }
    this.setKey(e, true);
  };
  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (this.isInteractKey(e)) return;
    this.setKey(e, false);
  };
  private readonly onCanvasClick = () => {
    if (!this.won && !this.disposed) this.controls.lock();
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private character: Character,
    private others: Character[],
    private cb: EngineCallbacks,
  ) {
    this.total = others.length;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color(0x171b24);
    this.scene.fog = new THREE.Fog(0xcdd2db, 22, 60);

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 100);

    this.controls = new PointerLockControls(this.camera, canvas);
    this.controls.addEventListener('lock', () => {
      this.playing = true;
      this.cb.onLockChange(true);
    });
    this.controls.addEventListener('unlock', () => {
      this.playing = false;
      this.cb.onLockChange(false);
    });

    this.composer = new EffectComposer(this.renderer);
    const pixelPass = new RenderPixelatedPass(4, this.scene, this.camera);
    pixelPass.normalEdgeStrength = 0.3;
    pixelPass.depthEdgeStrength = 0.4;
    this.composer.addPass(pixelPass);
    this.composer.addPass(new OutputPass());

    this.buildWorld();
    this.resize();
  }

  private buildWorld(): void {
    const room = buildClassroom(loadLayout());
    this.scene.add(room.group);
    this.colliders = room.colliders;

    this.scene.add(new THREE.AmbientLight(0x9aa0b4, 0.7));
    this.scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x40434d, 0.5));
    const sun = new THREE.DirectionalLight(0xfff1d0, 1.5);
    sun.position.set(14, 12, 4);
    sun.target.position.set(-2, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 45;
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.scene.add(sun.target);
    for (const p of CEILING_LIGHTS) {
      const light = new THREE.PointLight(0xfff2d4, 0.5, 12, 2);
      light.position.copy(p);
      this.scene.add(light);
    }

    // PNJ : les alternants placés dans l'éditeur (objets « npc » de la map)
    if (this.others.length > 0) {
      room.npcSpawns.forEach((anchor, i) => {
        const who = this.others[i % this.others.length];
        const model = buildCharacter(who);
        model.position.copy(anchor.pos);
        model.rotation.y = anchor.rotY;
        this.scene.add(model);
        const label = makeNameSprite(who.name, who.color);
        label.position.set(anchor.pos.x, 2.25, anchor.pos.z);
        this.scene.add(label);
        this.colliders.push(
          new THREE.Box3(
            new THREE.Vector3(anchor.pos.x - 0.35, 0, anchor.pos.z - 0.35),
            new THREE.Vector3(anchor.pos.x + 0.35, 1.8, anchor.pos.z + 0.35),
          ),
        );
        this.interactables.push({
          pos: new THREE.Vector3(anchor.pos.x, 1.3, anchor.pos.z),
          range: 2.4,
          id: `n${i}`,
          name: who.name,
          line: who.line,
          color: who.color,
        });
      });
    }
    this.total = this.interactables.length;

    this.camera.position.copy(room.spawn);
    this.camera.position.y = EYE_HEIGHT;
    const fx = -Math.sin(room.spawnRot);
    const fz = -Math.cos(room.spawnRot);
    this.camera.lookAt(room.spawn.x + fx, EYE_HEIGHT, room.spawn.z + fz);

    this.cb.onProgress(0, this.total);
    this.updateObjective();
  }

  // --------------------------------------------------------------- histoire

  private get allTalked(): boolean {
    return this.total > 0 && this.talked.size >= this.total;
  }

  private updateObjective(): void {
    this.cb.onProgress(this.talked.size, this.total);
    this.cb.onObjective(
      this.allTalked
        ? 'Toute la classe est prête pour la soutenance ! 🎓'
        : 'Parle à tous tes camarades de la classe.',
    );
  }

  private openDialogue(d: Dialogue): void {
    this.dialogueOpen = true;
    this.cb.onDialogue(d);
    this.activePrompt = null;
    this.cb.onPrompt(null);
  }

  private closeDialogue(): void {
    if (!this.dialogueOpen) return;
    this.dialogueOpen = false;
    this.cb.onDialogue(null);
  }

  private onInteract(): void {
    if (!this.playing || this.won) return;
    if (this.dialogueOpen) {
      this.closeDialogue();
      if (this.pendingWin) this.win();
      return;
    }
    const it = this.activeInteractable();
    if (!it) return;
    this.openDialogue({ name: it.name, line: it.line, color: it.color });
    if (!this.talked.has(it.id)) {
      this.talked.add(it.id);
      this.updateObjective();
      if (this.allTalked) this.pendingWin = true;
    }
  }

  private activeInteractable(): Interactable | null {
    const p = this.camera.position;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    let best: Interactable | null = null;
    let bestDist = Infinity;
    for (const it of this.interactables) {
      const dx = it.pos.x - p.x;
      const dz = it.pos.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > it.range) continue;
      const facing = dist < 0.001 ? 1 : (dx * forward.x + dz * forward.z) / dist;
      if (facing < 0.3 && dist > 1.3) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = it;
      }
    }
    return best;
  }

  private updatePrompt(): void {
    const it = this.activeInteractable();
    const text = it ? `[E] ${this.talked.has(it.id) ? 'Reparler à' : 'Parler à'} ${it.name}` : null;
    if (text !== this.activePrompt) {
      this.activePrompt = text;
      this.cb.onPrompt(text);
    }
  }

  private win(): void {
    this.won = true;
    this.closeDialogue();
    this.controls.unlock();
    this.cb.onWin(Math.floor(this.elapsed));
  }

  // --------------------------------------------------------------- entrées

  private isInteractKey(e: KeyboardEvent): boolean {
    return e.code === 'KeyE' || e.key.toLowerCase() === 'e' || e.code === 'Enter';
  }

  private setKey(e: KeyboardEvent, down: boolean): void {
    const code = e.code;
    const k = e.key.toLowerCase();
    let used = true;
    if (code === 'KeyW' || k === 'z' || k === 'w' || code === 'ArrowUp') this.keys.fwd = down;
    else if (code === 'KeyS' || k === 's' || code === 'ArrowDown') this.keys.back = down;
    else if (code === 'KeyA' || k === 'q' || k === 'a' || code === 'ArrowLeft') this.keys.left = down;
    else if (code === 'KeyD' || k === 'd' || code === 'ArrowRight') this.keys.right = down;
    else used = false;
    if (used && down) e.preventDefault();
  }

  start(): void {
    window.addEventListener('resize', this.onResize);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('click', this.onCanvasClick);
    this.clock.start();
    this.loop();
  }

  requestLock(): void {
    if (!this.won && !this.disposed) this.controls.lock();
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.playing && !this.won) {
      this.elapsed += dt;
      const whole = Math.floor(this.elapsed);
      if (whole !== this.lastWholeSecond) {
        this.lastWholeSecond = whole;
        this.cb.onTime(whole);
      }
      if (!this.dialogueOpen) {
        this.updateMovement(dt);
        this.updatePrompt();
      }
    }

    this.composer.render();
  };

  private updateMovement(dt: number): void {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);

    const wish = new THREE.Vector3();
    if (this.keys.fwd) wish.add(forward);
    if (this.keys.back) wish.sub(forward);
    if (this.keys.right) wish.add(right);
    if (this.keys.left) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(MAX_SPEED);

    const t = 1 - Math.exp(-ACCEL_DAMP * dt);
    this.velocity.x += (wish.x - this.velocity.x) * t;
    this.velocity.z += (wish.z - this.velocity.z) * t;

    const pos = this.camera.position;
    pos.x += this.velocity.x * dt;
    pos.z += this.velocity.z * dt;

    this.resolveCollisions(pos);
    pos.x = THREE.MathUtils.clamp(pos.x, PLAYER_BOUNDS.minX, PLAYER_BOUNDS.maxX);
    pos.z = THREE.MathUtils.clamp(pos.z, PLAYER_BOUNDS.minZ, PLAYER_BOUNDS.maxZ);
    pos.y = EYE_HEIGHT;
  }

  private resolveCollisions(pos: THREE.Vector3): void {
    const r = PLAYER_RADIUS;
    for (const box of this.colliders) {
      const minX = box.min.x - r;
      const maxX = box.max.x + r;
      const minZ = box.min.z - r;
      const maxZ = box.max.z + r;
      if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
        const dxL = pos.x - minX;
        const dxR = maxX - pos.x;
        const dzD = pos.z - minZ;
        const dzU = maxZ - pos.z;
        const min = Math.min(dxL, dxR, dzD, dzU);
        if (min === dxL) {
          pos.x = minX;
          this.velocity.x = Math.min(0, this.velocity.x);
        } else if (min === dxR) {
          pos.x = maxX;
          this.velocity.x = Math.max(0, this.velocity.x);
        } else if (min === dzD) {
          pos.z = minZ;
          this.velocity.z = Math.min(0, this.velocity.z);
        } else {
          pos.z = maxZ;
          this.velocity.z = Math.max(0, this.velocity.z);
        }
      }
    }
  }

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('click', this.onCanvasClick);
    try {
      this.controls.unlock();
    } catch {
      /* ignore */
    }
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.composer.dispose();
    this.renderer.dispose();
  }
}
