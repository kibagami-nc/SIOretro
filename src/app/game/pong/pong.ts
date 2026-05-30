import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

/** Résolution interne « GameBoy » (la toile est agrandie au pixel près). */
const VW = 160;
const VH = 144;
const PADDLE_W = 5;
const PADDLE_H = 30;
const PADDLE_X = 8; // marge des raquettes par rapport aux bords
const BALL = 5; // côté de la balle (carrée, rétro)
const PLAYER_SPEED = 175; // vitesse de la raquette du joueur (u/s)
const CPU_SPEED = 78; // raquette de Weimin : lente exprès (facile à battre)
const CPU_DEADZONE = 14; // zone morte large → Weimin rate souvent les balles d'angle
const BALL_START = 125; // vitesse initiale de la balle (un peu plus vive)
const BALL_MAX = 200; // plafond de vitesse (relevé : balle plus rapide)
const BALL_GAIN = 6; // accélération à chaque renvoi

/**
 * Mini-jeu Pong façon GameBoy : 1v1 contre Weimin, premier à `targetScore`.
 * Entièrement autonome (boucle + entrées), émet `finished(true|false)`.
 */
@Component({
  selector: 'app-pong',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pong.html',
  styleUrl: './pong.scss',
})
export class PongComponent implements AfterViewInit, OnDestroy {
  readonly opponentName = input('Weimin');
  readonly targetScore = input(5);
  /** true = le joueur a gagné, false = perdu / abandon */
  readonly finished = output<boolean>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('screen');

  protected readonly playerScore = signal(0);
  protected readonly cpuScore = signal(0);
  /** 'count' décompte · 'play' en jeu · 'point' courte pause · 'over' fin */
  protected readonly phase = signal<'count' | 'play' | 'point' | 'over'>('count');
  protected readonly banner = signal('3');
  protected readonly won = signal(false);

  private ctx!: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private disposed = false;
  private ended = false;

  // état de jeu (coordonnées internes VW×VH)
  private playerY = (VH - PADDLE_H) / 2;
  private cpuY = (VH - PADDLE_H) / 2;
  private ballX = VW / 2;
  private ballY = VH / 2;
  private ballVX = 0;
  private ballVY = 0;
  private timer = 0; // chrono interne (décompte / pause point)

  // entrées clavier (flèches ou Z/S ou W/S)
  private up = false;
  private down = false;

