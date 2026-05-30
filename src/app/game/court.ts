import * as THREE from 'three';
import type { Character } from '../characters';
import { buildCharacter } from './character-model';

/**
 * Terrain de basket isolé, posé très loin de la salle (z≈200) pour que rien
 * n'interfère. On y téléporte le joueur pour le 1v1 contre Louis (chacun son
 * tour pour marquer), puis on le ramène à sa position d'origine.
 */
export const COURT_ORIGIN = new THREE.Vector3(0, 0, 200);
export const COURT_HALFX = 7;
export const COURT_HALFZ = 10;
export const COURT_BOUNDS = {
  minX: COURT_ORIGIN.x - COURT_HALFX + 0.6,
  maxX: COURT_ORIGIN.x + COURT_HALFX - 0.6,
  minZ: COURT_ORIGIN.z - COURT_HALFZ + 0.6,
  maxZ: COURT_ORIGIN.z + COURT_HALFZ - 0.6,
};

/** Position de l'arceau, en coordonnées LOCALES au groupe (groupe à l'origine). */
export const RIM = new THREE.Vector3(0, 3.05, -7.5);
export const RIM_RADIUS = 0.45;

export interface CourtScene {
  group: THREE.Group;
  ball: THREE.Group;
  louis: THREE.Group;
}

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...opts });
}

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true;
  return m;
}

/** Ballon de basket : sphère orange + coutures sombres. */
export function buildBall(): THREE.Group {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 12), mat(0xff8c2b, { roughness: 0.6 }));
  ball.castShadow = true;
  g.add(ball);
  // coutures
  const seamMat = mat(0x7a3b12, { roughness: 0.7 });
  const seam1 = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.012, 6, 20), seamMat);
  g.add(seam1);
  const seam2 = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.012, 6, 20), seamMat);
  seam2.rotation.y = Math.PI / 2;
  g.add(seam2);
  const seam3 = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.012, 6, 20), seamMat);
  seam3.rotation.x = Math.PI / 2;
  g.add(seam3);
  return g;
}

/** Panneau + arceau + filet, posés autour de RIM. */
function buildHoop(group: THREE.Group): void {
  // poteau
  const post = box(0.22, 4.2, 0.22, 0xcbd5e1);
  post.position.set(RIM.x, 2.1, RIM.z - 0.9);
  group.add(post);
  // potence
  const arm = box(0.9, 0.16, 0.16, 0xcbd5e1);
  arm.position.set(RIM.x, RIM.y + 0.45, RIM.z - 0.5);
  group.add(arm);
  // panneau
  const board = box(2.0, 1.3, 0.12, 0xf2f4f8);
  board.position.set(RIM.x, RIM.y + 0.45, RIM.z - 0.18);
  group.add(board);
  // carré du panneau
  const square = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.5, 0.02),
    mat(0xe0532b, { emissive: 0x401005, roughness: 0.6 }),
  );
  square.position.set(RIM.x, RIM.y + 0.25, RIM.z - 0.11);
  group.add(square);
  // arceau (anneau orange)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_RADIUS, 0.04, 8, 20), mat(0xff6b35, { roughness: 0.5 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.copy(RIM);
  group.add(rim);
  // filet (petits segments verticaux convergents)
  const netMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  const seg = 10;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x0 = RIM.x + Math.cos(a) * RIM_RADIUS;
    const z0 = RIM.z + Math.sin(a) * RIM_RADIUS;
    const x1 = RIM.x + Math.cos(a) * RIM_RADIUS * 0.4;
    const z1 = RIM.z + Math.sin(a) * RIM_RADIUS * 0.4;
    const len = 0.55;
    const strand = new THREE.Mesh(new THREE.BoxGeometry(0.015, len, 0.015), netMat);
    strand.position.set((x0 + x1) / 2, RIM.y - len / 2, (z0 + z1) / 2);
    group.add(strand);
  }
}

/**
 * Construit le terrain complet : parquet, lignes, panier, éclairage propre
 * (la lumière de la salle ne porte pas jusqu'ici), Louis et le ballon.
 */
export function buildCourt(opponent: Character): CourtScene {
  const group = new THREE.Group();
  group.position.copy(COURT_ORIGIN);

  // --- parquet ---
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(COURT_HALFX * 2, 0.4, COURT_HALFZ * 2),
    mat(0xc08a4a, { roughness: 1 }),
  );
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  group.add(floor);

  // lattes du parquet
  for (let x = -COURT_HALFX + 1; x < COURT_HALFX; x += 1.4) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, COURT_HALFZ * 2 - 0.4), mat(0xa9743a));
    plank.position.set(x, 0.01, 0);
    group.add(plank);
  }

  // lignes du terrain (peinture blanche)
  const lineMat = mat(0xf4f4e8, { roughness: 0.9 });
  const baseline = new THREE.Mesh(new THREE.BoxGeometry(COURT_HALFX * 2 - 1, 0.02, 0.1), lineMat);
  baseline.position.set(0, 0.02, RIM.z + 1.2);
  group.add(baseline);
  // demi-cercle de la raquette
  const key = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.5, 24, 1, 0, Math.PI), lineMat);
  key.rotation.x = -Math.PI / 2;
  key.position.set(RIM.x, 0.02, RIM.z + 1.2);
  group.add(key);

  // --- murs/gradins bas pour fermer l'espace ---
  const wallMat = mat(0x2b3350, { roughness: 1 });
  const wallH = 4;
  const walls: [number, number, number, number, number][] = [
    [0, wallH / 2, -COURT_HALFZ, COURT_HALFX * 2, 0.6],
    [0, wallH / 2, COURT_HALFZ, COURT_HALFX * 2, 0.6],
    [-COURT_HALFX, wallH / 2, 0, 0.6, COURT_HALFZ * 2],
    [COURT_HALFX, wallH / 2, 0, 0.6, COURT_HALFZ * 2],
  ];
  for (const [x, y, z, w, d] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
    wall.position.set(x, y, z);
    wall.receiveShadow = true;
    group.add(wall);
  }

  // --- éclairage propre ---
  const key1 = new THREE.PointLight(0xfff0d0, 1.1, 50, 1.4);
  key1.position.set(0, 8, 2);
  group.add(key1);
  const fill = new THREE.PointLight(0xbfd4ff, 0.5, 50, 1.4);
  fill.position.set(0, 5, COURT_HALFZ - 1);
  group.add(fill);

  buildHoop(group);

  // --- Louis (adversaire) près de la raquette ---
  const louis = buildCharacter(opponent);
  louis.position.set(2.2, 0, RIM.z + 2);
  louis.rotation.y = Math.PI; // face au panier
  group.add(louis);

  // --- ballon ---
  const ball = buildBall();
  ball.position.set(0, 1.1, COURT_HALFZ - 4);
  group.add(ball);

  return { group, ball, louis };
}
