import * as THREE from 'three';
import type { Character } from '../characters';

const SKIN_TONES = [0xf1c9a5, 0xe0ac8b, 0xc68642, 0x8d5524, 0xffdbac];
const PANTS = [0x2b2b3a, 0x39435a, 0x4a3b2a, 0x222730];
const SHOES = 0x16161e;
const EYE = 0x10131a;

function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function box(w: number, h: number, d: number, color: number, flat = true): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color, flatShading: flat, roughness: 0.82 });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

const MOUTH = 0x6b3f33;

/**
 * Personnage cubique (voxel) à partir d'une fiche, avec variations
 * (teint, coiffure, lunettes) dérivées de l'id, et morphologie normale ou
 * obèse. Origine au sol (y=0), face avant vers +z.
 */
export function buildCharacter(char: Character): THREE.Group {
  const g = new THREE.Group();
  const h = hash(char.id);
  const skin = char.skin ?? SKIN_TONES[h % SKIN_TONES.length];
  // décalages non signés (>>>) : sinon un hash dont le bit de poids fort est à 1
  // donne un index négatif et une couleur indéfinie (pantalon blanc par défaut).
  const pants = PANTS[(h >>> 3) % PANTS.length];
  const hairStyle = (h >>> 5) % 4;
  const glasses = ((h >>> 7) & 1) === 1;
  const obese = char.build === 'obese';
  const hairColor = char.accent;

  // --- morphologie ---
  const torsoW = obese ? 0.9 : 0.6;
  const torsoH = 0.64;
  const torsoD = obese ? 0.54 : 0.34;
  const torsoY = 1.2; // centre du torse
  const legX = obese ? 0.19 : 0.14;
  const legW = obese ? 0.3 : 0.22;
  const armW = obese ? 0.26 : 0.18;
  const armD = obese ? 0.3 : 0.22;
  const armX = torsoW / 2 + armW / 2 - 0.01; // collé au flanc, légèrement détaché
  const headW = obese ? 0.56 : 0.46;
  const headFrontZ = 0.24; // demi-profondeur de la tête (0.48 / 2)

  // --- jambes + chaussures ---
  // chaussure du talon (légèrement derrière la jambe) jusqu'à la pointe ;
  // son arrière dépasse de 0.02 le plan de la jambe pour éviter le z-fighting.
  for (const sx of [-legX, legX]) {
    const leg = box(legW, 0.74, 0.28, pants);
    leg.position.set(sx, 0.42, 0);
    g.add(leg);
    const shoe = box(legW + 0.04, 0.14, 0.44, SHOES);
    shoe.position.set(sx, 0.07, 0.06);
    g.add(shoe);
  }

  // --- bassin (relie les jambes au torse) ---
  // profondeur/largeur en retrait du torse pour éviter le z-fighting à la taille
  const pelvis = box(torsoW - 0.08, 0.22, torsoD - 0.04, pants);
  pelvis.position.set(0, 0.88, 0);
  g.add(pelvis);

  // --- torse + bedaine (obèse) ---
  const torso = box(torsoW, torsoH, torsoD, char.color);
  torso.position.set(0, torsoY, 0);
  g.add(torso);

  // surface du buste où poser le badge (devant le ventre si obèse)
  let chestZ = torsoD / 2;
  if (obese) {
    const bellyD = torsoD + 0.06;
    const belly = box(torsoW - 0.04, 0.52, bellyD, char.color);
    belly.position.set(0, 1.0, 0.08);
    g.add(belly);
    chestZ = 0.08 + bellyD / 2;
  }

  // --- cordon + badge, plaqués sur le buste (plus de flottement) ---
  const strapY = obese ? 1.22 : 1.32;
  const strapH = obese ? 0.16 : 0.3;
  const badgeY = obese ? 1.06 : 1.14;
  const strap = box(0.06, strapH, 0.02, char.accent);
  strap.position.set(0.1, strapY, chestZ + 0.04);
  g.add(strap);
  const badge = box(0.17, 0.12, 0.02, 0xf8fafc);
  badge.position.set(0.1, badgeY, chestZ + 0.08);
  g.add(badge);

  // --- bras + mains ---
  for (const sx of [-armX, armX]) {
    const arm = box(armW, 0.62, armD, char.color);
    arm.position.set(sx, torsoY + 0.02, 0);
    g.add(arm);
    const hand = box(armW, 0.16, armD, skin);
    hand.position.set(sx, torsoY - 0.36, 0.02);
    g.add(hand);
  }

  // --- cou (large = double menton si obèse) ---
  const neck = box(obese ? 0.34 : 0.2, 0.14, obese ? 0.3 : 0.2, skin);
  neck.position.set(0, 1.6, 0);
  g.add(neck);

  // --- tête ---
  const head = box(headW, 0.5, 0.48, skin);
  head.position.set(0, 1.9, 0);
  g.add(head);
  // oreilles
  for (const sx of [-headW / 2 - 0.01, headW / 2 + 0.01]) {
    const ear = box(0.05, 0.13, 0.13, skin);
    ear.position.set(sx, 1.88, 0);
    g.add(ear);
  }

  // --- visage ---
  for (const sx of [-0.1, 0.1]) {
    const eye = box(0.09, 0.1, 0.03, EYE);
    eye.position.set(sx, 1.93, headFrontZ);
    g.add(eye);
    const brow = box(0.12, 0.03, 0.02, hairColor);
    brow.position.set(sx, 2.02, headFrontZ);
    g.add(brow);
  }
  const mouth = box(0.18, 0.04, 0.02, MOUTH);
  mouth.position.set(0, 1.78, headFrontZ);
  g.add(mouth);

  // --- lunettes ---
  if (glasses) {
    const bridge = box(0.46, 0.04, 0.03, 0x14161c);
    bridge.position.set(0, 1.95, headFrontZ + 0.02);
    g.add(bridge);
    for (const sx of [-0.1, 0.1]) {
      const lens = box(0.15, 0.13, 0.02, 0x222730);
      lens.position.set(sx, 1.93, headFrontZ + 0.03);
      g.add(lens);
      const rim = box(0.17, 0.15, 0.015, 0x14161c);
      rim.position.set(sx, 1.93, headFrontZ + 0.025);
      g.add(rim);
    }
  }

  // --- cheveux selon le style ---
  buildHair(g, hairStyle, headW, hairColor);

  // taille globale (les pieds restent au sol)
  g.scale.setScalar(0.85);
  return g;
}

