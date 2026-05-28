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

/**
 * Personnage cubique (voxel) à partir d'une fiche, avec variations
 * (teint, coiffure, lunettes) dérivées de l'id. Origine au sol (y=0).
 */
export function buildCharacter(char: Character): THREE.Group {
  const g = new THREE.Group();
  const h = hash(char.id);
  const skin = SKIN_TONES[h % SKIN_TONES.length];
  const pants = PANTS[(h >> 3) % PANTS.length];
  const hairStyle = (h >> 5) % 4;
  const glasses = ((h >> 7) & 1) === 1;

  // jambes + chaussures
  for (const sx of [-0.13, 0.13]) {
    const leg = box(0.22, 0.78, 0.26, pants);
    leg.position.set(sx, 0.42, 0);
    g.add(leg);
    const shoe = box(0.24, 0.12, 0.36, SHOES);
    shoe.position.set(sx, 0.06, 0.05);
    g.add(shoe);
  }

  // torse (tee-shirt couleur du perso)
  const torso = box(0.64, 0.74, 0.34, char.color);
  torso.position.set(0, 1.18, 0);
  g.add(torso);

  // badge / lanyard (accent)
  const lanyard = box(0.07, 0.34, 0.02, char.accent);
  lanyard.position.set(0.1, 1.32, 0.18);
  g.add(lanyard);
  const badge = box(0.16, 0.12, 0.02, 0xf8fafc);
  badge.position.set(0.1, 1.12, 0.19);
  g.add(badge);

  // bras + mains
  for (const sx of [-0.41, 0.41]) {
    const arm = box(0.18, 0.66, 0.22, char.color);
    arm.position.set(sx, 1.2, 0);
    g.add(arm);
    const hand = box(0.18, 0.16, 0.22, skin);
    hand.position.set(sx, 0.84, 0);
    g.add(hand);
  }

  // cou
  const neck = box(0.2, 0.12, 0.2, skin);
  neck.position.set(0, 1.62, 0);
  g.add(neck);

  // tête
  const head = box(0.48, 0.48, 0.46, skin);
  head.position.set(0, 1.9, 0);
  g.add(head);

  // yeux
  for (const sx of [-0.11, 0.11]) {
    const eye = box(0.08, 0.09, 0.04, EYE);
    eye.position.set(sx, 1.93, 0.235);
    g.add(eye);
  }

  // lunettes
  if (glasses) {
    const frame = box(0.42, 0.04, 0.04, 0x1a1d24);
    frame.position.set(0, 1.95, 0.245);
    g.add(frame);
    for (const sx of [-0.11, 0.11]) {
      const lens = box(0.13, 0.12, 0.02, 0x222730);
      lens.position.set(sx, 1.93, 0.25);
      g.add(lens);
    }
  }

  // cheveux selon le style
  const hairColor = char.accent;
  if (hairStyle === 0) {
    // casquette/coupe plate
    const top = box(0.5, 0.16, 0.48, hairColor);
    top.position.set(0, 2.14, 0);
    g.add(top);
    const fringe = box(0.5, 0.12, 0.06, hairColor);
    fringe.position.set(0, 2.04, 0.21);
    g.add(fringe);
  } else if (hairStyle === 1) {
    // afro/volume
    const top = box(0.58, 0.26, 0.56, hairColor);
    top.position.set(0, 2.2, 0);
    g.add(top);
  } else if (hairStyle === 2) {
    // spiky
    for (const dx of [-0.14, 0, 0.14]) {
      const spike = box(0.12, 0.18, 0.12, hairColor);
      spike.position.set(dx, 2.18, 0);
      g.add(spike);
    }
    const base = box(0.5, 0.1, 0.48, hairColor);
    base.position.set(0, 2.1, 0);
    g.add(base);
  } else {
    // cheveux mi-longs (couvre les côtés)
    const top = box(0.52, 0.2, 0.52, hairColor);
    top.position.set(0, 2.16, 0);
    g.add(top);
    for (const sx of [-0.27, 0.27]) {
      const side = box(0.06, 0.34, 0.46, hairColor);
      side.position.set(sx, 1.92, 0);
      g.add(side);
    }
  }

  // un peu plus petit (les pieds restent au sol)
  g.scale.setScalar(0.85);
  return g;
}
