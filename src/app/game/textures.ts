import * as THREE from 'three';

function pixelTexture(canvas: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Sol de salle info : dalles claires nettes + léger granité. */
export function makeFloorTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(7);
  g.fillStyle = '#b9bcc4';
  g.fillRect(0, 0, 128, 128);
  // granité subtil
  for (let i = 0; i < 1600; i++) {
    const v = 180 + Math.floor(rnd() * 40);
    g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
    g.fillRect(rnd() * 128, rnd() * 128, 1, 1);
  }
  // joints de dalles 64px
  g.strokeStyle = '#8a8d96';
  g.lineWidth = 2;
  for (const p of [0, 64, 128]) {
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, 128);
    g.moveTo(0, p);
    g.lineTo(128, p);
    g.stroke();
  }
  return pixelTexture(c, [10, 6]);
}

/** Tableau blanc avec "BTS SIO" et l'objectif. */
export function makeWhiteboardTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f6f7f2';
  g.fillRect(0, 0, 640, 320);
  // reflets
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(20, 20, 120, 280);
  g.fillStyle = '#1d4ed8';
  g.font = 'bold 92px monospace';
  g.textBaseline = 'middle';
  g.fillText('BTS SIO', 50, 95);
  g.strokeStyle = '#dc2626';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(50, 160);
  g.lineTo(430, 160);
  g.stroke();
  g.fillStyle = '#111827';
  g.font = '40px monospace';
  g.fillText('SLAM  //  SISR', 60, 215);
  g.fillStyle = '#16a34a';
  g.font = '30px monospace';
  g.fillText('> parle a toute la classe !', 60, 270);
  return pixelTexture(c);
}

/** Écran d'ordi : fond sombre + lignes de "code". */
export function makeScreenTexture(seed = 0): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 110;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(1337 + seed * 23);
  const dark = rnd() > 0.5 ? '#0a1424' : '#101418';
  g.fillStyle = dark;
  g.fillRect(0, 0, 160, 110);
  // barre de titre
  g.fillStyle = '#1f2937';
  g.fillRect(0, 0, 160, 12);
  g.fillStyle = '#ef4444';
  g.fillRect(6, 4, 4, 4);
  g.fillStyle = '#eab308';
  g.fillRect(14, 4, 4, 4);
  g.fillStyle = '#22c55e';
  g.fillRect(22, 4, 4, 4);
  g.font = '9px monospace';
  for (let y = 24; y < 106; y += 10) {
    const indent = Math.floor(rnd() * 4) * 8;
    g.fillStyle = ['#4ade80', '#7dd3fc', '#c4b5fd', '#fca5a5'][Math.floor(rnd() * 4)];
    let line = '';
    const len = 4 + Math.floor(rnd() * 14);
    for (let i = 0; i < len; i++) line += rnd() > 0.18 ? '#' : ' ';
    g.fillText(line, 6 + indent, y);
  }
  return pixelTexture(c);
}

/** Ciel vu par les fenêtres (dégradé + nuages). */
export function makeSkyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#7ec0ff');
  grad.addColorStop(0.6, '#bfe0ff');
  grad.addColorStop(1, '#e8f4ff');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const rnd = mulberry32(99);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 5; i++) {
    const x = rnd() * 128;
    const y = 10 + rnd() * 60;
    for (let j = 0; j < 6; j++) {
      const r = 6 + rnd() * 10;
      g.beginPath();
      g.arc(x + j * 7 - 18, y + (rnd() - 0.5) * 8, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  // ligne d'arbres/immeubles en bas
  g.fillStyle = '#6f9b5e';
  g.fillRect(0, 104, 128, 24);
  g.fillStyle = '#5d6470';
  for (let i = 0; i < 6; i++) g.fillRect(i * 22 + rnd() * 6, 88 + rnd() * 10, 12, 24);
  return pixelTexture(c);
}

/** Poster mural (diagramme réseau ou snippet de code selon kind). */
export function makePosterTexture(kind: 'reseau' | 'code'): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = '#11141d';
  g.fillRect(0, 0, 256, 320);
  g.strokeStyle = '#334155';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 244, 308);
  if (kind === 'reseau') {
    g.fillStyle = '#38bdf8';
    g.font = 'bold 26px monospace';
    g.fillText('RESEAU', 70, 44);
    // noeuds
    const nodes: [number, number][] = [
      [128, 90],
      [60, 170],
      [196, 170],
      [60, 260],
      [196, 260],
    ];
    g.strokeStyle = '#64748b';
    g.lineWidth = 3;
    for (let i = 1; i < nodes.length; i++) {
      g.beginPath();
      g.moveTo(nodes[0][0], nodes[0][1]);
      g.lineTo(nodes[i][0], nodes[i][1]);
      g.stroke();
    }
    for (const [x, y] of nodes) {
      g.fillStyle = '#22c55e';
      g.fillRect(x - 16, y - 12, 32, 24);
      g.fillStyle = '#0b0e16';
      g.fillRect(x - 12, y - 8, 24, 16);
    }
  } else {
    g.fillStyle = '#a78bfa';
    g.font = 'bold 26px monospace';
    g.fillText('CODE', 86, 44);
    g.font = '16px monospace';
    const lines = ['function tp() {', '  let sio = 8;', '  while (sio--) {', '    collect();', '  }', '  return win;', '}'];
    lines.forEach((l, i) => {
      g.fillStyle = i % 2 ? '#7dd3fc' : '#4ade80';
      g.fillText(l, 22, 90 + i * 28);
    });
  }
  return pixelTexture(c);
}

