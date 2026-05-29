import * as THREE from 'three';
import { CHARACTERS } from '../characters';
import { buildCharacter } from './character-model';
import { makeScreenTexture, makeSkyTexture, makeWhiteboardTexture } from './textures';

export type ItemType =
  | 'table'
  | 'desk'
  | 'chair'
  | 'teacher'
  | 'shelf'
  | 'board'
  | 'window'
  | 'opaque'
  | 'louvre'
  | 'louvreTall'
  | 'door'
  | 'cabinet'
  | 'lowcab'
  | 'npc'
  | 'spawn'
  | 'plant'
  | 'bin'
  | 'server'
  | 'switch'
  | 'rj45';

export interface MapItem {
  type: ItemType;
  x: number;
  z: number;
  /** rotation Y en radians */
  rot: number;
  /** id du personnage à incarner (pour les objets « npc » uniquement) */
  char?: string;
  /** hauteur (ex. posé sur une table) ; au sol si absent */
  y?: number;
}

export const ITEM_TYPES: ItemType[] = [
  'table',
  'desk',
  'chair',
  'teacher',
  'shelf',
  'board',
  'window',
  'opaque',
  'louvre',
  'louvreTall',
  'door',
  'cabinet',
  'lowcab',
  'npc',
  'spawn',
  'plant',
  'bin',
  'server',
  'switch',
  'rj45',
];

export const ITEM_LABELS: Record<ItemType, string> = {
  table: 'Table',
  desk: 'Table + PC',
  chair: 'Chaise',
  teacher: 'Bureau prof',
  shelf: 'Étagère (mur)',
  board: 'Tableau (mur)',
  window: 'Fenêtre (mur)',
  opaque: 'Fenêtre opaque',
  louvre: 'Louvres (mur)',
  louvreTall: 'Louvres haut',
  door: 'Porte (mur)',
  cabinet: 'Armoire',
  lowcab: 'Meuble bas',
  npc: 'Alternant (PNJ)',
  spawn: 'Spawn joueur',
  plant: 'Plante',
  bin: 'Poubelle',
  server: 'Serveur (noir)',
  switch: 'Switch réseau',
  rj45: 'Câble RJ45',
};

interface Footprint {
  hx: number;
  hz: number;
  h: number;
}

const FOOTPRINTS: Record<ItemType, Footprint> = {
  table: { hx: 1.0, hz: 0.45, h: 0.8 },
  desk: { hx: 1.0, hz: 0.45, h: 0.85 },
  teacher: { hx: 1.3, hz: 0.5, h: 0.8 },
  chair: { hx: 0.26, hz: 0.26, h: 0.5 },
  shelf: { hx: 1.6, hz: 0.25, h: 1.8 },
  board: { hx: 1.3, hz: 0.08, h: 1.8 },
  window: { hx: 1.05, hz: 0.08, h: 1.8 },
  opaque: { hx: 1.05, hz: 0.08, h: 1.8 },
  louvre: { hx: 1.6, hz: 0.1, h: 1.8 },
  louvreTall: { hx: 0.45, hz: 0.1, h: 2.4 },
  door: { hx: 0.7, hz: 0.1, h: 2.3 },
  cabinet: { hx: 0.5, hz: 0.25, h: 2.0 },
  lowcab: { hx: 0.7, hz: 0.25, h: 0.9 },
  npc: { hx: 0.32, hz: 0.32, h: 1.9 },
  spawn: { hx: 0.4, hz: 0.4, h: 0.1 },
  plant: { hx: 0.3, hz: 0.3, h: 1.4 },
  bin: { hx: 0.2, hz: 0.2, h: 0.45 },
  server: { hx: 0.35, hz: 0.4, h: 2.1 },
  switch: { hx: 0.36, hz: 0.19, h: 0.26 },
  rj45: { hx: 0.24, hz: 0.24, h: 0.2 },
};

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...opts });
}

/** Construit un objet centré à l'origine (au sol y=0), face « avant » vers -z. */
export function buildItem(type: ItemType, seed = 0, charId?: string): THREE.Group {
  switch (type) {
    case 'table':
      return buildTable(2.0, 0.85);
    case 'desk':
      return buildDesk(seed, 2.0, 0.85);
    case 'teacher':
      return buildTable(2.6, 0.95);
    case 'chair':
      return buildChair();
    case 'shelf':
      return buildShelf();
    case 'board':
      return buildBoardItem();
    case 'window':
      return buildWindowItem();
    case 'opaque':
      return buildOpaqueWindowItem();
    case 'louvre':
      return buildLouvreItem();
    case 'louvreTall':
      return buildLouvreTallItem();
    case 'door':
      return buildDoorItem();
    case 'cabinet':
      return buildCabinet();
    case 'lowcab':
      return buildLowCab();
    case 'npc': {
      const g = new THREE.Group();
      const char =
        (charId ? CHARACTERS.find((c) => c.id === charId) : undefined) ??
        CHARACTERS[seed % CHARACTERS.length];
      g.add(buildCharacter(char));
      return g;
    }
    case 'spawn':
      return buildSpawnMarker();
    case 'plant':
      return buildPlant();
    case 'bin':
      return buildBin();
    case 'server':
      return buildServer();
    case 'switch':
      return buildSwitch();
    case 'rj45':
      return buildRj45();
  }
}

/** Box3 de collision en tenant compte des rotations à angle droit. */
export function itemCollider(item: MapItem): THREE.Box3 {
  const f = FOOTPRINTS[item.type];
  const quarter = Math.round(item.rot / (Math.PI / 2)) % 2 !== 0;
  const hx = quarter ? f.hz : f.hx;
  const hz = quarter ? f.hx : f.hz;
  return new THREE.Box3(
    new THREE.Vector3(item.x - hx, 0, item.z - hz),
    new THREE.Vector3(item.x + hx, f.h, item.z + hz),
  );
}

/** Anneau (footprint) pour l'éditeur. */
export function itemFootprintSize(type: ItemType): { w: number; d: number } {
  const f = FOOTPRINTS[type];
  return { w: f.hx * 2, d: f.hz * 2 };
}

