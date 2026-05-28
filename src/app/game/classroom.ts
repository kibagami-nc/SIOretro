import * as THREE from 'three';
import { itemCollider, type MapItem, buildItem } from './furniture';
import { makeFloorTexture, makePosterTexture, makeWhiteboardTexture } from './textures';

export const ROOM = { halfX: 11, halfZ: 6.5, height: 3.2 };
/** profondeur de la salle voisine (au-delà du mur +x) */
export const ADJACENT_DEPTH = 16;
export const PLAYER_BOUNDS = {
  minX: -10.4,
  maxX: ROOM.halfX + ADJACENT_DEPTH - 0.6,
  minZ: -5.9,
  maxZ: 5.9,
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
const NO_COLLIDER = new Set<string>(['chair', 'shelf', 'board', 'window', 'opaque', 'louvre', 'louvreTall', 'door']);

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
  const addWall = (w: number, x: number, z: number, rotY: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, height), wallMat);
    m.position.set(x, height / 2, z);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    group.add(m);
    const nx = Math.sin(rotY) * 0.012;
    const nz = Math.cos(rotY) * 0.012;
    const band = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.28), accentMat);
    band.position.set(x + nx, 0.14, z + nz);
    band.rotation.y = rotY;
    group.add(band);
  };
  addWall(halfX * 2, 0, -halfZ, 0);
  addWall(halfX * 2, 0, halfZ, Math.PI);
  addWall(halfZ * 2, -halfX, 0, Math.PI / 2);
  // le mur droit (+x) est construit avec une ouverture dans buildRightWall

  buildBoardWall(group);
  buildRightWall(group, colliders);
  buildLeftWall(group);
  buildCeilingLights(group);
  return { group, colliders };
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
      npcSpawns.push({ pos: new THREE.Vector3(item.x, 0, item.z), rotY: item.rot });
      return;
    }
    // point de spawn du joueur (non rendu en jeu)
    if (item.type === 'spawn') {
      spawn = new THREE.Vector3(item.x, 1.6, item.z);
      spawnRot = item.rot;
      return;
    }
    const obj = buildItem(item.type, i);
    obj.position.set(item.x, 0, item.z);
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
  frame.position.set(0, 1.5, zw + 0.04);
  group.add(frame);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 2.2),
    new THREE.MeshStandardMaterial({ map: makeWhiteboardTexture(), roughness: 0.5, emissive: 0x222222 }),
  );
  board.position.set(0, 1.5, zw + 0.1);
  group.add(board);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.06, 0.18), mat(0x7c828c, { metalness: 0.3 }));
  tray.position.set(0, 0.36, zw + 0.14);
  group.add(tray);

  const proj = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.5), mat(0xe7e8ea, { metalness: 0.2 }));
  proj.position.set(0, ROOM.height - 0.4, -1.5);
  proj.castShadow = true;
  group.add(proj);

  // horloge AU-DESSUS du tableau
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 18), mat(0xf8fafc));
  clock.rotation.x = Math.PI / 2;
  clock.position.set(0, 3.0, zw + 0.1);
  group.add(clock);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 20), mat(0x2b2f3a));
  ring.position.set(0, 3.0, zw + 0.1);
  group.add(ring);
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.02), mat(0x111318));
  hourHand.position.set(0, 3.03, zw + 0.14);
  group.add(hourHand);
  const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.02), mat(0x111318));
  minHand.position.set(0.04, 3.0, zw + 0.14);
  group.add(minHand);

  // porte au milieu entre le bord droit du tableau (~3.15) et le coin du mur (halfX)
  const dx = (3.15 + halfX) / 2;
  const doorHalf = 0.55; // demi-largeur de la porte
  const doorTop = 2.255; // haut de la porte (1.13 + 2.25/2)
  const fw = 0.12; // épaisseur du cadre
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2, 2.25, 0.08), mat(0x6b4f3a));
  door.position.set(dx, 1.13, zw + 0.1);
  group.add(door);

  // encadrement marron collé à la porte (montants + linteau + seuil), sans jeu
  const jambMat = mat(0x7a5530, { roughness: 0.7 });
  for (const sx of [dx - (doorHalf + fw / 2), dx + (doorHalf + fw / 2)]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(fw, doorTop + fw, 0.14), jambMat);
    jamb.position.set(sx, (doorTop + fw) / 2, zw + 0.08);
    group.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2 + fw * 2, fw, 0.14), jambMat);
  lintel.position.set(dx, doorTop + fw / 2, zw + 0.08);
  group.add(lintel);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2, 0.05, 0.16), jambMat);
  sill.position.set(dx, 0.025, zw + 0.08);
  group.add(sill);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), mat(0xd4af37, { metalness: 0.6 }));
  knob.position.set(dx - 0.42, 1.1, zw + 0.16);
  group.add(knob);
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
  const back = new THREE.Mesh(new THREE.PlaneGeometry(halfZ * 2, height), wallMat);
  back.position.set(x1, height / 2, 0);
  back.rotation.y = -Math.PI / 2;
  group.add(back);
  const sideA = new THREE.Mesh(new THREE.PlaneGeometry(D, height), wallMat);
  sideA.position.set(cx, height / 2, -halfZ);
  group.add(sideA);
  const sideB = new THREE.Mesh(new THREE.PlaneGeometry(D, height), wallMat);
  sideB.position.set(cx, height / 2, halfZ);
  sideB.rotation.y = Math.PI;
  group.add(sideB);

  // (tableau et fenêtre fixes retirés — à placer via l'éditeur si besoin)
  // (le mobilier de la salle voisine est désormais éditable via la map)

  // éclairage de la salle voisine (grille sur toute la profondeur)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 1.4 });
  for (let lx = halfX + 3; lx < x1 - 1; lx += 4.5) {
    for (const lz of [-2.5, 2.5]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.5), lampMat);
      lamp.position.set(lx, height - 0.1, lz);
      group.add(lamp);
      const pl = new THREE.PointLight(0xfff2d4, 0.5, 13, 2);
      pl.position.set(lx, height - 0.5, lz);
      group.add(pl);
    }
  }
}

function buildLeftWall(group: THREE.Group): void {
  const { halfX } = ROOM;
  const add = (kind: 'reseau' | 'code', z: number) => {
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.6), new THREE.MeshStandardMaterial({ map: makePosterTexture(kind), roughness: 0.8 }));
    poster.position.set(-halfX + 0.04, 1.9, z);
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
