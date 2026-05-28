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

  protected readonly characters = CHARACTERS;
  protected readonly selectedId = signal(CHARACTERS[0].id);
  protected readonly selected = computed(
    () => CHARACTERS.find((c) => c.id === this.selectedId()) ?? CHARACTERS[0],
  );
  protected readonly accent = computed(() => cssColor(this.selected().color));
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

  protected select(c: Character): void {
    this.selectedId.set(c.id);
  }

  protected start(): void {
    this.play.emit(this.selected());
  }

  protected openEditor(): void {
    this.edit.emit();
  }

  ngOnDestroy(): void {
    this.preview?.dispose();
  }
}
