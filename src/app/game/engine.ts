import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CHARACTERS, type Character, type PowerKind } from '../characters';
import { getBindings } from '../controls';
import { buildCharacter } from './character-model';
import { buildClassroom, CEILING_LIGHTS, PLAYER_BOUNDS } from './classroom';
import { loadLayout } from './furniture';
import { makeNameSprite } from './textures';
import {
  ARENA_BOUNDS,
  ARENA_HALF,
  ARENA_ORIGIN,
  buildArena,
  buildDonut,
  buildMiniRaphael,
  buildZombieRaphael,
  type ArenaScene,
} from './arena';

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
  /** combat d'arène temps réel (sinon ancien combat au tour par tour) */
  arena?: boolean;
  /** beignets en réserve (munitions du joueur) */
  ammo?: number;
}

/** État du pouvoir actif transmis au HUD. */
export interface PowerView {
  label: string;
  kind: PowerKind;
  /** prêt à l'emploi (recharge terminée / énergie suffisante) */
  ready: boolean;
  /** jauge 0..1 : avancement de recharge, ou énergie de sprint restante */
  gauge: number;
  /** effet en cours (bouclier actif / sprint en cours) */
  active: boolean;
  color: number;
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
  /** images par seconde mesurées (rafraîchi ~2×/s) */
  onFps: (fps: number) => void;
  /** fondu au noir plein écran (transitions vers/depuis l'arène) */
  onFade: (visible: boolean) => void;
  /** état du pouvoir actif (null = masqué) */
  onPower: (p: PowerView | null) => void;
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

/** Paramètres de chaque pouvoir actif (touche MAJ). */
const POWER_DEFS: Record<
  PowerKind,
  { label: string; cooldown: number; duration: number }
> = {
  dash: { label: 'DASH', cooldown: 2.2, duration: 0 },
  sprint: { label: 'SPRINT', cooldown: 0, duration: 0 },
  blink: { label: 'BLINK', cooldown: 4, duration: 0 },
  shield: { label: 'BOUCLIER', cooldown: 8, duration: 3 },
};
const DASH_IMPULSE = 12; // vitesse ajoutée d'un coup au dash
const BLINK_DIST = 5; // distance de téléportation du blink
const SPRINT_MULT = 1.8; // multiplicateur de vitesse en sprint
const SPRINT_DRAIN = 1 / 2.4; // jauge/s consommée en sprint (~2,4 s d'autonomie)
const SPRINT_REGEN = 1 / 3.5; // jauge/s régénérée hors sprint

/** Cadence cible : on bride le jeu à 30 images/s (1/30 s entre deux frames). */
const FRAME_INTERVAL = 1 / 30;

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
  private winTitle = 'MISSION ACCOMPLIE !';
  private winSub = 'Toute la classe a assuré 🎓';

  // --- arène de boss (combat temps réel contre Joey) ---
  private mode: 'explore' | 'arena' = 'explore';
  /** bornes de déplacement courantes (salle ou arène) */
  private bounds = PLAYER_BOUNDS;
  private arena?: ArenaScene;
  private readonly savedPos = new THREE.Vector3();
  private readonly savedQuat = new THREE.Quaternion();
  private aEnemyHp = 0;
  private aEnemyMax = 420;
  private aPlayerHp = 0;
  private aPlayerMax = 100;
  private aAmmo = 0;
  private aPhase = 0; // horloge interne de l'arène (bobbing des beignets, etc.)
  /** cible vers laquelle le 4x4 de Joey roule (coords locales à l'arène) */
  private readonly aJoeyTarget = new THREE.Vector3();
  /** true si la cible courante est le joueur (poursuite → un peu plus lent) */
  private aJoeyChasing = false;
  private aSpawnTimer = 0;
  private aLog = '';
  private aActive = false;
  /** étape de l'arène : apparition de Joey → combat → cinématique de victoire */
  private aStage: 'intro' | 'fight' | 'outro' = 'fight';
  private aStageT = 0;
  /** transition (fondu au noir) en cours : le jeu est figé */
  private transitioning = false;
  private transitionTimer?: ReturnType<typeof setTimeout>;
  // références au Joey de la salle de classe (pour le faire disparaître à sa défaite)
  private villainModel?: THREE.Object3D;
  private villainLabel?: THREE.Object3D;
  private villainCollider?: THREE.Box3;
  // saut du 4x4 (déclenché à partir de 50 % de dégâts)
  private aJumpY = 0;
  private aJumpVel = 0;
  private aJumpTimer = 0;
  // temps de recharge des dégâts de collision avec le 4x4
  private aTruckHitCd = 0;
  // zombies-Raphaël (déclenchés à partir de 80 % de dégâts)
  private aZombieTimer = 0;
  private aZombiesOn = false;
  private aRageAnnounced = false;
  // projectiles : mini-Raphaël lancés par Joey, beignets lancés par le joueur
  private miniProj: { obj: THREE.Group; vel: THREE.Vector3; life: number }[] = [];
  private donutProj: { obj: THREE.Group; vel: THREE.Vector3; life: number }[] = [];
  private zombies: { obj: THREE.Group; hitCd: number; bob: number }[] = [];