/**
 * Rotation supplémentaire au collage mur : par défaut le local +z va contre le
 * mur. Les bureaux (écran en -z) sont retournés pour que l'écran soit contre le
 * mur et le clavier/la place côté salle.
 */
export function itemWallRot(type: ItemType): number {
  return type === 'desk' ? Math.PI : 0;
}

// --------------------------------------------------------------- fabriques

function buildDesk(seed: number, width: number, depth: number): THREE.Group {
  const desk = new THREE.Group();
  const topY = 0.78;

  const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, depth), mat(0xe7eaf0, { roughness: 0.6 }));
  top.position.set(0, topY, 0);
  top.castShadow = true;
  top.receiveShadow = true;
  desk.add(top);

  const panelMat = mat(0x46505f, { metalness: 0.2 });
  for (const sx of [-width / 2 + 0.05, width / 2 - 0.05]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, topY, depth - 0.08), panelMat);
    side.position.set(sx, topY / 2, 0);
    side.castShadow = true;
    desk.add(side);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(width - 0.1, topY - 0.2, 0.05), panelMat);
  back.position.set(0, topY / 2 + 0.1, -depth / 2 + 0.05);
  desk.add(back);

  const screenTex = makeScreenTexture(seed);
  const screenMat = new THREE.MeshStandardMaterial({
    map: screenTex,
    emissive: 0xffffff,
    emissiveMap: screenTex,
    emissiveIntensity: 0.9,
    roughness: 0.4,
  });
  const bezelMat = mat(0x15171d, { roughness: 0.5 });
  const monZ = -depth / 2 + 0.14;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.56, 0.05), bezelMat);
  bezel.position.set(0, topY + 0.36, monZ);
  bezel.castShadow = true;
  desk.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.46), screenMat);
  screen.position.set(0, topY + 0.36, monZ + 0.03);
  desk.add(screen);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.07), bezelMat);
  stand.position.set(0, topY + 0.1, monZ);
  desk.add(stand);
  const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.18), bezelMat);
  standBase.position.set(0, topY + 0.03, monZ);
  desk.add(standBase);

  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.03, 0.16), mat(0x23262e));
  kb.position.set(-0.12, topY + 0.05, 0.14);
  kb.castShadow = true;
  desk.add(kb);
  const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.12), mat(0x23262e));
  mouse.position.set(0.28, topY + 0.05, 0.14);
  desk.add(mouse);

  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.52, 0.46), mat(0x1b1d24, { metalness: 0.25 }));
  tower.position.set(width / 2 - 0.22, topY + 0.26, 0);
  tower.castShadow = true;
  desk.add(tower);
  const led = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, 0.01),
    new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 2.2 }),
  );
  led.position.set(width / 2 - 0.22, topY + 0.42, 0.235);
  desk.add(led);
  return desk;
}

function buildTable(width: number, depth: number): THREE.Group {
  const g = new THREE.Group();
  const topY = 0.74;
  const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, depth), mat(0xdfe3ea, { roughness: 0.6 }));
  top.position.set(0, topY, 0);
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);
  // barre de renfort
  const rail = new THREE.Mesh(new THREE.BoxGeometry(width - 0.3, 0.06, 0.06), mat(0x9aa0aa, { metalness: 0.3 }));
  rail.position.set(0, topY - 0.12, 0);
  g.add(rail);
  const legMat = mat(0x3f4250, { metalness: 0.35 });
  const lx = width / 2 - 0.12;
  const lz = depth / 2 - 0.1;
  for (const [sx, sz] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, topY, 0.07), legMat);
    leg.position.set(sx, topY / 2, sz);
    leg.castShadow = true;
    g.add(leg);
  }
  return g;
}

function buildChair(): THREE.Group {
  const c = new THREE.Group();
  const m = mat(0x2b2f3a, { roughness: 0.7 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.46), m);
  seat.position.set(0, 0.5, 0);
  seat.castShadow = true;
  c.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.07), m);
  back.position.set(0, 0.76, 0.22);
  back.castShadow = true;
  c.add(back);
  const legMat = mat(0x6a7080, { metalness: 0.5 });
  for (const [sx, sz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), legMat);
    leg.position.set(sx, 0.25, sz);
    c.add(leg);
  }
  return c;
}

/**
 * Étagère murale (accrochée en hauteur). Le « dos » est en local +z :
 * placer l'ancre contre un mur puis pivoter (R) pour l'y accrocher.
 */
function buildShelf(): THREE.Group {
  const g = new THREE.Group();
  const y = 1.95; // plus haute
  const w = 3.2; // plus longue
  const d = 0.5;
  const grey = mat(0x9aa0aa, { roughness: 0.7, metalness: 0.2 });
  const greyDark = mat(0x6a7080, { roughness: 0.7, metalness: 0.3 });

  // géométrie centrée à l'origine ; le dos (rail) est en +z (côté mur)
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), grey);
  board.position.set(0, y, 0);
  board.castShadow = true;
  g.add(board);

  // rail un peu plus étroit et avancé : pas de face commune avec la planche (z-fighting)
  const rail = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, 0.12, 0.04), greyDark);
  rail.position.set(0, y, d / 2 - 0.06);
  g.add(rail);

  for (const sx of [-w / 2 + 0.2, w / 2 - 0.2]) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, d - 0.06), greyDark);
    bracket.position.set(sx, y - 0.12, 0);
    bracket.castShadow = true;
    g.add(bracket);
  }
  return g;
}

/** Tableau blanc mural (dos en +z, surface vers -z, comme l'étagère). */
function buildBoardItem(): THREE.Group {
  const g = new THREE.Group();
  const y = 1.6;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 0.08), mat(0x9aa0aa, { metalness: 0.4 }));
  frame.position.set(0, y, 0.03);
  frame.castShadow = true;
  g.add(frame);
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.4),
    new THREE.MeshStandardMaterial({ map: makeWhiteboardTexture(), roughness: 0.5, emissive: 0x222222 }),
  );
  panel.position.set(0, y, -0.02);
  panel.rotation.y = Math.PI;
  g.add(panel);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.14), mat(0x7c828c, { metalness: 0.3 }));
  tray.position.set(0, y - 0.82, -0.06);
  g.add(tray);
  return g;
}

