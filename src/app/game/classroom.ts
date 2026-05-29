import * as THREE from 'three';
import { itemCollider, type MapItem, buildItem } from './furniture';
import { makeFloorTexture, makePosterTexture, makeWhiteboardTexture } from './textures';
import { CLASS_DOOR, HALL_DOOR, PLAN, SERVER_DOOR } from './floorplan';

export const ROOM = { halfX: 11, halfZ: 6.5, height: 3.2 };
/** profondeur de la salle voisine (au-delà du mur +x) */
export const ADJACENT_DEPTH = 16;
/** Limites dures du joueur : boîte englobante du plan ; le confinement réel
 *  vient des murs (colliders), les ouvertures étant des trous entre eux. */
export const PLAYER_BOUNDS = {
  minX: PLAN.minX + 0.6,
  maxX: PLAN.maxX - 0.6,
  minZ: PLAN.minZ + 0.6,
  maxZ: PLAN.maxZ - 0.6,
};

export const CEILING_LIGHTS: THREE.Vector3[] = [
  new THREE.Vector3(-6, 3.05, -3),
  new THREE.Vector3(0, 3.05, -3),
  new THREE.Vector3(6, 3.05, -3),
  new THREE.Vector3(-6, 3.05, 3),
  new THREE.Vector3(0, 3.05, 3),
  new THREE.Vector3(6, 3.05, 3),
];

export interface NpcAnchor {
  pos: THREE.Vector3;
  rotY: number;
  /** id du personnage choisi dans l'éditeur (sinon assigné par défaut) */
  char?: string;
}

export interface Classroom {
  group: THREE.Group;
  colliders: THREE.Box3[];
  /** emplacements des alternants (objets « npc » de la map) */
  npcSpawns: NpcAnchor[];
  spawn: THREE.Vector3;
  /** orientation initiale du joueur (radians) */
  spawnRot: number;
}

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...opts });
}

/** Types d'objets muraux / au sol fin : pas de collision. */
const NO_COLLIDER = new Set<string>(['chair', 'shelf', 'board', 'window', 'opaque', 'louvre', 'louvreTall', 'door', 'switch', 'rj45']);

/** Coquille fixe de la salle (sol, murs, tableau, fenêtres, déco). */
export function buildClassroomShell(): { group: THREE.Group; colliders: THREE.Box3[] } {
  const group = new THREE.Group();
  const colliders: THREE.Box3[] = [];
  const { halfX, halfZ, height } = ROOM;

  // sol commun aux deux salles (s'étend jusqu'à la salle voisine)
  const floorW = halfX * 2 + ADJACENT_DEPTH;
  const ftex = makeFloorTexture();
  ftex.repeat.set(Math.round(floorW / 2.2), 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorW, halfZ * 2), mat(0xffffff, { map: ftex, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(ADJACENT_DEPTH / 2, 0, 0);
  floor.receiveShadow = true;
  group.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(halfX * 2, halfZ * 2), mat(0xced2da));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = height;
  group.add(ceil);

  const wallMat = mat(0xd9dde4);
  const accentMat = mat(0x2f3645);
  // murs pleins (boîtes fines) : occlusion correcte des deux côtés, pas de z-fighting
  const addWall = (w: number, x: number, z: number, rotY: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, height, 0.08), wallMat);
    m.position.set(x, height / 2, z);
    m.rotation.y = rotY;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    const nx = Math.sin(rotY) * 0.06;
    const nz = Math.cos(rotY) * 0.06;
    const band = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, 0.04), accentMat);
    band.position.set(x + nx, 0.14, z + nz);
    band.rotation.y = rotY;
    group.add(band);
  };
  // mur avant (z = -halfZ) en deux pans : ouverture de la porte jaune vers le couloir
  const dL = HALL_DOOR.center - HALL_DOOR.half;
  const dR = HALL_DOOR.center + HALL_DOOR.half;
  addWall(dL + halfX, (-halfX + dL) / 2, -halfZ, 0);
  addWall(halfX - dR, (dR + halfX) / 2, -halfZ, 0);
  pushWallBox(colliders, -halfX, -halfZ, dL, -halfZ, height);
  pushWallBox(colliders, dR, -halfZ, halfX, -halfZ, height);
  // imposte : comble le mur AU-DESSUS de la porte jaune (sinon on voit à travers)
  const overTop = 2.44;
  const imp = new THREE.Mesh(new THREE.BoxGeometry(dR - dL, height - overTop, 0.08), wallMat);
  imp.position.set((dL + dR) / 2, (overTop + height) / 2, -halfZ);
  imp.receiveShadow = true;
  group.add(imp);

  addWall(halfX * 2, 0, halfZ, Math.PI);
  addWall(halfZ * 2, -halfX, 0, Math.PI / 2); // mur ouest plein (la classe est de l'autre côté)
  pushWallBox(colliders, -halfX, -halfZ, -halfX, halfZ, height);
  // le mur droit (+x) est construit avec une ouverture dans buildRightWall

  buildBoardWall(group);
  buildRightWall(group, colliders);
  buildLeftWall(group);
  buildCeilingLights(group);
  buildNorthWing(group, colliders);
  return { group, colliders };
}

