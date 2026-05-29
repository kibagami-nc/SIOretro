/**
 * Configuration des touches du jeu.
 *
 * Les liaisons sont stockées via `KeyboardEvent.code` (position physique de la
 * touche), ce qui rend le remappage fiable quel que soit l'agencement clavier :
 * l'utilisateur remappe avec sa propre touche physique, et le jeu compare la
 * même `code` en partie. Les valeurs par défaut correspondent à ZQSD sur un
 * clavier AZERTY (qui occupent les positions physiques W/A/S/D).
 */

export type BindingAction = 'fwd' | 'back' | 'left' | 'right' | 'action';

export interface KeyBindings {
  fwd: string;
  back: string;
  left: string;
  right: string;
  action: string;
}

const DEFAULT_BINDINGS: KeyBindings = {
  fwd: 'KeyW', // « Z » en AZERTY
  back: 'KeyS',
  left: 'KeyA', // « Q » en AZERTY
  right: 'KeyD',
  action: 'KeyE',
};

const STORAGE_KEY = 'sioretro.controls.v1';

function clone(b: KeyBindings): KeyBindings {
  return { fwd: b.fwd, back: b.back, left: b.left, right: b.right, action: b.action };
}

function load(): KeyBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULT_BINDINGS);
    const parsed = JSON.parse(raw) as Partial<KeyBindings>;
    return {
      fwd: parsed.fwd ?? DEFAULT_BINDINGS.fwd,
      back: parsed.back ?? DEFAULT_BINDINGS.back,
      left: parsed.left ?? DEFAULT_BINDINGS.left,
      right: parsed.right ?? DEFAULT_BINDINGS.right,
      action: parsed.action ?? DEFAULT_BINDINGS.action,
    };
  } catch {
    return clone(DEFAULT_BINDINGS);
  }
}

// liaisons courantes en mémoire (chargées une fois)
let current: KeyBindings = load();

/** Liaisons actives, lues par le moteur de jeu. */
export function getBindings(): KeyBindings {
  return current;
}

/** Remplace toutes les liaisons et persiste. */
export function setBindings(next: KeyBindings): void {
  current = clone(next);
  save();
}

/** Modifie une seule action et persiste. */
export function setBinding(action: BindingAction, code: string): void {
  current = { ...current, [action]: code };
  save();
}

/** Remet les touches par défaut (ZQSD) et persiste. */
export function resetBindings(): KeyBindings {
  current = clone(DEFAULT_BINDINGS);
  save();
  return clone(current);
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* localStorage indisponible : on garde la valeur en mémoire */
  }
}

/** Étiquette lisible pour une `KeyboardEvent.code` (ex. « KeyW » → « Z »). */
export function keyLabel(code: string): string {
  if (!code) return '—';
  // lettres : on affiche le caractère AZERTY correspondant à la position
  const azerty: Record<string, string> = {
    KeyA: 'Q',
    KeyZ: 'W',
    KeyW: 'Z',
    KeyQ: 'A',
    KeyM: ',',
    Semicolon: 'M',
  };
  if (azerty[code]) return azerty[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) {
    const dir = code.slice(5);
    return { Up: '↑', Down: '↓', Left: '←', Right: '→' }[dir] ?? dir;
  }
  const named: Record<string, string> = {
    Space: 'ESPACE',
    ShiftLeft: 'MAJ G',
    ShiftRight: 'MAJ D',
    ControlLeft: 'CTRL G',
    ControlRight: 'CTRL D',
    Enter: 'ENTRÉE',
    Escape: 'ÉCHAP',
    Tab: 'TAB',
  };
  return named[code] ?? code;
}
