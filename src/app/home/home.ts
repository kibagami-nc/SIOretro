import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  output,
  signal,
} from '@angular/core';
import {
  BindingAction,
  getBindings,
  keyLabel,
  resetBindings,
  setBinding,
} from '../controls';

interface MenuItem {
  id: 'play' | 'settings' | 'editor';
  label: string;
}

interface BindingRow {
  action: BindingAction;
  label: string;
}

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomeComponent {
  readonly play = output<void>();
  readonly edit = output<void>();

  protected readonly items: MenuItem[] = [
    { id: 'play', label: 'JOUER' },
    { id: 'settings', label: 'RÉGLAGES' },
    { id: 'editor', label: 'ÉDITEUR' },
  ];

  protected readonly bindingRows: BindingRow[] = [
    { action: 'fwd', label: 'Avancer' },
    { action: 'back', label: 'Reculer' },
    { action: 'left', label: 'Gauche' },
    { action: 'right', label: 'Droite' },
    { action: 'action', label: 'Interagir' },
  ];

  // 'title' = écran d'accueil ; 'settings' = panneau des touches
  protected readonly mode = signal<'title' | 'settings'>('title');
  protected readonly sel = signal(0);

  // copie réactive des liaisons pour rafraîchir l'affichage après remappage
  protected readonly bindings = signal(getBindings());
  // action en cours de réassignation (null = aucune)
  protected readonly capturing = signal<BindingAction | null>(null);

  // étoiles pré-calculées (positions/scintillement déterministes par index)
  protected readonly etoiles = Array.from({ length: 48 }, (_, i) => ({
    top: ((i * 53) % 100),
    left: ((i * 37 + 11) % 100),
    dur: 1.6 + (i % 7) * 0.3,
    delay: -(i % 11) * 0.27,
    kind: i % 5 === 0 ? 'gold' : i % 3 === 0 ? 'pink' : 'white',
  }));

  protected keyOf(action: BindingAction): string {
    return keyLabel(this.bindings()[action]);
  }

  protected hover(i: number): void {
    if (this.mode() === 'title') this.sel.set(i);
  }

  protected choose(item: MenuItem): void {
    switch (item.id) {
      case 'play':
        this.play.emit();
        break;
      case 'editor':
        this.edit.emit();
        break;
      case 'settings':
        this.openSettings();
        break;
    }
  }

  protected openSettings(): void {
    this.mode.set('settings');
    this.capturing.set(null);
  }

  protected closeSettings(): void {
    this.mode.set('title');
    this.capturing.set(null);
  }

  protected startCapture(action: BindingAction): void {
    this.capturing.set(action);
  }

  protected resetKeys(): void {
    resetBindings();
    this.bindings.set({ ...getBindings() });
    this.capturing.set(null);
  }

  @HostListener('document:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    // capture d'une nouvelle touche pour le remappage
    const cap = this.capturing();
    if (cap) {
      e.preventDefault();
      if (e.code === 'Escape') {
        this.capturing.set(null);
        return;
      }
      setBinding(cap, e.code);
      this.bindings.set({ ...getBindings() });
      this.capturing.set(null);
      return;
    }

    if (this.mode() === 'settings') {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.closeSettings();
      }
      return;
    }

    // navigation de l'écran titre
    const n = this.items.length;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      this.sel.set((this.sel() - 1 + n) % n);
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      this.sel.set((this.sel() + 1) % n);
    } else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') {
      e.preventDefault();
      this.choose(this.items[this.sel()]);
    }
  }
}