/** Mur plein (boîte fine) le long de x ou z, avec son collider. */
function pushWallBox(
  colliders: THREE.Box3[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  height: number,
  t = 0.12,
): void {
  const hx = Math.max(Math.abs(x1 - x0) / 2, t / 2);
  const hz = Math.max(Math.abs(z1 - z0) / 2, t / 2);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  colliders.push(
    new THREE.Box3(
      new THREE.Vector3(cx - hx, 0, cz - hz),
      new THREE.Vector3(cx + hx, height, cz + hz),
    ),
  );
}

/** Salle complète = coquille + mobilier issu de la map. */
export function buildClassroom(layout: MapItem[]): Classroom {
  const shell = buildClassroomShell();
  const group = shell.group;
  const colliders: THREE.Box3[] = [...shell.colliders];
  const npcSpawns: NpcAnchor[] = [];
  let spawn = new THREE.Vector3(0, 1.6, ROOM.halfZ - 1.0);
  let spawnRot = 0;

  layout.forEach((item, i) => {
    // les alternants sont construits par le moteur (vrais camarades) :
    // on n'enregistre ici que leur emplacement.
    if (item.type === 'npc') {
      npcSpawns.push({ pos: new THREE.Vector3(item.x, 0, item.z), rotY: item.rot, char: item.char });
      return;
    }
    // point de spawn du joueur (non rendu en jeu)
    if (item.type === 'spawn') {
      spawn = new THREE.Vector3(item.x, 1.6, item.z);
      spawnRot = item.rot;
      return;
    }
    const obj = buildItem(item.type, i);
    obj.position.set(item.x, item.y ?? 0, item.z);
    obj.rotation.y = item.rot;
    group.add(obj);
    // pas de collision pour les objets muraux / chaises
    if (!NO_COLLIDER.has(item.type)) {
      colliders.push(itemCollider(item));
    }
  });

  return { group, colliders, npcSpawns, spawn, spawnRot };
}

// --------------------------------------------------------------- déco salle

function buildBoardWall(group: THREE.Group): void {
  const { halfX, halfZ } = ROOM;
  const zw = -halfZ;

  // tableau (abaissé pour laisser la place à l'horloge au-dessus)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(6.3, 2.4, 0.08), mat(0x9aa0aa, { metalness: 0.4 }));
  frame.position.set(0, 1.5, zw + 0.1);
  group.add(frame);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 2.2),
    new THREE.MeshStandardMaterial({ map: makeWhiteboardTexture(), roughness: 0.5, emissive: 0x222222 }),
  );
  board.position.set(0, 1.5, zw + 0.16);
  group.add(board);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.06, 0.18), mat(0x7c828c, { metalness: 0.3 }));
  tray.position.set(0, 0.36, zw + 0.2);
  group.add(tray);

  const proj = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.5), mat(0xe7e8ea, { metalness: 0.2 }));
  proj.position.set(0, ROOM.height - 0.4, -1.5);
  proj.castShadow = true;
  group.add(proj);

  // horloge AU-DESSUS du tableau
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 18), mat(0xf8fafc));
  clock.rotation.x = Math.PI / 2;
  clock.position.set(0, 3.0, zw + 0.16);
  group.add(clock);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 20), mat(0x2b2f3a));
  ring.position.set(0, 3.0, zw + 0.16);
  group.add(ring);
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.02), mat(0x111318));
  hourHand.position.set(0, 3.03, zw + 0.2);
  group.add(hourHand);
  const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.02), mat(0x111318));
  minHand.position.set(0.04, 3.0, zw + 0.2);
  group.add(minHand);
  // (la porte à droite du tableau est désormais une vraie ouverture vers le
  //  couloir, construite avec un rebord jaune dans buildNorthWing)
}

