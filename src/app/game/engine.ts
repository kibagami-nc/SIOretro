import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CHARACTERS, type Character } from '../characters';
import { buildCharacter } from './character-model';
import { buildClassroom, CEILING_LIGHTS, PLAYER_BOUNDS } from './classroom';
import { loadLayout } from './furniture';
import { makeNameSprite } from './textures';

export interface Dialogue {
  name: string;
  line: string;
  color: number;
}

/** État du combat contre Joey transmis au HUD. */
export interface CombatView {
  name: string;
  color: number;
  enemyHp: number;
  enemyMax: number;
  playerHp: number;
  playerMax: number;
  log: string;
}

export interface EngineCallbacks {
  onObjective: (text: string) => void;
  onProgress: (talked: number, total: number) => void;
  onPrompt: (text: string | null) => void;
  onDialogue: (d: Dialogue | null) => void;
  onTime: (seconds: number) => void;
  onWin: (seconds: number, title: string, sub: string) => void;
  onLockChange: (locked: boolean) => void;
  /** combat en cours (null = aucun) */
  onCombat: (c: CombatView | null) => void;
  /** la quête de sauvetage est active sur cette map */
  onQuest: (active: boolean) => void;
}

interface Interactable {
  pos: THREE.Vector3;
  range: number;
  id: string;
  name: string;
  line: string;
  color: number;
  /** id du personnage (pour repérer Yorann / Joey / Raphaël) */
  char?: string;
}

// ids des personnages de la quête (les noms affichés sont Yorann / Joey / Raphaël)
const HERO_ID = 'marius'; // Yorann
const VILLAIN_ID = 'brutus'; // Joey
const CAPTIVE_ID = 'raphael'; // Raphaël

