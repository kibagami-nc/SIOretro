/**
 * Plan partagé de tout le niveau (salles + couloir). Sert de source unique
 * pour : le sol/plafond/murs de la salle, les limites du joueur en jeu, et la
 * caméra / grille / aimantation / limites de placement de l'éditeur.
 *
 * Repère : x vers la droite, z vers l'avant. Toutes les zones sont des
 * rectangles alignés sur les axes.
 */

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Toutes les zones jouables et éditables. */
export const ROOMS: Rect[] = [
  { x0: -27, x1: -11, z0: -6.5, z1: 6.5 }, // salle de classe (à gauche), accès par le couloir
  { x0: -11, x1: 11, z0: -6.5, z1: 6.5 }, // salle principale (A)
  { x0: 11, x1: 27, z0: -6.5, z1: 6.5 }, // salle voisine (B)
  { x0: 27, x1: 33, z0: -6.5, z1: 6.5 }, // salle serveur (petite, à droite), accès par le couloir
  { x0: -27, x1: 33, z0: -10, z1: -6.5 }, // couloir : long, le long de tout le mur avant
];

/** Boîte englobante de tout le plan. */
export const PLAN = {
  minX: Math.min(...ROOMS.map((r) => r.x0)),
  maxX: Math.max(...ROOMS.map((r) => r.x1)),
  minZ: Math.min(...ROOMS.map((r) => r.z0)),
  maxZ: Math.max(...ROOMS.map((r) => r.z1)),
  get cx() {
    return (this.minX + this.maxX) / 2;
  },
  get cz() {
    return (this.minZ + this.maxZ) / 2;
  },
  get spanX() {
    return this.maxX - this.minX;
  },
  get spanZ() {
    return this.maxZ - this.minZ;
  },
};

/**
 * Porte jaune (à droite du tableau de la salle A) ouvrant sur le couloir.
 * Ouverture sur le mur avant z = -6.5.
 */
export const HALL_DOOR = { center: 7.075, half: 0.7, z: -6.5 };
/** Porte couloir → salle de classe (mur avant z = -6.5), vers la gauche du mur. */
export const CLASS_DOOR = { z: -6.5, center: -24.5, half: 0.9 };
/** Porte couloir → salle serveur (dans le mur avant du serveur, z = -6.5). */
export const SERVER_DOOR = { z: -6.5, center: 30, half: 0.9 };

/** Vrai si (x,z) est à l'intérieur d'une zone (avec une marge pour les murs). */
export function inAnyRoom(x: number, z: number, margin = 0.5): boolean {
  return ROOMS.some(
    (r) => x > r.x0 + margin && x < r.x1 - margin && z > r.z0 + margin && z < r.z1 - margin,
  );
}

export interface SnapWall {
  axis: 'x' | 'z';
  p: number;
  baseRot: number;
  inward: number;
  aMin: number;
  aMax: number;
}

/** Murs intérieurs de chaque salle, pour l'aimantation dans l'éditeur. */
export function snapWalls(): SnapWall[] {
  const walls: SnapWall[] = [];
  for (const r of ROOMS) {
    walls.push({ axis: 'x', p: r.x0, baseRot: -Math.PI / 2, inward: 1, aMin: r.z0, aMax: r.z1 });
    walls.push({ axis: 'x', p: r.x1, baseRot: Math.PI / 2, inward: -1, aMin: r.z0, aMax: r.z1 });
    walls.push({ axis: 'z', p: r.z0, baseRot: Math.PI, inward: 1, aMin: r.x0, aMax: r.x1 });
    walls.push({ axis: 'z', p: r.z1, baseRot: 0, inward: -1, aMin: r.x0, aMax: r.x1 });
  }
  return walls;
}