/** Coiffure voxel posée sur le sommet de la tête (haut ≈ y 2.15). */
function buildHair(g: THREE.Group, style: number, headW: number, color: number): void {
  const w = headW + 0.02;
  if (style === 0) {
    // coupe courte + frange
    const cap = box(w, 0.12, 0.5, color);
    cap.position.set(0, 2.16, 0);
    g.add(cap);
    const fringe = box(w, 0.1, 0.06, color);
    fringe.position.set(0, 2.06, 0.22);
    g.add(fringe);
  } else if (style === 1) {
    // volume / afro
    const puff = box(w + 0.16, 0.3, 0.62, color);
    puff.position.set(0, 2.22, 0);
    g.add(puff);
    for (const sx of [-(w / 2 + 0.04), w / 2 + 0.04]) {
      const side = box(0.12, 0.26, 0.5, color);
      side.position.set(sx, 2.0, 0);
      g.add(side);
    }
  } else if (style === 2) {
    // crête / pics
    const base = box(w, 0.1, 0.5, color);
    base.position.set(0, 2.13, 0);
    g.add(base);
    for (const dx of [-0.16, 0, 0.16]) {
      const spike = box(0.11, 0.2, 0.12, color);
      spike.position.set(dx, 2.24, 0.02);
      g.add(spike);
    }
  } else {
    // mi-long (couvre le sommet et les côtés)
    const top = box(w + 0.04, 0.18, 0.52, color);
    top.position.set(0, 2.17, 0);
    g.add(top);
    for (const sx of [-(headW / 2 + 0.01), headW / 2 + 0.01]) {
      const side = box(0.06, 0.36, 0.46, color);
      side.position.set(sx, 1.92, -0.02);
      g.add(side);
    }
  }
}