const QUEST_LINES = {
  hero: 'Hé, toi ! Joey a encore enlevé Raphaël et l\'a planqué quelque part. '
    + 'Retrouve-les, affronte Joey et libère Raphaël — je compte sur toi !',
  villainTaunt: 'Ha ! Raphaël est à MOI. Personne ne viendra le chercher !',
  villainDefeated: 'Aïe... j\'abandonne ! C\'est bon, reprends Raphaël... pour cette fois.',
  captiveStuck: 'Au secours... Joey m\'a enfermé ! Bats-le d\'abord, je t\'en supplie...',
  captiveFreed: 'Mon héros ! Tu as mis une raclée à Joey et tu m\'as libéré. Merci infiniment !',
};

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

  private total = 0;
  private dialogueOpen = false;
  private pendingWin = false;
  private activePrompt: string | null = null;

  // --- quête de sauvetage (active si Yorann + Joey + Raphaël sont sur la map) ---
  private questActive = false;
  private hasQuest = false;
  private joeyDefeated = false;
  private raphaelFreed = false;
  private combat: CombatView | null = null;
  private winTitle = 'SOUTENANCE RÉUSSIE !';
  private winSub = 'Toute la classe a assuré 🎓';

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
    // La scène est statique (le joueur ne projette pas d'ombre, PNJ/meubles fixes) :
    // on ne calcule la shadow map qu'UNE fois au lieu de chaque frame -> gros gain.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
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

    // ambiant/hémisphère renforcés pour compenser la réduction des point lights
    this.scene.add(new THREE.AmbientLight(0x9aa0b4, 1.0));
    this.scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x40434d, 0.7));
    const sun = new THREE.DirectionalLight(0xfff1d0, 1.5);
    // même direction qu'avant, mais recentré et élargi pour couvrir tout le plan
    // (salles + couloir + serveur) : sinon les murs ne projettent pas d'ombre au loin.
    sun.position.set(24.5, 12, 2.25);
    sun.target.position.set(8.5, 0, -1.75);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 85;
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 25;
    sun.shadow.camera.bottom = -30;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.scene.add(sun.target);
    // 1 plafonnier sur 2 émet de la lumière (les autres restent des caissons
    // émissifs) : moitié moins de point lights à évaluer par fragment.
    CEILING_LIGHTS.forEach((p, i) => {
      if (i % 2 !== 0) return;
      const light = new THREE.PointLight(0xfff2d4, 0.6, 9, 2);
      light.position.copy(p);
      this.scene.add(light);
    });

    // PNJ : les alternants placés dans l'éditeur (objets « npc » de la map).
    // Si l'ancre désigne un personnage précis (catégorie choisie dans l'éditeur),
    // on l'incarne ; sinon on répartit les autres camarades par défaut.
    if (this.others.length > 0) {
      let fallbackIdx = 0;
      room.npcSpawns.forEach((anchor, i) => {
        const explicit = anchor.char ? CHARACTERS.find((c) => c.id === anchor.char) : undefined;
        // ne pas se dédoubler : si l'ancre désigne le joueur lui-même, on l'ignore
        if (explicit && explicit.id === this.character.id) return;
        const who = explicit ?? this.others[fallbackIdx++ % this.others.length];
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
          char: who.id,
        });
      });
    }
    this.total = this.interactables.length;

    // la quête démarre dès que Yorann est présent sur la map (il donne la mission)
    const present = new Set(this.interactables.map((it) => it.char));
    this.questActive = present.has(HERO_ID);
    this.cb.onQuest(this.questActive);

    this.camera.position.copy(room.spawn);
    this.camera.position.y = EYE_HEIGHT;
    const fx = -Math.sin(room.spawnRot);
    const fz = -Math.cos(room.spawnRot);
    this.camera.lookAt(room.spawn.x + fx, EYE_HEIGHT, room.spawn.z + fz);

    this.cb.onProgress(0, this.total);
    this.updateObjective();
  }

  // --------------------------------------------------------------- histoire

  private updateObjective(): void {
    if (this.questActive) {
      let text: string;
      if (!this.hasQuest) text = 'Parle à Yorann — il a besoin de ton aide.';
      else if (!this.joeyDefeated) text = '⚔️ Retrouve Joey, bats-le et libère Raphaël !';
      else if (!this.raphaelFreed) text = '🔓 Joey est K.O. ! Va libérer Raphaël.';
      else text = 'Raphaël est libre ! 🎉';
      this.cb.onObjective(text);
      return;
    }
    this.cb.onObjective('Explore librement la salle.');
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
    // pendant un combat, [E] = attaquer
    if (this.combat) {
      this.attack();
      return;
    }
    if (this.dialogueOpen) {
      this.closeDialogue();
      if (this.pendingWin) this.win();
      return;
    }
    const it = this.activeInteractable();
    if (!it) return;
    this.handleTalk(it);
  }

  /** Gère une interaction selon le personnage et l'avancement de la quête. */
  private handleTalk(it: Interactable): void {
    if (this.questActive) {
      if (it.char === HERO_ID) {
        this.hasQuest = true;
        this.openDialogue({ name: it.name, line: QUEST_LINES.hero, color: it.color });
        this.updateObjective();
        return;
      }
      if (it.char === VILLAIN_ID) {
        if (this.joeyDefeated) {
          this.openDialogue({ name: it.name, line: QUEST_LINES.villainDefeated, color: it.color });
        } else if (!this.hasQuest) {
          this.openDialogue({ name: it.name, line: QUEST_LINES.villainTaunt, color: it.color });
        } else {
          this.startCombat(it);
        }
        return;
      }
      if (it.char === CAPTIVE_ID) {
        if (!this.joeyDefeated) {
          this.openDialogue({ name: it.name, line: QUEST_LINES.captiveStuck, color: it.color });
        } else {
          this.raphaelFreed = true;
          this.openDialogue({ name: it.name, line: QUEST_LINES.captiveFreed, color: it.color });
          this.updateObjective();
          this.winTitle = 'RAPHAËL EST LIBÉRÉ !';
          this.winSub = 'Tu as vaincu Joey et sauvé Raphaël 🦸';
          this.pendingWin = true; // la victoire se déclenche à la fermeture du dialogue
        }
        return;
      }
    }
    // PNJ ordinaire : simple discussion (sans objectif)
    this.openDialogue({ name: it.name, line: it.line, color: it.color });
  }

  // --------------------------------------------------------------- combat

  private startCombat(it: Interactable): void {
    this.combat = {
      name: it.name,
      color: it.color,
      enemyHp: 100,
      enemyMax: 100,
      playerHp: 100,
      playerMax: 100,
      log: `Joey te barre la route ! Martèle [E] pour l'attaquer.`,
    };
    this.cb.onPrompt(null);
    this.cb.onCombat({ ...this.combat });
  }

  private attack(): void {
    const c = this.combat;
    if (!c) return;
    const dmg = 16 + Math.floor(Math.random() * 14); // 16-29
    c.enemyHp = Math.max(0, c.enemyHp - dmg);
    if (c.enemyHp === 0) {
      c.log = `Coup décisif ! Joey est K.O. (-${dmg})`;
      this.cb.onCombat({ ...c });
      this.endCombat();
      return;
    }
    // riposte de Joey (le joueur ne peut pas vraiment perdre : K.O. = on recommence)
    const back = 6 + Math.floor(Math.random() * 10); // 6-15
    c.playerHp = Math.max(0, c.playerHp - back);
    if (c.playerHp === 0) {
      c.playerHp = c.playerMax;
      c.enemyHp = c.enemyMax;
      c.log = `Joey t'a mis à terre ! Tu te relèves... le combat reprend.`;
    } else {
      c.log = `Tu frappes Joey (-${dmg}) · il riposte (-${back})`;
    }
    this.cb.onCombat({ ...c });
  }

  private endCombat(): void {
    this.joeyDefeated = true;
    this.combat = null;
    this.cb.onCombat(null);
    this.openDialogue({
      name: 'Joey',
      line: QUEST_LINES.villainDefeated,
      color: 0x4b5563,
    });
    this.updateObjective();
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
    const text = it ? this.promptFor(it) : null;
    if (text !== this.activePrompt) {
      this.activePrompt = text;
      this.cb.onPrompt(text);
    }
  }

  private promptFor(it: Interactable): string {
    if (this.questActive) {
      if (it.char === VILLAIN_ID && this.hasQuest && !this.joeyDefeated) {
        return '[E] ⚔️ Affronter Joey';
      }
      if (it.char === CAPTIVE_ID && this.joeyDefeated && !this.raphaelFreed) {
        return '[E] 🔓 Libérer Raphaël';
      }
    }
    return `[E] Parler à ${it.name}`;
  }

  private win(): void {
    this.won = true;
    this.closeDialogue();
    this.controls.unlock();
    this.cb.onWin(Math.floor(this.elapsed), this.winTitle, this.winSub);
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
      if (!this.dialogueOpen && !this.combat) {
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
    // Déplacement et résolution AXE PAR AXE : on bouge en X puis on corrige en X,
    // puis en Z puis on corrige en Z. Évite l'éjection « à travers » un mur
    // (téléportation) qui survenait avec la résolution par plus faible pénétration
    // aux coins et jonctions de murs.
    pos.x += this.velocity.x * dt;
    this.resolveAxis(pos, 'x');
    pos.z += this.velocity.z * dt;
    this.resolveAxis(pos, 'z');
    pos.x = THREE.MathUtils.clamp(pos.x, PLAYER_BOUNDS.minX, PLAYER_BOUNDS.maxX);
    pos.z = THREE.MathUtils.clamp(pos.z, PLAYER_BOUNDS.minZ, PLAYER_BOUNDS.maxZ);
    pos.y = EYE_HEIGHT;
  }

  /** Recule le joueur hors de chaque collider, uniquement sur l'axe donné,
   *  du côté d'où il arrive (selon le signe de sa vitesse). */
  private resolveAxis(pos: THREE.Vector3, axis: 'x' | 'z'): void {
    const r = PLAYER_RADIUS;
    for (const box of this.colliders) {
      const minX = box.min.x - r;
      const maxX = box.max.x + r;
      const minZ = box.min.z - r;
      const maxZ = box.max.z + r;
      if (pos.x <= minX || pos.x >= maxX || pos.z <= minZ || pos.z >= maxZ) continue;
      if (axis === 'x') {
        const v = this.velocity.x;
        if (v > 0) pos.x = minX;
        else if (v < 0) pos.x = maxX;
        else pos.x = pos.x - minX < maxX - pos.x ? minX : maxX;
        this.velocity.x = 0;
      } else {
        const v = this.velocity.z;
        if (v > 0) pos.z = minZ;
        else if (v < 0) pos.z = maxZ;
        else pos.z = pos.z - minZ < maxZ - pos.z ? minZ : maxZ;
        this.velocity.z = 0;
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
