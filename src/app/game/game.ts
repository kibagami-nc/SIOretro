import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { Character } from '../characters';
import { cssColor, CHARACTERS } from '../characters';
import { Dialogue, GameEngine } from './engine';

@Component({
  selector: 'app-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game.html',
  styleUrl: './game.scss',
})
export class GameComponent implements AfterViewInit, OnDestroy {
  readonly character = input.required<Character>();
  readonly exit = output<void>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private engine?: GameEngine;

  protected readonly started = signal(false);
  protected readonly locked = signal(false);
  protected readonly zone = signal('Salle Info — BTS SIO');
  protected readonly objective = signal('');
  protected readonly talked = signal(0);
  protected readonly talkedTotal = signal(0);
  protected readonly prompt = signal<string | null>(null);
  protected readonly dialogue = signal<Dialogue | null>(null);
  protected readonly timeSec = signal(0);
  protected readonly won = signal(false);
  protected readonly winTime = signal(0);

  protected readonly showIntro = computed(() => !this.started() && !this.won());
  protected readonly showPause = computed(() => this.started() && !this.locked() && !this.won());
  protected readonly showProgress = computed(() => this.talkedTotal() > 0);

  protected readonly color = computed(() => cssColor(this.character().color));
  protected readonly timeLabel = computed(() => fmt(this.timeSec()));
  protected readonly winLabel = computed(() => fmt(this.winTime()));
  protected readonly dialogueColor = computed(() => {
    const d = this.dialogue();
    return d ? cssColor(d.color) : '#ffffff';
  });

  ngAfterViewInit(): void {
    const me = this.character();
    const others = CHARACTERS.filter((c) => c.id !== me.id);
    this.engine = new GameEngine(this.canvasRef().nativeElement, me, others, {
      onObjective: (t) => this.objective.set(t),
      onProgress: (c, t) => {
        this.talked.set(c);
        this.talkedTotal.set(t);
      },
      onPrompt: (p) => this.prompt.set(p),
      onDialogue: (d) => this.dialogue.set(d),
      onTime: (s) => this.timeSec.set(s),
      onWin: (s) => {
        this.won.set(true);
        this.winTime.set(s);
      },
      onLockChange: (l) => {
        this.locked.set(l);
        if (l) this.started.set(true);
      },
    });
    this.engine.start();
  }

  protected play(): void {
    this.engine?.requestLock();
  }

  protected quit(): void {
    this.exit.emit();
  }

  ngOnDestroy(): void {
    this.engine?.dispose();
  }
}

function fmt(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