/** Mur droit (+x) : ouverture dans le mur + porte OUVERTE donnant sur une autre salle. */
function buildRightWall(group: THREE.Group, colliders: THREE.Box3[]): void {
  const { halfX, halfZ, height } = ROOM;
  const x = halfX;
  const doorHalf = 0.55;
  const doorTop = 2.255;
  const fw = 0.12;
  const openHalf = doorHalf + fw; // demi-ouverture (cadre compris)

  // mur SOLIDE (boîtes) : visible et occlusif des deux côtés
  const wallMat = mat(0xd9dde4);
  const accentMat = mat(0x2f3645);
  const seg = (w: number, zc: number, yc: number, h: number) => {
    // mur fin (0.06) pour que le mobilier collé ne s'y enfonce pas
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, w), wallMat);
    m.position.set(x, yc, zc);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  };
  const segLen = halfZ - openHalf;
  seg(segLen, -(halfZ + openHalf) / 2, height / 2, height); // segment côté -z
  seg(segLen, (halfZ + openHalf) / 2, height / 2, height); // segment côté +z
  seg(openHalf * 2, 0, (doorTop + fw + height) / 2, height - (doorTop + fw)); // imposte au-dessus
  for (const zc of [-(halfZ + openHalf) / 2, (halfZ + openHalf) / 2]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, segLen), accentMat);
    band.position.set(x, 0.14, zc);
    group.add(band);
  }
  // collisions des segments de mur (l'ouverture reste franchissable)
  colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.15, 0, -halfZ), new THREE.Vector3(x + 0.15, height, -openHalf)));
  colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.15, 0, openHalf), new THREE.Vector3(x + 0.15, height, halfZ)));

  // cadre marron de l'ouverture (montants + linteau)
  const jambMat = mat(0x7a5530, { roughness: 0.7 });
  for (const sz of [-(doorHalf + fw / 2), doorHalf + fw / 2]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.14, doorTop + fw, fw), jambMat);
    jamb.position.set(x - 0.06, (doorTop + fw) / 2, sz);
    group.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.14, fw, doorHalf * 2 + fw * 2), jambMat);
  lintel.position.set(x - 0.06, doorTop + fw / 2, 0);
  group.add(lintel);

  // porte OUVERTE : charnière côté +z (opposé), bat vers la salle voisine
  const pivot = new THREE.Group();
  pivot.position.set(x - 0.06, 0, doorHalf);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.25, doorHalf * 2), mat(0x6b4f3a));
  door.position.set(0, 1.13, -doorHalf);
  door.castShadow = true;
  pivot.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), mat(0xd4af37, { metalness: 0.6 }));
  knob.position.set(-0.07, 1.1, -(doorHalf * 2 - 0.14));
  pivot.add(knob);
  pivot.rotation.y = -Math.PI * 0.52; // ~94° ouvert
  group.add(pivot);

  buildAdjacentRoom(group, colliders);
}

