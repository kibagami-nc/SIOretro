import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ADJACENT_DEPTH, buildClassroomShell, ROOM } from './classroom';
import {
  buildItem,
  clone,
  DEFAULT_LAYOUT,
  itemFootprintSize,
  itemWallRot,
  ItemType,
  loadLayout,
  MapItem,
  saveLayout,
} from './furniture';

export type Tool = ItemType | 'select';

export interface EditorCallbacks {
  onChange: (count: number, hasSelection: boolean) => void;
  onTool: (tool: Tool) => void;
}

const SNAP = 0.5;

interface Entry {
  item: MapItem;
  object: THREE.Group;
}

export class EditorEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;

  private itemsRoot = new THREE.Group();
  private entries: Entry[] = [];

  private tool: Tool = 'desk';
  private placeRot = 0;
  private ghost: THREE.Group | null = null;
  private ghostPos = new THREE.Vector3();
  private ghostValid = false;
  private lastHit: THREE.Vector3 | null = null;

  private selected = -1;
  private boxHelper?: THREE.BoxHelper;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private downX = 0;
  private downY = 0;
  private downBtn = 0;

  private rafId = 0;
  private disposed = false;

  private readonly onResize = () => this.resize();
  private readonly onPointerMove = (e: PointerEvent) => this.pointerMove(e);
  private readonly onPointerDown = (e: PointerEvent) => {
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.downBtn = e.button;
  };
  private readonly onPointerUp = (e: PointerEvent) => this.pointerUp(e);
  private readonly onKey = (e: KeyboardEvent) => this.key(e);

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: EditorCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x10131a);

    const midX = ADJACENT_DEPTH / 2; // centre des deux salles réunies
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 240);
    this.camera.position.set(midX, 22, 18);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(midX, 0.5, 0);
    this.controls.minDistance = 6;
    this.controls.maxDistance = 70;
    this.controls.maxPolarAngle = 1.45;

    // décor : coquille des 2 salles + grille
    this.scene.add(buildClassroomShell().group);
    this.scene.add(this.itemsRoot);
    const gridSize = ROOM.halfX * 2 + ADJACENT_DEPTH;
    const grid = new THREE.GridHelper(gridSize, Math.round(gridSize / SNAP), 0x3b4252, 0x2a2f3a);
    grid.position.set(midX, 0.02, 0);
    this.scene.add(grid);

    // lumières (sans ombres, pour la lisibilité)
    this.scene.add(new THREE.AmbientLight(0xcfd5e4, 1.0));
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x40434d, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(8, 16, 10);
    this.scene.add(dir);

    this.loadInto(loadLayout());
    this.setTool('desk');
    this.resize();
  }

  start(): void {
    window.addEventListener('resize', this.onResize);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKey);
    this.loop();
  }

  // --------------------------------------------------------------- map

  private loadInto(items: MapItem[]): void {
    this.deselect();
    for (const e of this.entries) this.disposeObject(e.object);
    this.entries.length = 0;
    this.itemsRoot.clear();
    for (const it of items) this.spawn({ ...it });
    this.notify();
  }

  private spawn(item: MapItem): Entry {
    const object = buildItem(item.type, this.entries.length);
    object.position.set(item.x, 0, item.z);
    object.rotation.y = item.rot;
    this.itemsRoot.add(object);
    const entry: Entry = { item, object };
    this.entries.push(entry);
    return entry;
  }

  getItems(): MapItem[] {
    return this.entries.map((e) => ({ ...e.item }));
  }

  save(): void {
    saveLayout(this.getItems());
  }

  /** Télécharge la map courante en JSON (pour l'intégrer comme map par défaut). */
  exportJson(): void {
    const data = JSON.stringify(this.getItems(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sioretro-map.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  resetDefault(): void {
    this.loadInto(clone(DEFAULT_LAYOUT));
  }

  clearAll(): void {
    this.loadInto([]);
  }

  // --------------------------------------------------------------- outils

  setTool(t: Tool): void {
    this.tool = t;
    this.cb.onTool(t);
    if (t === 'select') {
      this.removeGhost();
    } else {
      this.deselect();
      this.buildGhost(t);
    }
  }

  rotate(): void {
    if (this.selected >= 0) {
      const e = this.entries[this.selected];
      e.item.rot = (e.item.rot + Math.PI / 2) % (Math.PI * 2);
      e.object.rotation.y = e.item.rot;
      this.boxHelper?.update();
    } else {
      this.placeRot = (this.placeRot + Math.PI / 2) % (Math.PI * 2);
      this.refreshGhost();
    }
  }

  /** Recalcule la pose du fantôme (utile après un pivotement sans bouger la souris). */
  private refreshGhost(): void {
    const ghost = this.ghost;
    const tool = this.tool;
    if (!ghost || tool === 'select') return;
    if (this.lastHit) {
      const p = this.computePlacement(this.lastHit.x, this.lastHit.z, tool);
      ghost.position.set(p.x, 0, p.z);
      ghost.rotation.y = p.rot;
      this.ghostValid = p.valid;
      this.tintGhost(p.valid);
    } else {
      ghost.rotation.y = this.placeRot;
    }
  }

  removeSelected(): void {
    if (this.selected < 0) return;
    const e = this.entries[this.selected];
    this.itemsRoot.remove(e.object);
    this.disposeObject(e.object);
    this.entries.splice(this.selected, 1);
    this.deselect();
    this.notify();
  }

  // --------------------------------------------------------------- interaction

  private pointerMove(e: PointerEvent): void {
    this.updatePointer(e);
    const ghost = this.ghost;
    const tool = this.tool;
    if (tool === 'select' || !ghost) return;
    const hit = this.raycastGround();
    if (!hit) return;
    this.lastHit = hit.clone();
    const p = this.computePlacement(hit.x, hit.z, tool);
    ghost.position.set(p.x, 0, p.z);
    ghost.rotation.y = p.rot;
    this.ghostValid = p.valid;
    this.tintGhost(p.valid);
  }

  private pointerUp(e: PointerEvent): void {
    const moved = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
    if (this.downBtn !== 0 || moved > 6) return; // c'était un drag (orbite) ou clic droit
    this.updatePointer(e);
    const tool = this.tool;
    if (tool === 'select') {
      this.pickItem();
      return;
    }
    const hit = this.raycastGround();
    if (!hit) return;
    const p = this.computePlacement(hit.x, hit.z, tool);
    if (!p.valid) return;
    if (tool === 'spawn') this.removeByType('spawn'); // un seul point de spawn
    this.spawn({ type: tool, x: p.x, z: p.z, rot: p.rot });
    this.notify();
  }

  private removeByType(type: ItemType): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].item.type === type) {
        this.itemsRoot.remove(this.entries[i].object);
        this.disposeObject(this.entries[i].object);
        this.entries.splice(i, 1);
      }
    }
    this.deselect();
  }

  /** Calcule la pose : aimantation au mur si proche, sinon grille libre. */
  private computePlacement(
    hitX: number,
    hitZ: number,
    tool: ItemType,
  ): { x: number; z: number; rot: number; valid: boolean } {
    const wall = this.snapToWall(hitX, hitZ, tool);
    if (wall) return { ...wall, valid: true };
    const x = snap(hitX);
    const z = snap(hitZ);
    return { x, z, rot: this.placeRot, valid: this.inBounds(x, z) };
  }

  /**
   * Colle l'objet au mur le plus proche. L'orientation par défaut met le dos au
   * mur (écran au mur pour les bureaux) mais la rotation manuelle (R) est prise
   * en compte : on peut donc poser un objet « de côté » contre le mur, et le
   * décalage de collage s'adapte automatiquement.
   */
  private snapToWall(hitX: number, hitZ: number, tool: ItemType): { x: number; z: number; rot: number } | null {
    const HX = ROOM.halfX;
    const HZ = ROOM.halfZ;
    const FAR = HX + ADJACENT_DEPTH; // mur du fond de la salle voisine
    const fp = itemFootprintSize(tool);
    const hx = fp.w / 2;
    const hz = fp.d / 2;

    interface Wall {
      axis: 'x' | 'z';
      p: number;
      baseRot: number;
      inward: number;
      aMin: number;
      aMax: number;
    }
    const walls: Wall[] = [
      { axis: 'x', p: -HX, baseRot: -Math.PI / 2, inward: 1, aMin: -HZ, aMax: HZ }, // mur gauche
      { axis: 'x', p: FAR, baseRot: Math.PI / 2, inward: -1, aMin: -HZ, aMax: HZ }, // fond salle voisine
      {
        axis: 'x', // mur de séparation : côté selon la position du curseur
        p: HX,
        baseRot: hitX < HX ? Math.PI / 2 : -Math.PI / 2,
        inward: hitX < HX ? -1 : 1,
        aMin: -HZ,
        aMax: HZ,
      },
      { axis: 'z', p: -HZ, baseRot: Math.PI, inward: 1, aMin: -HX, aMax: FAR }, // mur avant
      { axis: 'z', p: HZ, baseRot: 0, inward: -1, aMin: -HX, aMax: FAR }, // mur arrière
    ];

    let best: Wall | null = null;
    let bestDist = 1.3;
    for (const w of walls) {
      const d = Math.abs((w.axis === 'x' ? hitX : hitZ) - w.p);
      if (d < bestDist) {
        bestDist = d;
        best = w;
      }
    }
    if (!best) return null;

    const rot = best.baseRot + itemWallRot(tool) + this.placeRot;
    const quarter = ((((Math.round(rot / (Math.PI / 2)) % 2) + 2) % 2) === 1);
    const wx = quarter ? hz : hx;
    const wz = quarter ? hx : hz;
    const clamp = THREE.MathUtils.clamp;

    if (best.axis === 'x') {
      return { x: best.p + best.inward * wx, z: clamp(snap(hitZ), best.aMin + wz, best.aMax - wz), rot };
    }
    return { x: clamp(snap(hitX), best.aMin + wx, best.aMax - wx), z: best.p + best.inward * wz, rot };
  }

  private key(e: KeyboardEvent): void {
    if (e.key === 'r' || e.key === 'R') {
      this.rotate();
    } else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'x' || e.key === 'X') {
      this.removeSelected();
    } else if (e.key === 'Escape') {
      this.deselect();
    } else if (this.selected >= 0 && e.key.startsWith('Arrow')) {
      const e0 = this.entries[this.selected];
      if (e.key === 'ArrowUp') e0.item.z -= SNAP;
      else if (e.key === 'ArrowDown') e0.item.z += SNAP;
      else if (e.key === 'ArrowLeft') e0.item.x -= SNAP;
      else if (e.key === 'ArrowRight') e0.item.x += SNAP;
      e0.item.x = THREE.MathUtils.clamp(e0.item.x, -ROOM.halfX + 0.6, ROOM.halfX + ADJACENT_DEPTH - 0.6);
      e0.item.z = THREE.MathUtils.clamp(e0.item.z, -ROOM.halfZ + 0.6, ROOM.halfZ - 0.6);
      e0.object.position.set(e0.item.x, 0, e0.item.z);
      this.boxHelper?.update();
      e.preventDefault();
    }
  }

  private pickItem(): void {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.itemsRoot.children, true);
    if (hits.length === 0) {
      this.deselect();
      return;
    }
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && obj.parent !== this.itemsRoot) obj = obj.parent;
    if (!obj) {
      this.deselect();
      return;
    }
    const idx = this.entries.findIndex((en) => en.object === obj);
    if (idx >= 0) this.select(idx);
  }

  private select(i: number): void {
    this.selected = i;
    if (this.boxHelper) this.scene.remove(this.boxHelper);
    this.boxHelper = new THREE.BoxHelper(this.entries[i].object, 0xffd54a);
    this.scene.add(this.boxHelper);
    this.notify();
  }

  private deselect(): void {
    this.selected = -1;
    if (this.boxHelper) {
      this.scene.remove(this.boxHelper);
      this.boxHelper.geometry.dispose();
      this.boxHelper = undefined;
    }
    this.notify();
  }

  private notify(): void {
    this.cb.onChange(this.entries.length, this.selected >= 0);
  }

  // --------------------------------------------------------------- ghost

  private buildGhost(type: ItemType): void {
    this.removeGhost();
    const g = buildItem(type, 999);
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mm of mats) {
        const sm = mm as THREE.MeshStandardMaterial;
        sm.transparent = true;
        sm.opacity = 0.55;
        sm.depthWrite = false;
      }
    });
    const fp = itemFootprintSize(type);
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(fp.w + 0.1, fp.d + 0.1),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.03;
    pad.name = 'pad';
    g.add(pad);
    g.rotation.y = this.placeRot;
    this.ghost = g;
    this.scene.add(g);
  }

  private tintGhost(valid: boolean): void {
    const pad = this.ghost?.getObjectByName('pad') as THREE.Mesh | undefined;
    if (pad) (pad.material as THREE.MeshBasicMaterial).color.setHex(valid ? 0x4ade80 : 0xef4444);
  }

  private removeGhost(): void {
    if (!this.ghost) return;
    this.disposeObject(this.ghost);
    this.scene.remove(this.ghost);
    this.ghost = null;
  }

  // --------------------------------------------------------------- utilitaires

  private updatePointer(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  private raycastGround(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const target = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, target);
  }

  private inBounds(x: number, z: number): boolean {
    // couvre la salle de classe ET la salle voisine
    return (
      x > -ROOM.halfX + 0.5 &&
      x < ROOM.halfX + ADJACENT_DEPTH - 0.5 &&
      z > -ROOM.halfZ + 0.5 &&
      z < ROOM.halfZ - 0.5
    );
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKey);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
  }
}

function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}