/** Fenêtre murale (vitre ciel + croix), dos en +z, surface vers -z. */
function buildWindowItem(): THREE.Group {
  const g = new THREE.Group();
  const y = 1.85;
  const skyTex = makeSkyTexture();
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 1.8),
    new THREE.MeshStandardMaterial({ map: skyTex, emissive: 0xffffff, emissiveMap: skyTex, emissiveIntensity: 0.9 }),
  );
  glass.position.set(0, y, -0.04);
  glass.rotation.y = Math.PI;
  g.add(glass);
  const barMat = mat(0xeceef1, { metalness: 0.2 });
  const vbar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.8, 0.06), barMat);
  vbar.position.set(0, y, -0.07);
  g.add(vbar);
  const hbar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.06), barMat);
  hbar.position.set(0, y, -0.07);
  g.add(hbar);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.95, 0.06), mat(0xdfe3ea));
  frame.position.set(0, y, 0.03);
  g.add(frame);
  return g;
}

/** Fenêtre opaque (verre dépoli) : ne montre pas l'extérieur. */
function buildOpaqueWindowItem(): THREE.Group {
  const g = new THREE.Group();
  const y = 1.85;
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 1.8),
    new THREE.MeshStandardMaterial({ color: 0xcdd9e4, emissive: 0x2a3340, emissiveIntensity: 0.25, roughness: 0.95 }),
  );
  glass.position.set(0, y, -0.04);
  glass.rotation.y = Math.PI;
  g.add(glass);
  const barMat = mat(0xeceef1, { metalness: 0.2 });
  const vbar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.8, 0.06), barMat);
  vbar.position.set(0, y, -0.07);
  g.add(vbar);
  const hbar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.06), barMat);
  hbar.position.set(0, y, -0.07);
  g.add(hbar);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.95, 0.06), mat(0xdfe3ea));
  frame.position.set(0, y, 0.03);
  g.add(frame);
  return g;
}

/** Porte murale (panneau + cadre marron + poignée), dos en +z. */
function buildDoorItem(): THREE.Group {
  const g = new THREE.Group();
  const doorHalf = 0.55;
  const doorTop = 2.255;
  const fw = 0.12;
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2, 2.25, 0.06), mat(0x6b4f3a));
  door.position.set(0, 1.13, -0.04);
  door.castShadow = true;
  g.add(door);
  const jambMat = mat(0x7a5530, { roughness: 0.7 });
  for (const sx of [-(doorHalf + fw / 2), doorHalf + fw / 2]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(fw, doorTop + fw, 0.12), jambMat);
    jamb.position.set(sx, (doorTop + fw) / 2, 0);
    g.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2 + fw * 2, fw, 0.12), jambMat);
  lintel.position.set(0, doorTop + fw / 2, 0);
  g.add(lintel);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), mat(0xd4af37, { metalness: 0.6 }));
  knob.position.set(doorHalf - 0.14, 1.1, -0.09);
  g.add(knob);
  return g;
}

/** Louvres / jalousies murales (lamelles de verre inclinées) paramétrables. */
function makeLouvre(w: number, yB: number, yT: number, count: number): THREE.Group {
  const g = new THREE.Group();
  const mid = (yB + yT) / 2;
  const frameMat = mat(0xeceef1, { metalness: 0.2 });
  const slatMat = new THREE.MeshStandardMaterial({
    color: 0xbfe0ff,
    emissive: 0x33506e,
    emissiveIntensity: 0.5,
    roughness: 0.4,
    transparent: true,
    opacity: 0.82,
  });
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.1, 0.12), frameMat);
  top.position.set(0, yT, 0);
  g.add(top);
  const bot = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.1, 0.12), frameMat);
  bot.position.set(0, yB, 0);
  g.add(bot);
  for (const sx of [-w / 2, w / 2]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, yT - yB, 0.12), frameMat);
    s.position.set(sx, mid, 0);
    g.add(s);
  }
  const step = (yT - yB - 0.16) / count;
  for (let i = 0; i < count; i++) {
    const yy = yB + 0.08 + (i + 0.5) * step;
    const slat = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, 0.05, 0.14), slatMat);
    slat.position.set(0, yy, -0.02);
    slat.rotation.x = 0.42;
    g.add(slat);
  }
  return g;
}

function buildLouvreItem(): THREE.Group {
  return makeLouvre(3.0, 1.0, 2.6, 12);
}

/** Louvre étroit et haut. */
function buildLouvreTallItem(): THREE.Group {
  return makeLouvre(0.9, 0.6, 2.8, 18);
}

/** Armoire (placard haut) posée au sol, dos en +z (côté mur). */
function buildCabinet(): THREE.Group {
  const g = new THREE.Group();
  const w = 1.0;
  const d = 0.5;
  const h = 2.0;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(0x8a929c, { metalness: 0.25 }));
  body.position.set(0, h / 2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const doorMat = mat(0x6f7884, { metalness: 0.3 });
  for (const sx of [-w / 4, w / 4]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 0.04, h - 0.12, 0.03), doorMat);
    door.position.set(sx, h / 2, -d / 2 - 0.03);
    g.add(door);
  }
  const handleMat = mat(0xcbd5e1, { metalness: 0.6 });
  for (const sx of [-0.05, 0.05]) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.04), handleMat);
    handle.position.set(sx, h / 2, -d / 2 - 0.08);
    g.add(handle);
  }
  return g;
}

/** Meuble bas (placard bas en bois) posé au sol, dos en +z. */
function buildLowCab(): THREE.Group {
  const g = new THREE.Group();
  const w = 1.4;
  const d = 0.5;
  const h = 0.9;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(0xb08d57, { roughness: 0.8 }));
  body.position.set(0, h / 2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.05, d + 0.06), mat(0x8a6a45, { roughness: 0.7 }));
  top.position.set(0, h + 0.02, 0);
  g.add(top);
  const doorMat = mat(0x9c7a4f, { roughness: 0.8 });
  const handleMat = mat(0x44484f, { metalness: 0.5 });
  for (const sx of [-w / 3, 0, w / 3]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(w / 3 - 0.05, h - 0.16, 0.03), doorMat);
    door.position.set(sx, h / 2, -d / 2 - 0.03);
    g.add(door);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), handleMat);
    handle.position.set(sx + 0.1, h / 2, -d / 2 - 0.08);
    g.add(handle);
  }
  return g;
}

