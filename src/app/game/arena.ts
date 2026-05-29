import * as THREE from 'three';
import type { Character } from '../characters';
import { buildCharacter } from './character-model';

/**
 * Arène de boss isolée, posée très loin de la salle de classe (x≈200) pour que
 * les colliders/lumières de la salle n'interfèrent jamais. On y téléporte le
 * joueur pour le combat contre Joey, puis on le ramène à sa position d'origine.
 */
export const ARENA_ORIGIN = new THREE.Vector3(200, 0, 0);
export const ARENA_HALF = 9;
export const ARENA_BOUNDS = {
  minX: ARENA_ORIGIN.x - ARENA_HALF + 0.6,
  maxX: ARENA_ORIGIN.x + ARENA_HALF - 0.6,
  minZ: ARENA_ORIGIN.z - ARENA_HALF + 0.6,
  maxZ: ARENA_ORIGIN.z + ARENA_HALF - 0.6,
};

export interface ArenaDonut {
  mesh: THREE.Group;
  present: boolean;
  /** temps restant avant réapparition (s) ; 0 = présent */
  respawn: number;
  home: THREE.Vector3;
}

export interface ArenaScene {
  group: THREE.Group;
  /** modèle complet (4x4 + Joey assis dessus) à déplacer chaque frame */
  rig: THREE.Group;
  /** le 4x4 seul (sert d'orientation) */
  truck: THREE.Group;
  donuts: ArenaDonut[];
}

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, ...opts });
}

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true;
  return m;
}

/** Beignet : pâte (tore brun) + glaçage rose, posé à plat, tourne sur lui-même. */
export function buildDonut(): THREE.Group {
  const g = new THREE.Group();
  const dough = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.075, 8, 14), mat(0xc8862f));
  dough.rotation.x = Math.PI / 2;
  dough.castShadow = true;
  g.add(dough);
  const icing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.06, 8, 14), mat(0xf472b6, { roughness: 0.5 }));
  icing.rotation.x = Math.PI / 2;
  icing.position.y = 0.03;
  g.add(icing);
  // quelques vermicelles
  const sprinkleColors = [0x60a5fa, 0xfacc15, 0xffffff, 0x4ade80];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.03), mat(sprinkleColors[i % 4]));
    const a = (i / 6) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.16, 0.07, Math.sin(a) * 0.16);
    g.add(s);
  }
  return g;
}

/** Mini-Raphaël : version réduite et bon marché du personnage captif (projectile). */
export function buildMiniRaphael(captive: Character): THREE.Group {
  const g = new THREE.Group();
  const body = box(0.26, 0.3, 0.2, captive.color);
  body.position.y = 0.2;
  g.add(body);
  const head = box(0.24, 0.24, 0.24, captive.skin ?? 0xf1c9a5);
  head.position.y = 0.46;
  g.add(head);
  const hair = box(0.27, 0.1, 0.27, captive.accent);
  hair.position.y = 0.6;
  g.add(hair);
  for (const sx of [-0.06, 0.06]) {
    const eye = box(0.04, 0.05, 0.02, 0x10131a);
    eye.position.set(sx, 0.48, 0.12);
    g.add(eye);
  }
  g.scale.setScalar(0.9);
  return g;
}

/** Raphaël zombie : variante verdâtre et titubante (ennemi de la phase finale). */
export function buildZombieRaphael(captive: Character): THREE.Group {
  const g = new THREE.Group();
  const body = box(0.3, 0.5, 0.24, 0x4b5d3a); // vêtement crasseux
  body.position.y = 0.5;
  g.add(body);
  const head = box(0.3, 0.3, 0.3, 0x8aa66a); // peau verdâtre
  head.position.y = 0.92;
  g.add(head);
  const hair = box(0.33, 0.12, 0.33, captive.accent);
  hair.position.y = 1.1;
  g.add(hair);
  // yeux rouges
  for (const sx of [-0.07, 0.07]) {
    const eye = box(0.06, 0.06, 0.02, 0xef4444);
    eye.position.set(sx, 0.94, 0.16);
    g.add(eye);
  }
  // bras tendus vers l'avant (façon zombie)
  for (const sx of [-0.22, 0.22]) {
    const arm = box(0.12, 0.12, 0.4, 0x8aa66a);
    arm.position.set(sx, 0.6, 0.22);
    g.add(arm);
  }
  for (const sx of [-0.09, 0.09]) {
    const leg = box(0.13, 0.4, 0.16, 0x2b2b3a);
    leg.position.set(sx, 0.2, 0);
    g.add(leg);
  }
  return g;
}