  private velocity = new THREE.Vector3();
  private keys = { fwd: false, back: false, left: false, right: false };

  // --- pouvoir actif du personnage (touche MAJ) ---
  /** vitesse de déplacement de base, modulée par la stat « vitesse » du perso */
  private baseSpeed = MAX_SPEED;
  private powerKind: PowerKind = 'dash';
  private powerCd = 0; // recharge restante (s)
  private powerActiveT = 0; // durée restante d'un effet actif (bouclier)
  private sprintEnergy = 1; // jauge de sprint 0..1
  private sprinting = false; // touche MAJ maintenue (sprint)
  private readonly tmpDash = new THREE.Vector3();

  // vecteurs de travail réutilisés chaque frame (évite des allocations dans la
  // boucle de rendu, donc moins de passages du GC → moins de micro-saccades).
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpWish = new THREE.Vector3();

  private clock = new THREE.Clock();
  // accumulateur de cadence (bridage 30 fps) : on REPORTE le reste plutôt que de
  // le remettre à 0, sinon on jette ~1/2 frame à chaque rendu et la moyenne
  // tombe sous la cible (≈27 au lieu de 30 sur un écran 60 Hz).
  private frameAcc = 0;
  // temps réel accumulé depuis la dernière frame traitée (sert de dt)
  private simAcc = 0;
  // mesure du FPS (fenêtre glissante ~0.5 s)
  private fpsFrames = 0;
  private fpsLast = 0;
  private elapsed = 0;
  private lastWholeSecond = -1;
  private playing = false;
  private won = false;
  private rafId = 0;
  private disposed = false;
  // quand le jeu n'est pas en cours (intro / pause / victoire), la scène est
  // figée : on ne la redessine qu'une fois après un changement d'état au lieu
  // de la rendre 60×/s pour rien (GPU au repos sur les menus).
  private dirty = true;