/** Petite salle voisine, accessible par la porte ouverte (au-delà du mur +x). */
function buildAdjacentRoom(group: THREE.Group, colliders: THREE.Box3[]): void {
  const { halfX, halfZ, height } = ROOM;
  const D = ADJACENT_DEPTH;
  const x1 = halfX + D; // mur du fond de la salle voisine
  const cx = halfX + D / 2;

  // (le sol est commun : déjà posé par la coquille)

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(D, halfZ * 2), mat(0xced2da));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, height, 0);
  group.add(ceil);

  const wallMat = mat(0xd2d6dd);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.08, height, halfZ * 2), wallMat);
  back.position.set(x1, height / 2, 0);
  back.castShadow = true;
  back.receiveShadow = true;
  group.add(back);
  // collider du mur du fond de la salle voisine (la salle serveur est au-delà)
  colliders.push(
    new THREE.Box3(
      new THREE.Vector3(x1 - 0.06, 0, -halfZ),
      new THREE.Vector3(x1 + 0.06, height, halfZ),
    ),
  );
  const sideA = new THREE.Mesh(new THREE.BoxGeometry(D, height, 0.08), wallMat);
  sideA.position.set(cx, height / 2, -halfZ);
  sideA.castShadow = true;
  sideA.receiveShadow = true;
  group.add(sideA);
  // collider du mur avant de la salle voisine (confine vers le -z)
  colliders.push(
    new THREE.Box3(
      new THREE.Vector3(halfX, 0, -halfZ - 0.06),
      new THREE.Vector3(x1, height, -halfZ + 0.06),
    ),
  );
  const sideB = new THREE.Mesh(new THREE.BoxGeometry(D, height, 0.08), wallMat);
  sideB.position.set(cx, height / 2, halfZ);
  sideB.rotation.y = Math.PI;
  sideB.castShadow = true;
  sideB.receiveShadow = true;
  group.add(sideB);

  // (tableau et fenêtre fixes retirés — à placer via l'éditeur si besoin)
  // (le mobilier de la salle voisine est désormais éditable via la map)

  // éclairage de la salle voisine (caissons partout, 1 lumière sur 2)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 1.4 });
  let li = 0;
  for (let lx = halfX + 3; lx < x1 - 1; lx += 4.5) {
    for (const lz of [-2.5, 2.5]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.5), lampMat);
      lamp.position.set(lx, height - 0.1, lz);
      group.add(lamp);
      if (li++ % 2 === 0) {
        const pl = new THREE.PointLight(0xfff2d4, 0.6, 9, 2);
        pl.position.set(lx, height - 0.5, lz);
        group.add(pl);
      }
    }
  }
}

function buildLeftWall(group: THREE.Group): void {
  const { halfX } = ROOM;
  const add = (kind: 'reseau' | 'code', z: number) => {
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.6), new THREE.MeshStandardMaterial({ map: makePosterTexture(kind), roughness: 0.8 }));
    poster.position.set(-halfX + 0.09, 1.9, z);
    poster.rotation.y = Math.PI / 2;
    group.add(poster);
  };
  add('reseau', -2.5);
  add('code', 2.5);
}

function buildCeilingLights(group: THREE.Group): void {
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 1.6 });
  const housing = mat(0xb4b8c0, { metalness: 0.3 });
  for (const p of CEILING_LIGHTS) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.7), housing);
    frame.position.set(p.x, ROOM.height - 0.06, p.z);
    group.add(frame);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.5), lampMat);
    lamp.position.set(p.x, ROOM.height - 0.12, p.z);
    group.add(lamp);
  }
}

/**
 * Aile nord (au-delà du mur avant z = -6.5) : couloir fermé derrière la porte
 * jaune, salle serveur au bout, salle de classe sur le côté. Sols, plafonds,
 * murs (avec colliders) et ouvertures.
 */