/** 4x4 / pick-up trapu : châssis, cabine, gros pneus, pare-buffle. */
export function buildTruck(color: number): THREE.Group {
  const g = new THREE.Group();
  const accent = 0x111827;

  const chassis = box(2.4, 0.55, 1.6, color);
  chassis.position.y = 0.85;
  g.add(chassis);

  const bed = box(2.5, 0.18, 1.7, accent);
  bed.position.y = 1.16;
  g.add(bed);

  const cabin = box(1.2, 0.6, 1.45, color);
  cabin.position.set(-0.35, 1.45, 0);
  g.add(cabin);

  const windshield = box(0.08, 0.4, 1.2, 0x1e293b);
  windshield.position.set(0.28, 1.5, 0);
  g.add(windshield);

  // pare-buffle avant
  const bull = box(0.18, 0.7, 1.7, 0x9ca3af);
  bull.position.set(1.28, 0.95, 0);
  g.add(bull);
  for (const sz of [-0.5, 0.5]) {
    const barUp = box(0.12, 0.5, 0.12, 0x9ca3af);
    barUp.position.set(1.28, 1.35, sz);
    g.add(barUp);
  }

  // gros pneus
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.45, 12);
  for (const wx of [-0.85, 0.85]) {
    for (const wz of [-0.85, 0.85]) {
      const wheel = new THREE.Mesh(wheelGeo, mat(0x1b1b22, { roughness: 0.95 }));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.5, wz);
      wheel.castShadow = true;
      g.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.47, 8), mat(0xcbd5e1));
      hub.rotation.x = Math.PI / 2;
      hub.position.set(wx, 0.5, wz);
      g.add(hub);
    }
  }
  return g;
}

/**
 * Construit l'arène complète : sol, murs, éclairage propre (la lumière de la
 * salle ne porte pas jusqu'ici), Joey juché sur son 4x4 et des beignets au sol.
 */
export function buildArena(villain: Character, captive: Character): ArenaScene {
  const group = new THREE.Group();
  group.position.copy(ARENA_ORIGIN);

  // --- sol ---
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(ARENA_HALF * 2, 0.4, ARENA_HALF * 2),
    mat(0x3a3326, { roughness: 1 }),
  );
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  group.add(floor);

  // damier sablonneux pour repère visuel
  for (let i = -ARENA_HALF + 1; i < ARENA_HALF; i += 3) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(ARENA_HALF * 2 - 1, 0.02, 0.12), mat(0x4d4636));
    line.position.set(0, 0.01, i);
    group.add(line);
    const line2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, ARENA_HALF * 2 - 1), mat(0x4d4636));
    line2.position.set(i, 0.01, 0);
    group.add(line2);
  }

  // --- murs de l'arène ---
  const wallH = 3;
  const wallMat = mat(0x5b3a2e, { roughness: 1 });
  const walls: [number, number, number, number, number][] = [
    [0, wallH / 2, -ARENA_HALF, ARENA_HALF * 2, 0.6],
    [0, wallH / 2, ARENA_HALF, ARENA_HALF * 2, 0.6],
    [-ARENA_HALF, wallH / 2, 0, 0.6, ARENA_HALF * 2],
    [ARENA_HALF, wallH / 2, 0, 0.6, ARENA_HALF * 2],
  ];
  for (const [x, y, z, w, d] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
    wall.position.set(x, y, z);
    wall.receiveShadow = true;
    group.add(wall);
  }

  // --- éclairage propre (la lumière directionnelle de la salle ne porte pas ici) ---
  const amb = new THREE.PointLight(0xfff0d0, 1.1, 40, 1.5);
  amb.position.set(0, 7, 0);
  group.add(amb);
  const fill = new THREE.PointLight(0xbfd4ff, 0.5, 40, 1.5);
  fill.position.set(0, 4, 7);
  group.add(fill);

  // --- Joey sur son 4x4 ---
  const rig = new THREE.Group();
  const truck = buildTruck(0x7f1d1d);
  rig.add(truck);
  const joey = buildCharacter(villain);
  // assis sur la benne, légèrement en arrière
  joey.position.set(-0.35, 1.25, 0);
  joey.scale.setScalar(0.85);
  rig.add(joey);
  rig.position.set(0, 0, -ARENA_HALF + 2.5);
  group.add(rig);

  // --- beignets répartis dans TOUTE l'arène (grille régulière + petit décalage) ---
  const donuts: ArenaDonut[] = [];
  const reach = ARENA_HALF - 1.5;
  const step = 2.6;
  for (let x = -reach; x <= reach; x += step) {
    for (let z = -reach; z <= reach; z += step) {
      // léger décalage pseudo-aléatoire pour casser l'effet « quadrillage »
      const jx = ((Math.sin(x * 12.9 + z * 4.1) + 1) % 1) * 0.8 - 0.4;
      const jz = ((Math.cos(x * 7.7 + z * 9.3) + 1) % 1) * 0.8 - 0.4;
      const mesh = buildDonut();
      const home = new THREE.Vector3(x + jx, 0.35, z + jz);
      mesh.position.copy(home);
      group.add(mesh);
      donuts.push({ mesh, present: true, respawn: 0, home });
    }
  }

  return { group, rig, truck, donuts };
}