  private readonly onResize = () => this.resize();
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (this.isInteractKey(e)) {
      e.preventDefault();
      this.onInteract();
      return;
    }
    if (this.isPowerKey(e)) {
      e.preventDefault();
      if (!e.repeat) this.powerDown();
      return;
    }
    this.setKey(e, true);
  };
  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (this.isInteractKey(e)) return;
    if (this.isPowerKey(e)) {
      this.powerUp();
      return;
    }
    this.setKey(e, false);
  };
  private readonly onCanvasClick = () => {
    if (!this.won && !this.disposed) this.controls.lock();
  };
  private readonly onMouseDown = (e: MouseEvent) => {
    // clic gauche pendant le combat d'arène = lancer un beignet
    if (e.button !== 0) return;
    if (this.playing && this.mode === 'arena') this.throwDonut();
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private character: Character,
    private others: Character[],
    private cb: EngineCallbacks,
  ) {
    this.total = others.length;

    // pouvoir actif + vitesse de base dérivée de la stat « vitesse » (45→100 :
    // ×0.9 à ×1.25), pour que chaque perso se déplace à un rythme distinct.
    this.powerKind = this.character.power ?? 'dash';
    this.baseSpeed = MAX_SPEED * (0.9 + (this.character.stats.vitesse / 100) * 0.35);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    // PCF simple (et non PCFSoft) : le rendu est pixelisé en 1/4 de résolution,
    // le filtrage doux est invisible à cette échelle mais coûte plus cher.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
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
      this.dirty = true;
      this.cb.onLockChange(true);
    });
    this.controls.addEventListener('unlock', () => {
      this.playing = false;
      this.sprinting = false; // on relâche le sprint quand on perd le focus
      this.dirty = true;
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
    // 2048² suffit largement vu la pixelisation : 4× moins de mémoire/bande
    // passante que 4096², shadow map calculée une seule fois (autoUpdate off).
    sun.shadow.mapSize.set(2048, 2048);
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
        const collider = new THREE.Box3(
          new THREE.Vector3(anchor.pos.x - 0.35, 0, anchor.pos.z - 0.35),
          new THREE.Vector3(anchor.pos.x + 0.35, 1.8, anchor.pos.z + 0.35),
        );
        this.colliders.push(collider);
        // on retient le Joey de la salle pour pouvoir le faire disparaître après sa défaite
        if (who.id === VILLAIN_ID) {
          this.villainModel = model;
          this.villainLabel = label;
          this.villainCollider = collider;
        }
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
    if (!this.playing || this.won || this.transitioning) return;
    // dans l'arène, [E] = lancer un beignet sur Joey
    if (this.mode === 'arena') {
      this.throwDonut();
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
          this.startArena(it);
        }
        return;
      }
      if (it.char === CAPTIVE_ID) {
        if (!this.joeyDefeated) {
          this.openDialogue({ name: it.name, line: QUEST_LINES.captiveStuck, color: it.color });
        } else {
          // libérer Raphaël ne renvoie PAS au menu : on continue à explorer librement
          this.raphaelFreed = true;
          this.openDialogue({ name: it.name, line: QUEST_LINES.captiveFreed, color: it.color });
          this.updateObjective();
        }
        return;
      }
    }
    // PNJ ordinaire : simple discussion (sans objectif)
    this.openDialogue({ name: it.name, line: it.line, color: it.color });
  }

  // ----------------------------------------------------------- arène de boss

  /** Déclenche la transition (fondu au noir) puis l'entrée dans l'arène. */
  private startArena(it: Interactable): void {
    void it;
    this.transitioning = true;
    this.cb.onPrompt(null);
    // mémorise la position courante pour y revenir après le combat
    this.savedPos.copy(this.camera.position);
    this.savedQuat.copy(this.camera.quaternion);
    this.cb.onFade(true);
    clearTimeout(this.transitionTimer);
    this.transitionTimer = setTimeout(() => this.enterArena(), 420);
  }

  /** Configure l'arène derrière le fondu, puis révèle la scène (Joey se matérialise). */
  private enterArena(): void {
    if (this.disposed) return;
    if (!this.arena) {
      const villain = CHARACTERS.find((c) => c.id === VILLAIN_ID) ?? this.character;
      const captive = CHARACTERS.find((c) => c.id === CAPTIVE_ID) ?? this.character;
      this.arena = buildArena(villain, captive);
      this.scene.add(this.arena.group);
    }
    this.arena.group.visible = true;
    // tous les beignets réapparaissent
    for (const d of this.arena.donuts) {
      d.present = true;
      d.respawn = 0;
      d.mesh.visible = true;
      d.mesh.position.copy(d.home);
    }
    this.clearProjectiles();

    // état de combat
    this.aEnemyHp = this.aEnemyMax;
    this.aPlayerHp = this.aPlayerMax;
    this.aAmmo = 0;
    this.aPhase = 0;
    this.arena.rig.position.set(0, 0, -ARENA_HALF + 2.5);
    this.arena.rig.rotation.set(0, 0, 0);
    this.arena.rig.scale.setScalar(0.001); // Joey apparaît en grandissant
    this.pickJoeyTarget();
    this.aSpawnTimer = 1.2;
    this.aJumpY = 0;
    this.aJumpVel = 0;
    this.aJumpTimer = 2.5;
    this.aTruckHitCd = 0;
    this.aZombieTimer = 0;
    this.aZombiesOn = false;
    this.aRageAnnounced = false;
    this.aStage = 'intro';
    this.aStageT = 0;
    this.aLog = 'Joey surgit dans l\'arène... 🌀';
    // pouvoir prêt à l'entrée dans l'arène
    this.powerCd = 0;
    this.powerActiveT = 0;
    this.sprintEnergy = 1;
    this.sprinting = false;

    // téléporte la caméra à l'entrée de l'arène, face à Joey
    this.camera.position.set(ARENA_ORIGIN.x, EYE_HEIGHT, ARENA_ORIGIN.z + 7);
    this.camera.lookAt(ARENA_ORIGIN.x, EYE_HEIGHT, ARENA_ORIGIN.z - 7);
    this.velocity.set(0, 0, 0);

    this.mode = 'arena';
    this.aActive = true;
    this.bounds = ARENA_BOUNDS;
    this.transitioning = false;
    this.cb.onFade(false); // on dévoile l'arène : Joey se matérialise
    this.emitArena();
  }

  private emitArena(): void {
    this.cb.onCombat({
      name: 'Joey',
      color: 0x4b5563,
      enemyHp: this.aEnemyHp,
      enemyMax: this.aEnemyMax,
      playerHp: this.aPlayerHp,
      playerMax: this.aPlayerMax,
      log: this.aLog,
      arena: true,
      ammo: this.aAmmo,
    });
  }

  /** Lance un beignet depuis la caméra vers l'avant (si on en a en réserve). */
  private throwDonut(): void {
    if (this.aStage !== 'fight' || this.aAmmo <= 0 || !this.arena) return;
    this.aAmmo--;
    const proj = buildDonut();
    const dir = this.tmpForward;
    this.camera.getWorldDirection(dir);
    proj.position.copy(this.camera.position);
    proj.position.y = EYE_HEIGHT - 0.2;
    this.arena.group.worldToLocal(proj.position);
    this.arena.group.add(proj);
    const vel = new THREE.Vector3(dir.x, dir.y + 0.12, dir.z).normalize().multiplyScalar(17);
    this.donutProj.push({ obj: proj, vel, life: 1.6 });
    this.aLog = 'Beignet lancé ! 🍩💥';
    this.emitArena();
  }

  /** Choisit un nouveau point de destination pour le 4x4.
   *  Il poursuit le joueur « un peu » (≈60 % du temps il vise sa position,
   *  sinon il file vers un point au hasard pour ne pas être trop prévisible). */
  private pickJoeyTarget(): void {
    const reach = ARENA_HALF - 2.5; // marge pour que le 4x4 reste dans l'arène
    if (this.arena && Math.random() < 0.6) {
      // vise la position du joueur (en coords locales à l'arène) + petit écart
      const local = this.camera.position.clone();
      this.arena.group.worldToLocal(local);
      this.aJoeyTarget.set(
        THREE.MathUtils.clamp(local.x + (Math.random() * 2 - 1) * 1.5, -reach, reach),
        0,
        THREE.MathUtils.clamp(local.z + (Math.random() * 2 - 1) * 1.5, -reach, reach),
      );
      this.aJoeyChasing = true;
      return;
    }
    this.aJoeyTarget.set(
      (Math.random() * 2 - 1) * reach,
      0,
      (Math.random() * 2 - 1) * reach,
    );
    this.aJoeyChasing = false;
  }

  /** Fait apparaître un Raphaël zombie sur un bord de l'arène. */
  private spawnZombie(): void {
    if (!this.arena || this.zombies.length >= 6) return;
    const captive = CHARACTERS.find((c) => c.id === CAPTIVE_ID) ?? this.character;
    const z = buildZombieRaphael(captive);
    // apparition sur un bord aléatoire de l'arène (coords locales)
    const edge = ARENA_HALF - 1;
    const side = Math.floor(Math.random() * 4);
    const r = (Math.random() * 2 - 1) * edge;
    if (side === 0) z.position.set(r, 0, -edge);
    else if (side === 1) z.position.set(r, 0, edge);
    else if (side === 2) z.position.set(-edge, 0, r);
    else z.position.set(edge, 0, r);
    this.arena.group.add(z);
    this.zombies.push({ obj: z, hitCd: 0, bob: Math.random() * Math.PI * 2 });
  }

  /** Les zombies marchent vers le joueur et le mordent au contact. */
  private updateZombies(dt: number): void {
    if (!this.arena) return;
    // apparition régulière, plafonnée
    this.aZombieTimer -= dt;
    if (this.aZombieTimer <= 0) {
      this.spawnZombie();
      this.aZombieTimer = 2.4;
    }
    const player = this.camera.position;
    for (const zb of this.zombies) {
      const wp = new THREE.Vector3();
      zb.obj.getWorldPosition(wp);
      const dx = player.x - wp.x;
      const dz = player.z - wp.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.001) {
        const step = 1.7 * dt; // démarche lente de zombie
        zb.obj.position.x += (dx / dist) * step;
        zb.obj.position.z += (dz / dist) * step;
        zb.obj.rotation.y = Math.atan2(dx, dz);
      }
      // dandinement
      zb.bob += dt * 6;
      zb.obj.rotation.z = Math.sin(zb.bob) * 0.12;
      // morsure au contact (avec temps de recharge)
      zb.hitCd -= dt;
      if (dist < 0.9 && zb.hitCd <= 0) {
        zb.hitCd = 1;
        this.hurtPlayer(
          6,
          'Un Raphaël zombie te mord ! (-6)',
          'Les zombies t\'ont submergé ! Tu te relèves — vise Joey, vite !',
        );
        this.emitArena();
      }
    }
  }

  private clearZombies(): void {
    for (const zb of this.zombies) {
      zb.obj.parent?.remove(zb.obj);
      this.disposeObject(zb.obj);
    }
    this.zombies = [];
  }

  /** Joey lance un mini-Raphaël en direction du joueur. */
  private spawnMini(): void {
    if (!this.arena) return;
    const captive = CHARACTERS.find((c) => c.id === CAPTIVE_ID) ?? this.character;
    const mini = buildMiniRaphael(captive);
    // position de départ : devant le 4x4
    const start = new THREE.Vector3();
    this.arena.rig.getWorldPosition(start);
    start.y = 1.2;
    this.arena.group.worldToLocal(start);
    mini.position.copy(start);
    this.arena.group.add(mini);
    // direction vers le joueur (en coordonnées monde)
    const target = this.camera.position.clone();
    this.arena.group.worldToLocal(target);
    const dir = target.sub(start);
    dir.y = 0;
    dir.normalize();
    const vel = new THREE.Vector3(dir.x, 0.35, dir.z).normalize().multiplyScalar(7);
    this.miniProj.push({ obj: mini, vel, life: 4 });
  }

  private updateArena(dt: number): void {
    const a = this.arena;
    if (!a || !this.aActive) return;

    // --- apparition de Joey : son 4x4 grossit d'un coup (effet de pop) ---
    if (this.aStage === 'intro') {
      this.aStageT += dt;
      const dur = 1.0;
      const p = Math.min(1, this.aStageT / dur);
      a.rig.scale.setScalar(easeOutBack(p));
      a.rig.rotation.y = (1 - p) * Math.PI * 2; // petite vrille à l'arrivée
      if (p >= 1) {
        a.rig.scale.setScalar(1);
        a.rig.rotation.y = 0;
        this.aStage = 'fight';
        this.aLog = 'Ramasse les beignets 🍩 et lance-les sur Joey avec [clic] / [E] !';
        this.emitArena();
      }
      return;
    }

    // --- cinématique de victoire : le 4x4 tournoie, s'élève et se volatilise ---
    if (this.aStage === 'outro') {
      this.aStageT += dt;
      const dur = 1.8;
      const p = Math.min(1, this.aStageT / dur);
      a.rig.rotation.y += dt * 9;
      a.rig.position.y = this.aJumpY + p * 2.2;
      a.rig.scale.setScalar(Math.max(0.001, 1 - p));
      if (p >= 1 && !this.transitioning) this.finishVictory();
      return;
    }

    // --- phases de rage selon la vie restante de Joey ---
    const hpFrac = this.aEnemyHp / this.aEnemyMax;
    const enraged = hpFrac <= 0.5; // > 50 % de dégâts : plus rapide + sauts
    const finalRage = hpFrac <= 0.5; // > 50 % de dégâts : zombies-Raphaël aussi

    if (enraged && !this.aRageAnnounced) {
      this.aRageAnnounced = true;
      this.aLog = 'Joey enrage ! Son 4x4 fonce et se met à SAUTER ! 🚙💨';
      this.emitArena();
    }

    // --- le 4x4 roule vers une cible et en choisit une nouvelle en arrivant :
    //     Joey sillonne ainsi toute l'arène (et accélère quand il a mal) ---
    this.aPhase += dt;
    const rig = a.rig;
    const tx = this.aJoeyTarget.x - rig.position.x;
    const tz = this.aJoeyTarget.z - rig.position.z;
    const tdist = Math.hypot(tx, tz);
    if (tdist < 0.6) {
      this.pickJoeyTarget();
    } else {
      // vitesse : tranquille au début, plus vif sous 50 % de vie (mais pas excessif)
      let baseSpeed = enraged ? 5.5 : 2.8 + (1 - hpFrac) * 1.6;
      // quand il te poursuit, il roule un peu moins vite (plus facile à éviter)
      if (this.aJoeyChasing) baseSpeed *= 0.7;
      const move = Math.min(baseSpeed * dt, tdist);
      rig.position.x += (tx / tdist) * move;
      rig.position.z += (tz / tdist) * move;
      // le 4x4 s'oriente dans son sens de marche
      rig.rotation.y = Math.atan2(tx, tz);
    }

    // --- saut du 4x4 (uniquement en mode enragé) ---
    if (enraged) {
      this.aJumpTimer -= dt;
      if (this.aJumpY <= 0 && this.aJumpTimer <= 0) {
        this.aJumpVel = 6.5; // impulsion
        this.aJumpTimer = 1.4 + Math.random() * 1.2;
      }
    }
    if (this.aJumpVel !== 0 || this.aJumpY > 0) {
      this.aJumpVel -= 16 * dt; // gravité du 4x4
      this.aJumpY += this.aJumpVel * dt;
      if (this.aJumpY <= 0) {
        this.aJumpY = 0;
        this.aJumpVel = 0;
      }
    }
    rig.position.y = this.aJumpY;
    // petit tangage pendant le saut pour l'effet « cascade »
    rig.rotation.x = -this.aJumpVel * 0.04;

    // --- collision avec le 4x4 : se faire renverser fait perdre de la vie ---
    this.aTruckHitCd -= dt;
    const truckWorld = new THREE.Vector3();
    rig.getWorldPosition(truckWorld);
    const ddx = this.camera.position.x - truckWorld.x;
    const ddz = this.camera.position.z - truckWorld.z;
    // le 4x4 ne renverse pas le joueur s'il est en plein saut au-dessus de lui
    if (this.aJumpY < 0.8 && Math.hypot(ddx, ddz) < 1.9 && this.aTruckHitCd <= 0) {
      this.aTruckHitCd = 0.8;
      this.hurtPlayer(
        14,
        'Le 4x4 de Joey te percute ! (-14) 🚙💥',
        'Écrasé par le 4x4 ! Tu te relèves — reste mobile et vise Joey !',
      );
      // petite poussée pour te dégager du véhicule (même bouclier actif)
      const d = Math.hypot(ddx, ddz) || 1;
      this.camera.position.x += (ddx / d) * 1.2;
      this.camera.position.z += (ddz / d) * 1.2;
      this.emitArena();
    }

    // --- déclenchement des zombies-Raphaël sous 20 % de vie ---
    if (finalRage && !this.aZombiesOn) {
      this.aZombiesOn = true;
      this.aZombieTimer = 0;
      this.aLog = '☠️ Joey libère des Raphaël ZOMBIES ! Évite-les et achève-le !';
      this.emitArena();
    }
    if (this.aZombiesOn) this.updateZombies(dt);

    // --- Joey lance des mini-Raphaël de plus en plus vite quand il a mal ---
    const rage = 1 - this.aEnemyHp / this.aEnemyMax; // 0 → 1
    const interval = 1.8 - rage * 1.0; // de 1.8 s à 0.8 s
    this.aSpawnTimer -= dt;
    if (this.aSpawnTimer <= 0) {
      this.spawnMini();
      this.aSpawnTimer = interval;
    }

    // --- ramassage des beignets ---
    for (const d of a.donuts) {
      if (d.present) {
        d.mesh.rotation.y += dt * 2;
        d.mesh.position.y = d.home.y + Math.sin(this.aPhase * 3 + d.home.x) * 0.08;
        const wp = d.home.clone().add(ARENA_ORIGIN);
        const dx = wp.x - this.camera.position.x;
        const dz = wp.z - this.camera.position.z;
        if (Math.hypot(dx, dz) < 1.2) {
          d.present = false;
          d.mesh.visible = false;
          d.respawn = 5;
          this.aAmmo++;
          this.aLog = `Beignet ramassé ! Réserve : ${this.aAmmo} 🍩`;
          this.emitArena();
        }
      } else {
        d.respawn -= dt;
        if (d.respawn <= 0) {
          d.present = true;
          d.mesh.visible = true;
          d.mesh.position.copy(d.home);
        }
      }
    }

    // --- projectiles mini-Raphaël (touchent le joueur) ---
    const playerWorld = this.camera.position;
    for (let i = this.miniProj.length - 1; i >= 0; i--) {
      const p = this.miniProj[i];
      p.vel.y -= 9.8 * dt * 0.25; // légère gravité
      p.obj.position.addScaledVector(p.vel, dt);
      p.obj.rotation.y += dt * 6;
      p.life -= dt;
      const wp = new THREE.Vector3();
      p.obj.getWorldPosition(wp);
      const hit = Math.hypot(wp.x - playerWorld.x, wp.z - playerWorld.z) < 0.8 && wp.y < EYE_HEIGHT + 0.3;
      if (hit) {
        this.hurtPlayer(
          9,
          `Aïe ! Un mini-Raphaël t'a touché (-9)`,
          `Tu es sonné ! Mais tu te ressaisis — continue à viser Joey !`,
        );
        this.removeProj(this.miniProj, i);
        this.emitArena();
        continue;
      }
      if (p.life <= 0 || wp.y < -0.5) this.removeProj(this.miniProj, i);
    }

    // --- projectiles beignets (touchent Joey) ---
    const joeyWorld = new THREE.Vector3();
    a.rig.getWorldPosition(joeyWorld);
    joeyWorld.y = 1.4;
    for (let i = this.donutProj.length - 1; i >= 0; i--) {
      const p = this.donutProj[i];
      p.vel.y -= 9.8 * dt * 0.55;
      p.obj.position.addScaledVector(p.vel, dt);
      p.obj.rotation.x += dt * 10;
      p.life -= dt;
      const wp = new THREE.Vector3();
      p.obj.getWorldPosition(wp);
      // un beignet peut aussi pulvériser un zombie sur sa trajectoire
      let zombieHit = false;
      for (let zi = this.zombies.length - 1; zi >= 0; zi--) {
        const zwp = new THREE.Vector3();
        this.zombies[zi].obj.getWorldPosition(zwp);
        zwp.y = 0.7;
        if (wp.distanceTo(zwp) < 1.0) {
          const zb = this.zombies[zi];
          zb.obj.parent?.remove(zb.obj);
          this.disposeObject(zb.obj);
          this.zombies.splice(zi, 1);
          zombieHit = true;
          break;
        }
      }
      if (zombieHit) {
        this.aLog = 'Splatch ! Un zombie pulvérisé 🍩';
        this.removeProj(this.donutProj, i);
        this.emitArena();
        continue;
      }
      const hit = wp.distanceTo(joeyWorld) < 1.6;
      if (hit) {
        this.aEnemyHp = Math.max(0, this.aEnemyHp - 18);
        this.aLog = `Touché ! Joey en pleine poire (-18)`;
        this.removeProj(this.donutProj, i);
        this.emitArena();
        if (this.aEnemyHp === 0) {
          this.beginVictory();
          return;
        }
        continue;
      }
      if (p.life <= 0 || wp.y < -0.5) this.removeProj(this.donutProj, i);
    }
  }

  private removeProj(
    list: { obj: THREE.Group; vel: THREE.Vector3; life: number }[],
    index: number,
  ): void {
    const p = list[index];
    p.obj.parent?.remove(p.obj);
    this.disposeObject(p.obj);
    list.splice(index, 1);
  }

  private clearProjectiles(): void {
    for (const p of this.miniProj) {
      p.obj.parent?.remove(p.obj);
      this.disposeObject(p.obj);
    }
    for (const p of this.donutProj) {
      p.obj.parent?.remove(p.obj);
      this.disposeObject(p.obj);
    }
    this.miniProj = [];
    this.donutProj = [];
    this.clearZombies();
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

  /** Joey est vaincu : démarre la cinématique (4x4 qui tournoie et se volatilise). */
  private beginVictory(): void {
    this.aStage = 'outro';
    this.aStageT = 0;
    this.clearProjectiles(); // retire mini-Raphaël, beignets et zombies
    this.aLog = 'Joey est K.O. ! Son 4x4 part en vrille... 💨';
    this.emitArena();
  }

  /** Après la cinématique : fondu, retour dans la salle, Joey disparaît de la map. */
  private finishVictory(): void {
    this.transitioning = true;
    this.cb.onFade(true);
    clearTimeout(this.transitionTimer);
    this.transitionTimer = setTimeout(() => {
      if (this.disposed) return;
      this.joeyDefeated = true;
      this.aActive = false;
      this.aStage = 'fight';
      this.mode = 'explore';
      this.bounds = PLAYER_BOUNDS;
      if (this.arena) {
        this.arena.rig.rotation.set(0, 0, 0);
        this.arena.rig.position.set(0, 0, -ARENA_HALF + 2.5);
        this.arena.rig.scale.setScalar(1);
        this.arena.group.visible = false;
      }
      // Joey vaincu disparaît de la salle de classe
      this.removeVillainFromMap();

      // restaure la position d'origine du joueur
      this.camera.position.copy(this.savedPos);
      this.camera.quaternion.copy(this.savedQuat);
      this.velocity.set(0, 0, 0);

      this.cb.onCombat(null);
      this.transitioning = false;
      this.cb.onFade(false);
      this.updateObjective();
      this.openDialogue({
        name: 'Joey',
        line: QUEST_LINES.villainDefeated,
        color: 0x4b5563,
      });
    }, 420);
  }

  /** Retire le Joey de la salle (modèle, étiquette, collider, interaction). */
  private removeVillainFromMap(): void {
    if (this.villainModel) {
      this.scene.remove(this.villainModel);
      this.disposeObject(this.villainModel);
      this.villainModel = undefined;
    }
    if (this.villainLabel) {
      this.scene.remove(this.villainLabel);
      this.disposeObject(this.villainLabel);
      this.villainLabel = undefined;
    }
    if (this.villainCollider) {
      const i = this.colliders.indexOf(this.villainCollider);
      if (i >= 0) this.colliders.splice(i, 1);
      this.villainCollider = undefined;
    }
    const idx = this.interactables.findIndex((it) => it.char === VILLAIN_ID);
    if (idx >= 0) this.interactables.splice(idx, 1);
  }

  private activeInteractable(): Interactable | null {
    const p = this.camera.position;
    const forward = this.tmpForward;
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
    return e.code === getBindings().action || e.code === 'Enter';
  }

  private setKey(e: KeyboardEvent, down: boolean): void {
    const code = e.code;
    const b = getBindings();
    let used = true;
    if (code === b.fwd || code === 'ArrowUp') this.keys.fwd = down;
    else if (code === b.back || code === 'ArrowDown') this.keys.back = down;
    else if (code === b.left || code === 'ArrowLeft') this.keys.left = down;
    else if (code === b.right || code === 'ArrowRight') this.keys.right = down;
    else used = false;
    if (used && down) e.preventDefault();
  }

  start(): void {
    window.addEventListener('resize', this.onResize);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('click', this.onCanvasClick);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.clock.start();
    this.fpsLast = performance.now();
    this.loop();
  }

  requestLock(): void {
    if (!this.won && !this.disposed) this.controls.lock();
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);

    // Bridage 30 fps : on accumule le temps réel et on ne traite/rend une frame
    // que lorsqu'au moins 1/30 s s'est écoulé (sur 60/120/144 Hz, on saute donc
    // les frames intermédiaires).
    const delta = this.clock.getDelta();
    this.frameAcc += delta;
    this.simAcc += delta;
    if (this.frameAcc < FRAME_INTERVAL) return;
    // dt = temps réel écoulé depuis la dernière frame traitée (mouvement/chrono justes)
    const dt = Math.min(this.simAcc, 0.05);
    this.simAcc = 0;
    // report du reste pour que la cadence moyenne soit pile 30 fps ; on borne
    // le retard accumulé (ex. onglet en arrière-plan) pour éviter un rattrapage brutal.
    this.frameAcc -= FRAME_INTERVAL;
    if (this.frameAcc > FRAME_INTERVAL) this.frameAcc = 0;

    // mesure FPS sur la cadence réelle des frames traitées (≈ frames rendues)
    this.fpsFrames++;
    const nowMs = performance.now();
    const span = nowMs - this.fpsLast;
    if (span >= 500) {
      this.cb.onFps(Math.round((this.fpsFrames * 1000) / span));
      this.fpsFrames = 0;
      this.fpsLast = nowMs;
    }

    if (this.playing && !this.won) {
      this.elapsed += dt;
      const whole = Math.floor(this.elapsed);
      if (whole !== this.lastWholeSecond) {
        this.lastWholeSecond = whole;
        this.cb.onTime(whole);
      }
      if (this.transitioning) {
        // pendant un fondu (entrée/sortie d'arène) le jeu est figé
      } else if (this.mode === 'arena') {
        // arène : on bouge librement (pour ramasser les beignets) et on simule le boss
        if (this.aStage === 'fight') {
          this.updateMovement(dt);
          this.updatePower(dt);
        }
        this.updateArena(dt);
      } else if (!this.dialogueOpen) {
        this.updateMovement(dt);
        this.updatePower(dt);
        this.updatePrompt();
      }
    }

    // en jeu : on rend chaque frame (la caméra suit la souris) ; sinon scène
    // figée → un seul rendu après le dernier changement d'état.
    if (this.playing || this.dirty) {
      this.composer.render();
      this.dirty = false;
    }
  };

  private updateMovement(dt: number): void {
    const forward = this.tmpForward;
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = this.tmpRight.set(-forward.z, 0, forward.x);

    const wish = this.tmpWish.set(0, 0, 0);
    if (this.keys.fwd) wish.add(forward);
    if (this.keys.back) wish.sub(forward);
    if (this.keys.right) wish.add(right);
    if (this.keys.left) wish.sub(right);
    // vitesse de base du perso, multipliée pendant un sprint actif
    let speed = this.baseSpeed;
    if (this.powerKind === 'sprint' && this.sprinting && this.sprintEnergy > 0) {
      speed *= SPRINT_MULT;
    }
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

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
    pos.x = THREE.MathUtils.clamp(pos.x, this.bounds.minX, this.bounds.maxX);
    pos.z = THREE.MathUtils.clamp(pos.z, this.bounds.minZ, this.bounds.maxZ);
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

  // --------------------------------------------------------- pouvoir actif

  private isPowerKey(e: KeyboardEvent): boolean {
    return e.code === 'ShiftLeft' || e.code === 'ShiftRight';
  }

  /** MAJ enfoncée : déclenche le pouvoir (ou démarre le sprint). */
  private powerDown(): void {
    if (!this.playing || this.won || this.transitioning || this.dialogueOpen) return;
    // en arène, le pouvoir n'est dispo que pendant la phase de combat
    if (this.mode === 'arena' && this.aStage !== 'fight') return;

    if (this.powerKind === 'sprint') {
      this.sprinting = true;
      return;
    }
    if (this.powerCd > 0) return; // encore en recharge
    const def = POWER_DEFS[this.powerKind];
    switch (this.powerKind) {
      case 'dash': {
        const f = this.tmpDash;
        this.camera.getWorldDirection(f);
        f.y = 0;
        f.normalize();
        this.velocity.addScaledVector(f, DASH_IMPULSE);
        break;
      }
      case 'blink':
        this.blinkForward(BLINK_DIST);
        break;
      case 'shield':
        this.powerActiveT = def.duration;
        break;
    }
    this.powerCd = def.cooldown;
  }

  /** MAJ relâchée : stoppe le sprint. */
  private powerUp(): void {
    if (this.powerKind === 'sprint') this.sprinting = false;
  }

  /** Téléporte le joueur vers l'avant en s'arrêtant avant tout obstacle. */
  private blinkForward(dist: number): void {
    const f = this.tmpDash;
    this.camera.getWorldDirection(f);
    f.y = 0;
    f.normalize();
    const pos = this.camera.position;
    const step = 0.3;
    let moved = 0;
    while (moved < dist) {
      const nx = pos.x + f.x * step;
      const nz = pos.z + f.z * step;
      if (!this.freeSpot(nx, nz)) break;
      pos.x = nx;
      pos.z = nz;
      moved += step;
    }
    pos.y = EYE_HEIGHT;
  }

  /** true si (x,z) est dans les bornes et hors de tout collider. */
  private freeSpot(x: number, z: number): boolean {
    if (x < this.bounds.minX || x > this.bounds.maxX || z < this.bounds.minZ || z > this.bounds.maxZ) {
      return false;
    }
    const r = PLAYER_RADIUS;
    for (const b of this.colliders) {
      if (x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r) return false;
    }
    return true;
  }

  /** Met à jour les recharges/jauges du pouvoir et notifie le HUD. */
  private updatePower(dt: number): void {
    if (this.powerCd > 0) this.powerCd = Math.max(0, this.powerCd - dt);
    if (this.powerActiveT > 0) this.powerActiveT = Math.max(0, this.powerActiveT - dt);

    if (this.powerKind === 'sprint') {
      const moving = this.keys.fwd || this.keys.back || this.keys.left || this.keys.right;
      if (this.sprinting && moving && this.sprintEnergy > 0) {
        this.sprintEnergy = Math.max(0, this.sprintEnergy - SPRINT_DRAIN * dt);
        if (this.sprintEnergy === 0) this.sprinting = false;
      } else {
        this.sprintEnergy = Math.min(1, this.sprintEnergy + SPRINT_REGEN * dt);
      }
    }
    this.emitPower();
  }

  private emitPower(): void {
    const def = POWER_DEFS[this.powerKind];
    let gauge: number;
    let ready: boolean;
    let active: boolean;
    if (this.powerKind === 'sprint') {
      gauge = this.sprintEnergy;
      ready = this.sprintEnergy > 0.05;
      active = this.sprinting && this.sprintEnergy > 0;
    } else {
      gauge = def.cooldown > 0 ? 1 - this.powerCd / def.cooldown : 1;
      ready = this.powerCd <= 0;
      active = this.powerActiveT > 0;
    }
    this.cb.onPower({
      label: def.label,
      kind: this.powerKind,
      ready,
      gauge,
      active,
      color: this.character.color,
    });
  }

  /** Inflige des dégâts au joueur (ignorés si le bouclier est actif).
   *  Remet la vie à plein si elle tombe à 0 (le joueur ne meurt jamais). */
  private hurtPlayer(amount: number, hitLog: string, downLog: string): void {
    if (this.powerKind === 'shield' && this.powerActiveT > 0) {
      this.aLog = 'Bouclier ! Dégâts bloqués 🛡️';
      return;
    }
    this.aPlayerHp = Math.max(0, this.aPlayerHp - amount);
    this.aLog = hitLog;
    if (this.aPlayerHp === 0) {
      this.aPlayerHp = this.aPlayerMax;
      this.aLog = downLog;
    }
  }

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.dirty = true;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.transitionTimer);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('click', this.onCanvasClick);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
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

/** Courbe d'arrivée avec léger dépassement (effet « pop » à l'apparition). */
function easeOutBack(p: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = p - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}