function buildNorthWing(group: THREE.Group, colliders: THREE.Box3[]): void {
  const H = ROOM.height;
  const wallMat = mat(0xd9dde4);

  const addFloor = (x0: number, z0: number, x1: number, z1: number) => {
    const w = x1 - x0;
    const d = z1 - z0;
    const t = makeFloorTexture();
    t.repeat.set(Math.max(1, Math.round(w / 2.2)), Math.max(1, Math.round(d / 2.2)));
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0xffffff, { map: t, roughness: 1 }));
    f.rotation.x = -Math.PI / 2;
    f.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    f.receiveShadow = true;
    group.add(f);
  };
  const addCeil = (x0: number, z0: number, x1: number, z1: number) => {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat(0xced2da));
    c.rotation.x = Math.PI / 2;
    c.position.set((x0 + x1) / 2, H, (z0 + z1) / 2);
    group.add(c);
  };
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const w = alongX ? Math.abs(x1 - x0) : 0.08;
    const d = alongX ? 0.08 : Math.abs(z1 - z0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat);
    m.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    pushWallBox(colliders, x0, z0, x1, z1, H);
  };
  // caisson lumineux ; n'émet une vraie lumière que si `light` (perf : moins de
  // point lights à évaluer par fragment, les autres restent juste émissifs)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 1.5 });
  const lamp = (x: number, z: number, light = true) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.4), lampMat);
    b.position.set(x, H - 0.08, z);
    group.add(b);
    if (!light) return;
    const pl = new THREE.PointLight(0xfff2d4, 0.6, 8, 2);
    pl.position.set(x, H - 0.4, z);
    group.add(pl);
  };

  // sols + plafonds
  addFloor(-27, -10, 33, -6.5);
  addCeil(-27, -10, 33, -6.5); // couloir (long : le long de tout le mur avant)
  addFloor(-27, -6.5, -11, 6.5);
  addCeil(-27, -6.5, -11, 6.5); // salle de classe (à gauche)
  addFloor(27, -6.5, 33, 6.5);
  addCeil(27, -6.5, 33, 6.5); // salle serveur (à droite)

  // imposte au-dessus d'une porte du mur avant (z=-6.5), pour ne pas voir à travers
  const overDoor = (x0: number, x1: number) => {
    const overTop = 2.44;
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), H - overTop, 0.08), wallMat);
    m.position.set((x0 + x1) / 2, (overTop + H) / 2, -6.5);
    group.add(m);
  };

  // couloir : mur du fond (z=-10) plein + bouts
  wall(-27, -10, 33, -10); // fond
  wall(-27, -10, -27, -6.5); // bout ouest
  wall(33, -10, 33, -6.5); // bout est

  // salle de classe (gauche) : porte sur le couloir (mur avant z=-6.5)
  const cd0 = CLASS_DOOR.center - CLASS_DOOR.half;
  const cd1 = CLASS_DOOR.center + CLASS_DOOR.half;
  wall(-27, -6.5, cd0, -6.5);
  wall(cd1, -6.5, -11, -6.5);
  overDoor(cd0, cd1);
  wall(-27, 6.5, -11, 6.5); // fond
  wall(-27, -6.5, -27, 6.5); // ouest (est = mur ouest de A, déjà posé)

  // salle serveur (droite) : porte sur le couloir (mur avant z=-6.5)
  const sd0 = SERVER_DOOR.center - SERVER_DOOR.half;
  const sd1 = SERVER_DOOR.center + SERVER_DOOR.half;
  wall(27, -6.5, sd0, -6.5);
  wall(sd1, -6.5, 33, -6.5);
  overDoor(sd0, sd1);
  wall(27, 6.5, 33, 6.5); // fond
  wall(33, -6.5, 33, 6.5); // est (ouest = mur est de B, déjà posé)

  // éclairage (1 caisson sur 2 émet de la lumière pour alléger le rendu)
  [-24, -18, -12, -6, 0, 6, 12, 18, 24, 30].forEach((lx, i) => lamp(lx, -8.25, i % 2 === 0)); // couloir
  for (const lz of [-3, 3]) for (const lx of [-22, -16]) lamp(lx, lz, lx === -22); // classe
  lamp(30, -3, true);
  lamp(30, 3, false); // serveur

  buildYellowDoor(group);
  buildClassDoorFrame(group);
  buildServerDoorFrame(group);
  buildServerRacks(group);
}