function buildPlant(): THREE.Group {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.38, 10), mat(0xb5651d));
  pot.position.set(0, 0.19, 0);
  pot.castShadow = true;
  g.add(pot);
  // feuillage compact : reste dans l'emprise (~0.3) pour ne pas traverser les murs
  const foliage = mat(0x2f7d32, { flatShading: true });
  for (const [dx, dy, dz, r] of [[0, 0.6, 0, 0.28], [0.1, 0.84, 0.06, 0.2], [-0.1, 0.84, -0.06, 0.18], [0, 1.02, 0, 0.16]]) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), foliage);
    leaf.position.set(dx, dy, dz);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

/** Marqueur de point de spawn (uniquement visible dans l'éditeur). La flèche
 * indique la direction du regard du joueur (local -z). */
function buildSpawnMarker(): THREE.Group {
  const g = new THREE.Group();
  const glow = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.85,
  });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 22), glow);
  ring.position.y = 0.03;
  g.add(ring);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 10), glow);
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(0, 0.08, -0.5);
  g.add(arrow);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), glow);
  post.position.set(0, 0.6, 0);
  g.add(post);
  return g;
}

function buildBin(): THREE.Group {
  const g = new THREE.Group();
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.45, 10), mat(0x3a4250, { metalness: 0.3 }));
  bin.position.set(0, 0.22, 0);
  bin.castShadow = true;
  g.add(bin);
  return g;
}

/** Baie serveur noire (face avant vers -z) : slots + LEDs vertes/ambre. */
function buildServer(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.1, 0.8), mat(0x121317, { metalness: 0.5, roughness: 0.4 }));
  body.position.set(0, 1.05, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.95, 0.02), mat(0x05060a));
  front.position.set(0, 1.05, -0.41);
  g.add(front);
  const slot = mat(0x1c1f26);
  const ledGreen = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 2.4 });
  const ledAmber = new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xffb020, emissiveIntensity: 2.2 });
  for (let i = 0; i < 7; i++) {
    const y = 0.32 + i * 0.26;
    const unit = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.18, 0.03), slot);
    unit.position.set(0, y, -0.42);
    g.add(unit);
    for (let k = 0; k < 2; k++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), (i + k) % 3 === 0 ? ledAmber : ledGreen);
      led.position.set(-0.22 + k * 0.1, y, -0.45);
      g.add(led);
    }
  }
  return g;
}

/** Switch réseau (boîtier noir bas, ports RJ45 + LEDs lien en façade -z). */
function buildSwitch(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.36), mat(0x16181e, { metalness: 0.5, roughness: 0.4 }));
  body.position.set(0, 0.12, 0);
  body.castShadow = true;
  g.add(body);
  const portMat = mat(0x0a0b0f);
  const link = new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x34d399, emissiveIntensity: 2 });
  for (let i = 0; i < 8; i++) {
    const x = -0.28 + i * 0.08;
    const port = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.02), portMat);
    port.position.set(x, 0.11, -0.18);
    g.add(port);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.01), link);
    led.position.set(x, 0.16, -0.18);
    g.add(led);
  }
  return g;
}

/** Câble RJ45 enroulé (bobine bleue + connecteurs). */
function buildRj45(): THREE.Group {
  const g = new THREE.Group();
  const cable = mat(0x2563eb, { roughness: 0.6 });
  const coil1 = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 18), cable);
  coil1.rotation.x = Math.PI / 2;
  coil1.position.set(0, 0.06, 0);
  coil1.castShadow = true;
  g.add(coil1);
  const coil2 = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 16), cable);
  coil2.rotation.x = Math.PI / 2;
  coil2.position.set(0.02, 0.13, 0.01);
  g.add(coil2);
  const conn = mat(0xcbd5e1, { metalness: 0.3, roughness: 0.5 });
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.12), conn);
  c1.position.set(0.2, 0.05, 0.06);
  g.add(c1);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.12), conn);
  c2.position.set(-0.18, 0.05, -0.08);
  c2.rotation.y = 0.6;
  g.add(c2);
  return g;
}

// --------------------------------------------------------------- map par défaut

