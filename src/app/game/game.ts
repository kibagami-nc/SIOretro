import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { Character } from '../characters';
import { cssColor, CHARACTERS } from '../characters';
import { CombatView, Dialogue, GameEngine, PowerView } from './engine';

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
  /** texte du dialogue révélé progressivement (effet machine à écrire) */
  protected readonly typed = signal('');
  private typer?: ReturnType<typeof setInterval>;
  protected readonly timeSec = signal(0);
  protected readonly won = signal(false);
  protected readonly winTime = signal(0);
  protected readonly winTitle = signal('MISSION ACCOMPLIE !');
  protected readonly winSub = signal('Toute la classe a assuré 🎓');
  protected readonly combat = signal<CombatView | null>(null);
  protected readonly questMode = signal(false);
  protected readonly fps = signal(0);
  /** fondu au noir plein écran (transitions vers/depuis l'arène) */
  protected readonly fade = signal(false);
  /** pouvoir actif du personnage (HUD) */
  protected readonly power = signal<PowerView | null>(null);
  /** objectif affiché en grand au centre avant de rétrécir vers le HUD */
  protected readonly questBanner = signal<string | null>(null);
  private banner?: ReturnType<typeof setTimeout>;
  private lastFlashed = '';
  /** objectif en attente d'annonce (arrivé pendant un dialogue ouvert) */
  private pendingQuest: string | null = null;

  constructor() {
    // Nouvel objectif : on l'annonce en grand au centre… sauf s'il survient
    // pendant un dialogue. Dans ce cas on le met en attente et il ne s'affichera
    // qu'à la fermeture de la boîte de dialogue (voir l'effet ci-dessous).
    effect(() => {
      const text = this.objective();
      const live = this.started();
      if (!live || !text) return;
      untracked(() => {
        if (text === this.lastFlashed) return;
        if (this.dialogue()) {
          this.pendingQuest = text;
        } else {
          this.lastFlashed = text;
          this.flashQuest(text);
        }
      });
    });

    // À la fermeture de la boîte de dialogue, on déclenche l'objectif en attente.
    effect(() => {
      const open = this.dialogue();
      if (open) return;
      untracked(() => {
        const text = this.pendingQuest;
        if (!text) return;
        this.pendingQuest = null;
        this.lastFlashed = text;
        this.flashQuest(text);
      });
    });
  }

  private flashQuest(text: string): void {
    clearTimeout(this.banner);
    this.questBanner.set(text);
    this.banner = setTimeout(() => this.questBanner.set(null), 4200);
  }

  protected readonly showIntro = computed(() => !this.started() && !this.won());
  protected readonly showPause = computed(() => this.started() && !this.locked() && !this.won());
  protected readonly showProgress = computed(() => this.talkedTotal() > 0 && !this.questMode());
  protected readonly enemyHpPct = computed(() => {
    const c = this.combat();
    return c ? Math.round((c.enemyHp / c.enemyMax) * 100) : 0;
  });
  protected readonly playerHpPct = computed(() => {
    const c = this.combat();
    return c ? Math.round((c.playerHp / c.playerMax) * 100) : 0;
  });
  protected readonly combatColor = computed(() => {
    const c = this.combat();
    return c ? cssColor(c.color) : '#ffffff';
  });

  protected readonly powerColor = computed(() => {
    const p = this.power();
    return p ? cssColor(p.color) : '#ffffff';
  });

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
      onDialogue: (d) => {
        this.dialogue.set(d);
        this.runTypewriter(d);
      },
      onTime: (s) => this.timeSec.set(s),
      onWin: (s, title, sub) => {
        this.won.set(true);
        this.winTime.set(s);
        this.winTitle.set(title);
        this.winSub.set(sub);
      },
      onLockChange: (l) => {
        this.locked.set(l);
        if (l) this.started.set(true);
      },
      onCombat: (c) => this.combat.set(c),
      onQuest: (a) => this.questMode.set(a),
      onFps: (f) => this.fps.set(f),
      onFade: (v) => this.fade.set(v),
      onPower: (p) => this.power.set(p),
    });
    this.engine.start();
  }

  protected play(): void {
    this.engine?.requestLock();
  }

  /** Révèle le texte du dialogue caractère par caractère (effet rétro). */
  private runTypewriter(d: Dialogue | null): void {
    clearInterval(this.typer);
    if (!d) {
      this.typed.set('');
      return;
    }
    const full = d.line;
    this.typed.set('');
    let i = 0;
    this.typer = setInterval(() => {
      // 2 caractères par tick : assez vif pour ne pas freiner la lecture
      i = Math.min(full.length, i + 2);
      this.typed.set(full.slice(0, i));
      if (i >= full.length) clearInterval(this.typer);
    }, 18);
  }

  protected quit(): void {
    this.exit.emit();
  }

  ngOnDestroy(): void {
    clearInterval(this.typer);
    clearTimeout(this.banner);
    this.engine?.dispose();
  }
}

function fmt(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