  ngAfterViewInit(): void {
    const canvas = this.canvasRef().nativeElement;
    canvas.width = VW;
    canvas.height = VH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.resetForServe(true);
    this.phase.set('count');
    this.timer = 3;
    this.banner.set('3');
    this.last = performance.now();
    this.loop();
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeyDown(e: KeyboardEvent): void {
    const c = e.code;
    if (c === 'ArrowUp' || c === 'KeyW' || c === 'KeyZ') {
      this.up = true;
      e.preventDefault();
    } else if (c === 'ArrowDown' || c === 'KeyS') {
      this.down = true;
      e.preventDefault();
    } else if (c === 'Escape') {
      // abandon = défaite
      this.end(false);
    }
  }

  @HostListener('document:keyup', ['$event'])
  protected onKeyUp(e: KeyboardEvent): void {
    const c = e.code;
    if (c === 'ArrowUp' || c === 'KeyW' || c === 'KeyZ') this.up = false;
    else if (c === 'ArrowDown' || c === 'KeyS') this.down = false;
  }

  /** Abandonner via le bouton (défaite). */
  protected forfeit(): void {
    this.end(false);
  }

  private resetForServe(towardPlayer: boolean): void {
    this.ballX = VW / 2;
    this.ballY = VH / 2;
    const angle = (Math.random() * 0.6 - 0.3); // ±0,3 rad autour de l'horizontale
    const dir = towardPlayer ? -1 : 1;
    this.ballVX = Math.cos(angle) * BALL_START * dir;
    this.ballVY = Math.sin(angle) * BALL_START;
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05; // borne (onglet en arrière-plan)
    this.update(dt);
    this.draw();
  };

  private update(dt: number): void {
    const phase = this.phase();
    if (phase === 'over') return;

    // raquette du joueur (toujours pilotable, même pendant le décompte)
    const pv = (this.down ? 1 : 0) - (this.up ? 1 : 0);
    this.playerY += pv * PLAYER_SPEED * dt;
    this.playerY = clamp(this.playerY, 0, VH - PADDLE_H);

    if (phase === 'count') {
      this.timer -= dt;
      const n = Math.ceil(this.timer);
      this.banner.set(this.timer <= 0 ? 'GO!' : String(n));
      if (this.timer <= -0.4) {
        this.phase.set('play');
        this.banner.set('');
      }
      return;
    }

    if (phase === 'point') {
      this.timer -= dt;
      // l'IA recentre sa raquette pendant la pause
      this.cpuY = approach(this.cpuY, (VH - PADDLE_H) / 2, CPU_SPEED * dt);
      if (this.timer <= 0) {
        this.phase.set('play');
        this.banner.set('');
      }
      return;
    }

    // --- phase 'play' ---
    // IA de Weimin volontairement faillible : il ne réagit que quand la balle
    // vient vers lui, lentement et avec une grosse zone morte (donc battable).
    if (this.ballVX > 0) {
      const target = this.ballY + BALL / 2 - PADDLE_H / 2;
      const diff = target - this.cpuY;
      if (Math.abs(diff) > CPU_DEADZONE) {
        this.cpuY += Math.sign(diff) * CPU_SPEED * dt;
      }
    } else {
      // balle qui s'éloigne : il se recentre tranquillement
      this.cpuY = approach(this.cpuY, (VH - PADDLE_H) / 2, CPU_SPEED * 0.5 * dt);
    }
    this.cpuY = clamp(this.cpuY, 0, VH - PADDLE_H);

    // déplacement de la balle
    this.ballX += this.ballVX * dt;
    this.ballY += this.ballVY * dt;

    // rebonds haut / bas
    if (this.ballY <= 0) {
      this.ballY = 0;
      this.ballVY = Math.abs(this.ballVY);
    } else if (this.ballY + BALL >= VH) {
      this.ballY = VH - BALL;
      this.ballVY = -Math.abs(this.ballVY);
    }

    // collision raquette joueur (gauche)
    if (
      this.ballVX < 0 &&
      this.ballX <= PADDLE_X + PADDLE_W &&
      this.ballX >= PADDLE_X &&
      this.ballY + BALL >= this.playerY &&
      this.ballY <= this.playerY + PADDLE_H
    ) {
      this.ballX = PADDLE_X + PADDLE_W;
      this.bounceOff(this.playerY, 1);
    }

    // collision raquette Weimin (droite)
    const cpuX = VW - PADDLE_X - PADDLE_W;
    if (
      this.ballVX > 0 &&
      this.ballX + BALL >= cpuX &&
      this.ballX + BALL <= cpuX + PADDLE_W &&
      this.ballY + BALL >= this.cpuY &&
      this.ballY <= this.cpuY + PADDLE_H
    ) {
      this.ballX = cpuX - BALL;
      this.bounceOff(this.cpuY, -1);
    }

    // sorties = point marqué
    if (this.ballX + BALL < 0) {
      this.cpuScore.update((s) => s + 1);
      this.afterPoint(false);
    } else if (this.ballX > VW) {
      this.playerScore.update((s) => s + 1);
      this.afterPoint(true);
    }
  }

  /** Renvoie la balle selon le point d'impact sur la raquette (effet d'angle). */
  private bounceOff(paddleY: number, dir: 1 | -1): void {
    const rel = (this.ballY + BALL / 2 - (paddleY + PADDLE_H / 2)) / (PADDLE_H / 2); // -1..1
    const speed = Math.min(BALL_MAX, Math.hypot(this.ballVX, this.ballVY) + BALL_GAIN);
    const angle = rel * 1.0; // jusqu'à ~57° d'écart
    this.ballVX = Math.cos(angle) * speed * dir;
    this.ballVY = Math.sin(angle) * speed;
  }

  private afterPoint(playerScored: boolean): void {
    if (
      this.playerScore() >= this.targetScore() ||
      this.cpuScore() >= this.targetScore()
    ) {
      this.end(this.playerScore() > this.cpuScore());
      return;
    }
    // le perdant du point sert (balle vers lui)
    this.resetForServe(!playerScored);
    this.phase.set('point');
    this.timer = 0.9;
    this.banner.set(playerScored ? 'POINT !' : 'RATÉ !');
  }

  private end(won: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.won.set(won);
    this.phase.set('over');
    this.banner.set(won ? 'GAGNÉ !' : 'PERDU...');
    // laisse l'écran de fin visible un instant avant de rendre la main
    setTimeout(() => {
      if (!this.disposed) this.finished.emit(won);
    }, 1700);
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // fond vert clair GameBoy
    ctx.fillStyle = '#9bbc0f';
    ctx.fillRect(0, 0, VW, VH);

    // filet central pointillé
    ctx.fillStyle = '#306230';
    for (let y = 2; y < VH; y += 10) ctx.fillRect(VW / 2 - 1, y, 2, 6);

    // scores (gros chiffres pixelisés)
    ctx.fillStyle = '#0f380f';
    ctx.font = '700 22px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText(String(this.playerScore()), VW * 0.28, 6);
    ctx.fillText(String(this.cpuScore()), VW * 0.72, 6);

    // raquettes + balle (vert foncé)
    ctx.fillStyle = '#0f380f';
    ctx.fillRect(PADDLE_X, this.playerY, PADDLE_W, PADDLE_H);
    ctx.fillRect(VW - PADDLE_X - PADDLE_W, this.cpuY, PADDLE_W, PADDLE_H);
    ctx.fillRect(this.ballX, this.ballY, BALL, BALL);

    // bannière centrale (décompte / point / fin)
    const b = this.banner();
    if (b) {
      ctx.fillStyle = '#0f380f';
      ctx.font = '700 16px "Press Start 2P", monospace';
      ctx.fillText(b, VW / 2, VH / 2 - 8);
    }
  }

  ngOnDestroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Rapproche `v` de `target` d'au plus `step`. */
function approach(v: number, target: number, step: number): number {
  if (Math.abs(target - v) <= step) return target;
  return v + Math.sign(target - v) * step;
}