// Map par défaut = celle conçue dans l'éditeur (exportée puis intégrée).
export const DEFAULT_LAYOUT: MapItem[] = [
  { type: 'shelf', x: -10.75, z: -4.9, rot: -1.5707963267948966 },
  { type: 'shelf', x: -10.75, z: -2, rot: -1.5707963267948966 },
  { type: 'shelf', x: -10.75, z: 1, rot: -1.5707963267948966 },
  { type: 'shelf', x: -10.75, z: 4, rot: -1.5707963267948966 },
  { type: 'desk', x: -10.55, z: -3.5, rot: 1.5707963267948966 },
  { type: 'desk', x: -10.55, z: -1.5, rot: 1.5707963267948966 },
  { type: 'desk', x: -10.55, z: 0.5, rot: 1.5707963267948966 },
  { type: 'desk', x: -10.55, z: 2.5, rot: 1.5707963267948966 },
  { type: 'desk', x: -6.5, z: 5.5, rot: 4.71238898038469 },
  { type: 'desk', x: -6.5, z: 3.5, rot: 4.71238898038469 },
  { type: 'desk', x: -5.5, z: 5.5, rot: 7.853981633974483 },
  { type: 'desk', x: -5.5, z: 3.5, rot: 1.5707963267948966 },
  { type: 'desk', x: -0.5, z: 5.5, rot: 4.71238898038469 },
  { type: 'desk', x: -0.5, z: 3.5, rot: 4.71238898038469 },
  { type: 'desk', x: 0.5, z: 5.5, rot: 7.853981633974483 },
  { type: 'desk', x: 0.5, z: 3.5, rot: 1.5707963267948966 },
  { type: 'desk', x: 5.5, z: 5.5, rot: 4.71238898038469 },
  { type: 'desk', x: 5.5, z: 3.5, rot: 4.71238898038469 },
  { type: 'desk', x: 6.5, z: 5.5, rot: 7.853981633974483 },
  { type: 'desk', x: 6.5, z: 3.5, rot: 1.5707963267948966 },
  { type: 'desk', x: 10.55, z: 5.5, rot: 4.71238898038469 },
  { type: 'desk', x: 10.55, z: 3.5, rot: 4.71238898038469 },
  { type: 'table', x: 10.55, z: -2, rot: 1.5707963267948966 },
  { type: 'table', x: 10.55, z: -4, rot: 1.5707963267948966 },
  { type: 'table', x: -3.5, z: -5.5, rot: 4.71238898038469 },
  { type: 'teacher', x: -2.5, z: -4, rot: 3.141592653589793 },
  { type: 'teacher', x: 0, z: -4, rot: 3.141592653589793 },
  { type: 'table', x: 2, z: -4, rot: 3.141592653589793 },
  { type: 'table', x: 0, z: 0, rot: 3.141592653589793 },
  { type: 'table', x: 2, z: 0, rot: 3.141592653589793 },
  { type: 'table', x: 3.5, z: -0.5, rot: 4.71238898038469 },
  { type: 'table', x: -1.5, z: -0.5, rot: 4.71238898038469 },
  { type: 'chair', x: -5, z: 3, rot: 1.5707963267948966 },
  { type: 'chair', x: -5, z: 5, rot: 1.5707963267948966 },
  { type: 'chair', x: 1, z: 3, rot: 1.5707963267948966 },
  { type: 'chair', x: 1, z: 5, rot: 1.5707963267948966 },
  { type: 'chair', x: -1, z: 3.5, rot: 4.71238898038469 },
  { type: 'chair', x: -1, z: 5, rot: 4.71238898038469 },
  { type: 'chair', x: -7, z: 3.5, rot: 4.71238898038469 },
  { type: 'chair', x: -7, z: 5, rot: 4.71238898038469 },
  { type: 'chair', x: 5, z: 3.5, rot: 4.71238898038469 },
  { type: 'chair', x: 5, z: 5, rot: 4.71238898038469 },
  { type: 'chair', x: 7, z: 3.5, rot: 1.5707963267948966 },
  { type: 'chair', x: 7, z: 5, rot: 1.5707963267948966 },
  { type: 'chair', x: 9.5, z: 3.5, rot: 4.71238898038469 },
  { type: 'chair', x: 9.5, z: 5, rot: 4.71238898038469 },
  { type: 'chair', x: -2, z: -1, rot: 4.71238898038469 },
  { type: 'chair', x: -2, z: -0.5, rot: 4.71238898038469 },
  { type: 'chair', x: 0, z: 0.5, rot: 0 },
  { type: 'chair', x: 2, z: 0.5, rot: 0 },
  { type: 'chair', x: 4, z: 0, rot: 1.5707963267948966 },
  { type: 'chair', x: 4, z: -1, rot: 1.5707963267948966 },
  { type: 'chair', x: -9.5, z: 2.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -9.5, z: 0.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -9.5, z: -1.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -9.5, z: -3.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -2, z: -5, rot: 3.141592653589793 },
  { type: 'chair', x: 9.5, z: -4, rot: 4.71238898038469 },
  { type: 'chair', x: 9.5, z: -2, rot: 4.71238898038469 },
  { type: 'bin', x: 6, z: -6.3, rot: 7.853981633974483 },
  { type: 'plant', x: 10, z: -6.2, rot: 3.141592653589793 },
  { type: 'plant', x: -10.7, z: -6, rot: -1.5707963267948966 },
  { type: 'plant', x: -6.5, z: -6.2, rot: 3.141592653589793 },
  { type: 'shelf', x: 10.75, z: 4, rot: 1.5707963267948966 },
  { type: 'shelf', x: 10.75, z: -4, rot: 1.5707963267948966 },
  { type: 'npc', x: -5.5, z: -5, rot: 0 },
  { type: 'npc', x: -7, z: -4, rot: 1.5707963267948966 },
  { type: 'npc', x: -4.5, z: -4, rot: 4.71238898038469 },
  { type: 'npc', x: 1, z: -2, rot: 0 },
  { type: 'npc', x: -1.5, z: 1, rot: 3.141592653589793 },
  { type: 'npc', x: 3, z: 1, rot: 3.141592653589793 },
  { type: 'npc', x: -2.5, z: 0, rot: 1.5707963267948966 },
  { type: 'spawn', x: -6, z: -3, rot: 0 },
  // --- salle voisine ---
  { type: 'board', x: 11.08, z: 4, rot: -1.5707963267948966 },
  { type: 'desk', x: 14, z: 5.5, rot: 4.71238898038469 },
  { type: 'table', x: 14, z: 3.5, rot: 1.5707963267948966 },
  { type: 'desk', x: 16, z: 5.5, rot: 7.853981633974483 },
  { type: 'desk', x: 16, z: 3.5, rot: 1.5707963267948966 },
  { type: 'desk', x: 16, z: 1.5, rot: 1.5707963267948966 },
  { type: 'desk', x: 18.5, z: 5.5, rot: 7.853981633974483 },
  { type: 'desk', x: 21, z: 5.5, rot: 7.853981633974483 },
  { type: 'desk', x: 18.5, z: 3.5, rot: 1.5707963267948966 },
  { type: 'desk', x: 18.5, z: 1.5, rot: 1.5707963267948966 },
  { type: 'desk', x: 21, z: 3.5, rot: 1.5707963267948966 },
  { type: 'desk', x: 21, z: 1.5, rot: 1.5707963267948966 },
  { type: 'desk', x: 16, z: -5.5, rot: 7.853981633974483 },
  { type: 'desk', x: 16, z: -3.5, rot: 1.5707963267948966 },
  { type: 'desk', x: 18.5, z: -5.5, rot: 7.853981633974483 },
  { type: 'desk', x: 18.5, z: -3.5, rot: 1.5707963267948966 },
  { type: 'desk', x: 21, z: -5.5, rot: 7.853981633974483 },
  { type: 'desk', x: 21, z: -3.5, rot: 1.5707963267948966 },
  { type: 'table', x: 24, z: 5.5, rot: 1.5707963267948966 },
  { type: 'table', x: 24, z: 3.5, rot: 1.5707963267948966 },
  { type: 'table', x: 24, z: 1.5, rot: 1.5707963267948966 },
  { type: 'table', x: 24.5, z: 0, rot: 3.141592653589793 },
  { type: 'chair', x: 23, z: 6.24, rot: 4.71238898038469 },
  { type: 'chair', x: 23, z: 5, rot: 4.71238898038469 },
  { type: 'chair', x: 23, z: 3.5, rot: 4.71238898038469 },
  { type: 'chair', x: 23.5, z: 1.5, rot: 4.71238898038469 },
  { type: 'chair', x: 24.5, z: -0.5, rot: 3.141592653589793 },
  { type: 'chair', x: 25.5, z: 5, rot: 0 },
  { type: 'chair', x: 21.5, z: -5, rot: 1.5707963267948966 },
  { type: 'chair', x: 21.5, z: -3.5, rot: 1.5707963267948966 },
  { type: 'chair', x: 21.5, z: 1.5, rot: 1.5707963267948966 },
  { type: 'chair', x: 21.5, z: 3, rot: 1.5707963267948966 },
  { type: 'chair', x: 21.5, z: 5, rot: 1.5707963267948966 },
  { type: 'chair', x: 19, z: 3.5, rot: 1.5707963267948966 },
  { type: 'chair', x: 19, z: 5, rot: 1.5707963267948966 },
  { type: 'chair', x: 19, z: 1.5, rot: 1.5707963267948966 },
  { type: 'chair', x: 16.5, z: 5, rot: 1.5707963267948966 },
  { type: 'chair', x: 16.5, z: 3.5, rot: 1.5707963267948966 },
  { type: 'chair', x: 16.5, z: 1.5, rot: 1.5707963267948966 },
  { type: 'chair', x: 16.5, z: -3.5, rot: 1.5707963267948966 },
  { type: 'chair', x: 16.5, z: -5, rot: 1.5707963267948966 },
  { type: 'chair', x: 19, z: -3.5, rot: 1.5707963267948966 },
  { type: 'chair', x: 19, z: -5, rot: 1.5707963267948966 },
  { type: 'chair', x: 13.5, z: 5, rot: 4.71238898038469 },
  { type: 'chair', x: 13.5, z: 4, rot: 4.71238898038469 },
  { type: 'chair', x: 13.5, z: 3, rot: 4.71238898038469 },
  { type: 'table', x: 11.45, z: -5, rot: -1.5707963267948966 },
  { type: 'table', x: 11.45, z: -3, rot: -1.5707963267948966 },
  { type: 'table', x: 26.55, z: -2.5, rot: 1.5707963267948966 },
  { type: 'bin', x: 23.5, z: -6.3, rot: 3.141592653589793 },
  { type: 'bin', x: 15, z: -6.3, rot: 3.141592653589793 },
  // --- murs : fenêtres / louvres / portes / opaques + placards ---
  { type: 'window', x: -8, z: 6.42, rot: 0 },
  { type: 'window', x: 8, z: 6.42, rot: 0 },
  { type: 'louvre', x: -3.2, z: 6.4, rot: 0 },
  { type: 'louvre', x: 0, z: 6.4, rot: 0 },
  { type: 'louvre', x: 3.2, z: 6.4, rot: 0 },
  { type: 'window', x: 25.5, z: 6.42, rot: 0 },
  { type: 'window', x: 12.5, z: 6.42, rot: 0 },
  { type: 'louvre', x: 15.5, z: 6.4, rot: 0 },
  { type: 'louvre', x: 18.5, z: 6.4, rot: 0 },
  { type: 'louvre', x: 21.5, z: 6.4, rot: 0 },
  { type: 'door', x: 13.5, z: -6.4, rot: 3.141592653589793 },
  { type: 'door', x: -8.5, z: -6.4, rot: 3.141592653589793 },
  { type: 'door', x: 24.5, z: -6.4, rot: 3.141592653589793 },
  { type: 'door', x: 26.9, z: -0.5, rot: 1.5707963267948966 },
  { type: 'opaque', x: 26.92, z: -2.5, rot: 1.5707963267948966 },
  { type: 'opaque', x: 26.92, z: -4.5, rot: 1.5707963267948966 },
  { type: 'opaque', x: 26.92, z: 1.5, rot: 1.5707963267948966 },
  { type: 'opaque', x: 26.92, z: 3.5, rot: 1.5707963267948966 },
  { type: 'opaque', x: 26.92, z: 5, rot: 1.5707963267948966 },
  { type: 'louvreTall', x: 15, z: -6.4, rot: 3.141592653589793 },
  { type: 'louvreTall', x: 23, z: -6.4, rot: 3.141592653589793 },
  { type: 'louvreTall', x: 5.5, z: -6.4, rot: 3.141592653589793 },
  { type: 'louvreTall', x: -7, z: -6.4, rot: 3.141592653589793 },
  { type: 'lowcab', x: 4, z: -6.25, rot: 3.141592653589793 },
  { type: 'cabinet', x: 26.75, z: -6, rot: 1.5707963267948966 },
  { type: 'cabinet', x: 26.75, z: -5, rot: 1.5707963267948966 },
  { type: 'cabinet', x: -10.75, z: 4.5, rot: -1.5707963267948966 },
  { type: 'cabinet', x: -10.75, z: 5.5, rot: -1.5707963267948966 },
  { type: 'bin', x: 11.2, z: 1.5, rot: -1.5707963267948966 },
  // --- alternants supplémentaires ---
  { type: 'npc', x: 8, z: 4.5, rot: 3.141592653589793, char: 'marius' },
  { type: 'npc', x: -8, z: 5, rot: 3.141592653589793, char: 'jojo' },
  { type: 'npc', x: 22.5, z: -4, rot: 4.71238898038469, char: 'weimin' },
  { type: 'npc', x: 17.5, z: 6.18, rot: 3.141592653589793, char: 'nathan' },
  { type: 'npc', x: 22.5, z: -5, rot: 4.71238898038469, char: 'jiji' },
  // --- salle de classe (à gauche) ---
  { type: 'board', x: -26.92, z: 0, rot: -1.5707963267948966 },
  { type: 'table', x: -26.55, z: -4.5, rot: 1.5707963267948966 },
  { type: 'table', x: -22.5, z: -5.5, rot: 4.71238898038469 },
  { type: 'table', x: -22.5, z: -3.5, rot: 4.71238898038469 },
  { type: 'table', x: -20.5, z: -5.5, rot: 7.853981633974483 },
  { type: 'table', x: -20.5, z: -3.5, rot: 4.71238898038469 },
  { type: 'table', x: -18.5, z: -5.5, rot: 7.853981633974483 },
  { type: 'table', x: -18.5, z: -3.5, rot: 4.71238898038469 },
  { type: 'table', x: -16, z: -5.5, rot: 4.71238898038469 },
  { type: 'table', x: -16, z: -3.5, rot: 4.71238898038469 },
  { type: 'table', x: -22.5, z: 0, rot: 4.71238898038469 },
  { type: 'table', x: -20.5, z: 0, rot: 4.71238898038469 },
  { type: 'table', x: -18.5, z: 0, rot: 4.71238898038469 },
  { type: 'table', x: -16, z: 0, rot: 4.71238898038469 },
  { type: 'table', x: -22.5, z: 5.5, rot: 4.71238898038469 },
  { type: 'table', x: -22.5, z: 3.5, rot: 4.71238898038469 },
  { type: 'table', x: -20.5, z: 5.5, rot: 4.71238898038469 },
  { type: 'table', x: -20.5, z: 3.5, rot: 4.71238898038469 },
  { type: 'table', x: -18.5, z: 5.5, rot: 4.71238898038469 },
  { type: 'table', x: -18.5, z: 3.5, rot: 4.71238898038469 },
  { type: 'table', x: -16, z: 5.5, rot: 4.71238898038469 },
  { type: 'table', x: -16, z: 3.5, rot: 4.71238898038469 },
  { type: 'table', x: -13, z: 5.5, rot: 4.71238898038469 },
  { type: 'table', x: -13, z: 3.5, rot: 4.71238898038469 },
  { type: 'table', x: -13, z: -4, rot: 4.71238898038469 },
  { type: 'desk', x: -25, z: 5.5, rot: 4.71238898038469 },
  { type: 'plant', x: -25, z: 4, rot: 4.71238898038469 },
  { type: 'bin', x: -26.5, z: -6.3, rot: 7.853981633974483 },
  { type: 'window', x: -12.05, z: 6.42, rot: 0 },
  { type: 'window', x: -25.5, z: 6.42, rot: 0 },
  { type: 'louvre', x: -15, z: 6.4, rot: 0 },
  { type: 'louvre', x: -18, z: 6.4, rot: 0 },
  { type: 'louvre', x: -21, z: 6.4, rot: 0 },
  { type: 'door', x: -12.5, z: -6.4, rot: 3.141592653589793 },
  { type: 'louvreTall', x: -14, z: -6.4, rot: 3.141592653589793 },
  { type: 'louvreTall', x: -22.5, z: -6.4, rot: 3.141592653589793 },
  { type: 'louvreTall', x: 32, z: -6.4, rot: 3.141592653589793 },
  { type: 'chair', x: -22, z: 5.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -22, z: 3.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -20, z: 5.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -20, z: 3.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -18, z: 5.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -18, z: 4, rot: 1.5707963267948966 },
  { type: 'chair', x: -15.5, z: 5.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -15.5, z: 3.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -12.5, z: 5, rot: 1.5707963267948966 },
  { type: 'chair', x: -12.5, z: 3.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -12.5, z: -4, rot: 1.5707963267948966 },
  { type: 'chair', x: -15.5, z: 0, rot: 1.5707963267948966 },
  { type: 'chair', x: -18, z: 0, rot: 1.5707963267948966 },
  { type: 'chair', x: -20, z: 0, rot: 1.5707963267948966 },
  { type: 'chair', x: -22, z: 0, rot: 1.5707963267948966 },
  { type: 'chair', x: -22, z: -3.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -22, z: -5.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -20, z: -3.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -20, z: -5, rot: 1.5707963267948966 },
  { type: 'chair', x: -18, z: -5.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -18, z: -3.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -15.5, z: -3.5, rot: 1.5707963267948966 },
  { type: 'chair', x: -15.5, z: -5.5, rot: 1.5707963267948966 },
  { type: 'cabinet', x: -11.25, z: -1, rot: 1.5707963267948966 },
  { type: 'cabinet', x: -11.25, z: 0, rot: 1.5707963267948966 },
  // --- portes / louvres sur le mur avant (côté couloir) ---
  { type: 'door', x: -12, z: -6.6, rot: 0 },
  { type: 'door', x: -7.5, z: -6.6, rot: 0 },
  { type: 'door', x: 13, z: -6.6, rot: 0 },
  { type: 'door', x: 25, z: -6.6, rot: 0 },
  { type: 'louvreTall', x: -6, z: -6.6, rot: 0 },
  { type: 'louvreTall', x: 5.5, z: -6.6, rot: 0 },
  { type: 'louvreTall', x: 15, z: -6.6, rot: 0 },
  { type: 'louvreTall', x: 23, z: -6.6, rot: 0 },
  { type: 'louvreTall', x: 32, z: -6.6, rot: 0 },
  { type: 'louvreTall', x: -13.5, z: -6.6, rot: 0 },
  { type: 'louvreTall', x: -22.5, z: -6.6, rot: 0 },
  // --- couloir : mobilier le long du mur du fond (z = -10) ---
  { type: 'plant', x: -26.5, z: -9.7, rot: 3.141592653589793 },
  { type: 'plant', x: 32.5, z: -9.7, rot: 3.141592653589793 },
  { type: 'cabinet', x: -18, z: -9.75, rot: 3.141592653589793 },
  { type: 'cabinet', x: -5, z: -9.75, rot: 3.141592653589793 },
  { type: 'cabinet', x: 8.5, z: -9.75, rot: 3.141592653589793 },
  { type: 'cabinet', x: 19.5, z: -9.75, rot: 3.141592653589793 },
  { type: 'cabinet', x: 28, z: -9.75, rot: 3.141592653589793 },
  { type: 'bin', x: 18, z: -9.8, rot: 3.141592653589793 },
  { type: 'bin', x: -3.5, z: -9.8, rot: 3.141592653589793 },
  { type: 'bin', x: -19.5, z: -9.8, rot: 3.141592653589793 },
  { type: 'chair', x: -20.5, z: -9.74, rot: 3.141592653589793 },
  { type: 'chair', x: 17, z: -9.74, rot: 3.141592653589793 },
  { type: 'chair', x: 29.5, z: -9.74, rot: 3.141592653589793 },
  { type: 'plant', x: 18.5, z: -9.7, rot: 3.141592653589793 },
  { type: 'plant', x: -4, z: -9.7, rot: 3.141592653589793 },
  { type: 'plant', x: -19, z: -9.7, rot: 3.141592653589793 },
  { type: 'lowcab', x: -22.5, z: -9.75, rot: 3.141592653589793 },
  { type: 'lowcab', x: 6, z: -9.75, rot: 3.141592653589793 },
  { type: 'lowcab', x: 25, z: -9.75, rot: 3.141592653589793 },
  { type: 'window', x: 22.5, z: -9.92, rot: 3.141592653589793 },
  { type: 'window', x: 13.5, z: -9.92, rot: 3.141592653589793 },
  { type: 'window', x: 11.5, z: -9.92, rot: 3.141592653589793 },
  { type: 'window', x: 2.5, z: -9.92, rot: 3.141592653589793 },
  { type: 'window', x: 0.5, z: -9.92, rot: 3.141592653589793 },
  { type: 'window', x: -9.5, z: -9.92, rot: 3.141592653589793 },
  { type: 'window', x: -11.5, z: -9.92, rot: 3.141592653589793 },
  { type: 'window', x: -24.5, z: -9.92, rot: 3.141592653589793 },
  // --- salle serveur équipée ---
  { type: 'server', x: 32.55, z: 4.5, rot: 1.5707963267948966 },
  { type: 'server', x: 32.55, z: 3, rot: 1.5707963267948966 },
  { type: 'server', x: 32.55, z: 1, rot: 1.5707963267948966 },
  { type: 'table', x: 32, z: -0.5, rot: 0 },
  { type: 'desk', x: 30, z: -0.5, rot: 0 },
  { type: 'table', x: 27.5, z: 2.5, rot: -1.5707963267948966 },
  { type: 'shelf', x: 27.3, z: 4, rot: -1.5707963267948966 },
  { type: 'shelf', x: 27.3, z: 1, rot: -1.5707963267948966 },
  { type: 'plant', x: 27.35, z: -5.5, rot: -1.5707963267948966 },
  { type: 'cabinet', x: 32.7, z: -4.5, rot: 1.5707963267948966 },
  { type: 'cabinet', x: 32.7, z: -3.5, rot: 1.5707963267948966 },
  { type: 'lowcab', x: 32.7, z: -2, rot: 1.5707963267948966 },
  { type: 'switch', x: 27.5, z: 2.5, rot: 4.71238898038469, y: 0.72 },
  { type: 'switch', x: 32, z: -0.5, rot: 3.141592653589793, y: 0.72 },
  { type: 'rj45', x: 27.29, z: 0.5, rot: 1.5707963267948966 },
  { type: 'rj45', x: 31.5, z: -4, rot: 3.141592653589793 },
  { type: 'rj45', x: 28.5, z: -5, rot: 3.141592653589793 },
  { type: 'rj45', x: 32, z: 4.5, rot: 3.141592653589793 },
  { type: 'rj45', x: 27.29, z: 4, rot: 1.5707963267948966 },
  // --- switchs / câbles posés sur des tables (autres salles) ---
  { type: 'rj45', x: 14, z: 3.5, rot: 3.141592653589793, y: 0.72 },
  { type: 'rj45', x: 10.55, z: -2, rot: 3.141592653589793, y: 0.72 },
  { type: 'rj45', x: -3.5, z: -5.5, rot: 3.141592653589793, y: 0.72 },
  { type: 'rj45', x: 2, z: 0, rot: 3.141592653589793, y: 0.72 },
  { type: 'switch', x: -1.5, z: -0.5, rot: 1.5707963267948966, y: 0.72 },
  { type: 'switch', x: 10.55, z: -4, rot: 1.5707963267948966, y: 0.72 },
  // --- alternants de la salle de classe (gauche) + personnages de la quête ---
  { type: 'npc', x: -13, z: 1, rot: 4.71238898038469, char: 'loimata-tokava' },
  { type: 'npc', x: -26.63, z: 1.5, rot: 1.5707963267948966, char: 'tyron-hanui' },
  { type: 'npc', x: -26, z: 2.5, rot: 3.141592653589793, char: 'wasso-wahuzue' },
  { type: 'npc', x: -17, z: 4.5, rot: 3.141592653589793, char: 'sherryl-tauraatua' },
  { type: 'npc', x: -21.5, z: -0.5, rot: 4.71238898038469, char: 'jiji' },
  { type: 'npc', x: -14, z: -1, rot: 0, char: 'urielle-zimmerlin' },
  { type: 'npc', x: -14.5, z: 2.5, rot: 3.141592653589793, char: 'malaury-mounien' },
  { type: 'npc', x: 28, z: -0.5, rot: 3.141592653589793, char: 'brutus' },
  { type: 'npc', x: 30, z: 4.5, rot: 3.141592653589793, char: 'raphael' },
];

// --------------------------------------------------------------- persistance

const STORAGE_KEY = 'sioretro.map.v7';

export function loadLayout(): MapItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULT_LAYOUT);
    const parsed = JSON.parse(raw) as MapItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) return clone(DEFAULT_LAYOUT);
    return parsed.filter((i) => ITEM_TYPES.includes(i.type));
  } catch {
    return clone(DEFAULT_LAYOUT);
  }
}

export function saveLayout(items: MapItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* localStorage indisponible : on ignore */
  }
}

export function clone(items: MapItem[]): MapItem[] {
  return items.map((i) => ({ ...i }));
}