/** Porte à droite du tableau : rebord JAUNE + battant ouvert vers le couloir. */
function buildYellowDoor(group: THREE.Group): void {
  const z = HALL_DOOR.z;
  const c = HALL_DOOR.center;
  const half = HALL_DOOR.half;
  const top = 2.3;
  const fw = 0.14;
  const yellow = mat(0xeab308, { metalness: 0.3, roughness: 0.55 });
  for (const sx of [c - half, c + half]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(fw, top + fw, 0.22), yellow);
    jamb.position.set(sx, (top + fw) / 2, z);
    jamb.castShadow = true;
    group.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + fw * 2, fw, 0.22), yellow);
  lintel.position.set(c, top + fw / 2, z);
  group.add(lintel);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.05, 0.24), yellow);
  sill.position.set(c, 0.025, z);
  group.add(sill);
  // battant ouvert vers le couloir (-z), charnière côté -x
  const pivot = new THREE.Group();
  pivot.position.set(c - half + 0.03, 0, z);
  const door = new THREE.Mesh(new THREE.BoxGeometry(half * 2 - 0.08, top - 0.06, 0.05), mat(0x6b4f3a));
  door.position.set((half * 2 - 0.08) / 2, (top - 0.06) / 2, 0);
  door.castShadow = true;
  pivot.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), mat(0xd4af37, { metalness: 0.6 }));
  knob.position.set(half * 2 - 0.2, 1.1, 0.06);
  pivot.add(knob);
  pivot.rotation.y = -Math.PI * 0.5; // ~90° ouvert vers l'intérieur de la salle
  group.add(pivot);
}

/** Encadrement de porte sur un mur avant (z constant), ouverture le long de x. */
function buildFrontDoorFrame(group: THREE.Group, z: number, c: number, half: number, color: number, opts = {}): void {
  const top = 2.3;
  const fw = 0.14;
  const m = mat(color, opts);
  for (const sx of [c - half, c + half]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(fw, top + fw, 0.22), m);
    jamb.position.set(sx, (top + fw) / 2, z);
    group.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + fw * 2, fw, 0.22), m);
  lintel.position.set(c, top + fw / 2, z);
  group.add(lintel);
}

/** Encadrement (marron) de la porte couloir → salle de classe (mur avant z=-6.5). */
function buildClassDoorFrame(group: THREE.Group): void {
  buildFrontDoorFrame(group, CLASS_DOOR.z, CLASS_DOOR.center, CLASS_DOOR.half, 0x7a5530, { roughness: 0.7 });
}

/** Encadrement (gris métal) de la porte couloir → salle serveur (mur avant z=-6.5). */
function buildServerDoorFrame(group: THREE.Group): void {
  buildFrontDoorFrame(group, SERVER_DOOR.z, SERVER_DOOR.center, SERVER_DOOR.half, 0x8a929c, { metalness: 0.4 });
}

/** Baies serveur (armoires sombres + LEDs) dans la salle serveur (x 27..32, z -10..-6.5). */
function buildServerRacks(group: THREE.Group): void {
  const rackMat = mat(0x1b1d24, { metalness: 0.4, roughness: 0.5 });
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 2.2 });
  for (const x of [28, 29, 30, 31, 32]) {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.1, 0.8), rackMat);
    rack.position.set(x, 1.05, 6);
    rack.castShadow = true;
    group.add(rack);
    for (let i = 0; i < 5; i++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), ledMat);
      led.position.set(x - 0.22 + (i % 2) * 0.12, 0.55 + i * 0.32, 5.58);
      group.add(led);
    }
  }
}