/** Bitume de cour de récré (à répéter). */
export function makeAsphaltTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(42);
  g.fillStyle = '#6b6f76';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) {
    const v = 90 + Math.floor(rnd() * 60);
    g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
    g.fillRect(rnd() * 128, rnd() * 128, 1, 1);
  }
  // quelques fissures
  g.strokeStyle = 'rgba(40,42,46,0.6)';
  g.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    let x = rnd() * 128;
    let y = rnd() * 128;
    g.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (rnd() - 0.5) * 40;
      y += (rnd() - 0.5) * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return pixelTexture(c, [12, 10]);
}

/** Façade de bâtiment scolaire avec rangée de fenêtres (à répéter). */
export function makeBuildingTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#cdbfa6';
  g.fillRect(0, 0, 128, 128);
  // bande d'étage
  g.fillStyle = '#b6a98f';
  g.fillRect(0, 0, 128, 10);
  g.fillRect(0, 118, 128, 10);
  // fenêtre
  g.fillStyle = '#7c848f';
  g.fillRect(28, 26, 72, 76);
  g.fillStyle = '#bfe0ff';
  g.fillRect(32, 30, 64, 68);
  // reflets
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(36, 34, 16, 60);
  // meneaux
  g.fillStyle = '#5c636d';
  g.fillRect(63, 30, 4, 68);
  g.fillRect(32, 60, 64, 4);
  return pixelTexture(c, [1, 1]);
}

/** Une porte de casier (à répéter le long d'un mur). */
export function makeLockerTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3f6791';
  g.fillRect(0, 0, 64, 128);
  // séparation entre casiers
  g.fillStyle = '#28415c';
  g.fillRect(0, 0, 3, 128);
  g.fillRect(61, 0, 3, 128);
  g.fillRect(0, 62, 64, 3);
  // panneau en creux
  g.strokeStyle = '#5a82ad';
  g.lineWidth = 2;
  g.strokeRect(8, 8, 48, 48);
  g.strokeRect(8, 72, 48, 48);
  // fentes d'aération
  g.fillStyle = '#1f3349';
  for (const oy of [12, 76]) for (let i = 0; i < 4; i++) g.fillRect(16, oy + i * 4, 32, 2);
  // poignées
  g.fillStyle = '#cbd5e1';
  g.fillRect(46, 40, 6, 12);
  g.fillRect(46, 104, 6, 12);
  return pixelTexture(c);
}

/** Grand panneau mural (nom du lycée + sous-titre). */
export function makeSignTexture(title: string, subtitle: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0e2a52';
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#16386b';
  g.fillRect(0, 0, 1024, 16);
  g.fillRect(0, 240, 1024, 16);
  // bandeau tricolore discret
  g.fillStyle = '#2563eb';
  g.fillRect(24, 40, 12, 176);
  g.fillStyle = '#e5e7eb';
  g.font = 'bold 70px monospace';
  g.textBaseline = 'middle';
  g.fillText(title, 64, 96);
  g.fillStyle = '#9dc1ff';
  g.font = '34px monospace';
  g.fillText(subtitle, 64, 168);
  return pixelTexture(c);
}

/** Petite plaque de porte (salle, labo, etc.). */
export function makeDoorLabelTexture(text: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1f2937';
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#64748b';
  g.lineWidth = 4;
  g.strokeRect(3, 3, 250, 58);
  g.fillStyle = '#e5e7eb';
  g.font = 'bold 30px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  return pixelTexture(c);
}

/** Étiquette flottante avec le nom du perso. */
export function makeNameSprite(text: string, hex: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(8,10,20,0.8)';
  roundRect(g, 6, 8, 244, 48, 8);
  g.fill();
  g.strokeStyle = '#' + hex.toString(16).padStart(6, '0');
  g.lineWidth = 4;
  roundRect(g, 6, 8, 244, 48, 8);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = 'bold 30px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = pixelTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.4, 0.35, 1);
  return sprite;
}
