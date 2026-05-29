import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CHARACTERS, Character, cssColor } from '../characters';
import { PreviewRenderer } from '../game/preview';

@Component({
  selector: 'app-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './menu.html',
  styleUrl: './menu.scss',
})
export class MenuComponent implements AfterViewInit, OnDestroy {
  readonly play = output<Character>();
  readonly edit = output<void>();
  readonly back = output<void>();

  // seuls les personnages jouables apparaissent dans la sélection (les PNJ
  // « npcOnly » restent plaçables dans l'éditeur mais ne sont pas jouables)
  protected readonly characters = CHARACTERS.filter((c) => !c.npcOnly);
  protected readonly selectedId = signal(this.characters[0].id);
  protected readonly selected = computed(
    () => this.characters.find((c) => c.id === this.selectedId()) ?? this.characters[0],
  );
  protected readonly accent = computed(() => cssColor(this.selected().color));
  protected readonly accent2 = computed(() => cssColor(this.selected().accent));
  protected readonly total = this.characters.length;
  protected readonly index = computed(
    () => this.characters.findIndex((c) => c.id === this.selectedId()) + 1,
  );
  protected readonly statBars = computed(() => {
    const s = this.selected().stats;
    return [
      { label: 'Code', value: s.code },
      { label: 'Réseau', value: s.reseau },
      { label: 'Sécurité', value: s.secu },
      { label: 'Vitesse', value: s.vitesse },
    ];
  });

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('preview');
  private preview?: PreviewRenderer;

  constructor() {
    // met à jour l'aperçu 3D quand la sélection change
    effect(() => {
      const c = this.selected();
      this.preview?.setCharacter(c);
    });
  }

  ngAfterViewInit(): void {
    this.preview = new PreviewRenderer(this.canvasRef().nativeElement);
    this.preview.setCharacter(this.selected());
    this.preview.start();
  }

  protected color(hex: number): string {
    return cssColor(hex);
  }

  /** numéro sur 2 chiffres (ex. 3 → « 03 ») */
  protected pad(n: number): string {
    return n.toString().padStart(2, '0');
  }

  /** initiale affichée dans la pastille du roster */
  protected initial(c: Character): string {
    return c.name.charAt(0).toUpperCase();
  }

  /** Découpe une stat 0-100 en 10 blocs (barre segmentée façon arcade). */
  protected segments(value: number): boolean[] {
    const total = 10;
    const filled = Math.round((value / 100) * total);
    return Array.from({ length: total }, (_, i) => i < filled);
  }

  protected select(c: Character): void {
    this.selectedId.set(c.id);
  }

  protected start(): void {
    this.play.emit(this.selected());
  }

  protected openEditor(): void {
    this.edit.emit();
  }

  protected goBack(): void {
    this.back.emit();
  }

  ngOnDestroy(): void {
    this.preview?.dispose();
  }
}
