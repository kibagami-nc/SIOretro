import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { HomeComponent } from './home/home';
import { MenuComponent } from './menu/menu';
import { GameComponent } from './game/game';
import { EditorComponent } from './editor/editor';
import { CHARACTERS, type Character } from './characters';

type View = 'home' | 'menu' | 'game' | 'editor';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HomeComponent, MenuComponent, GameComponent, EditorComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  // l'écran titre s'affiche en premier ; « JOUER » mène au choix du perso
  protected readonly view = signal<View>('home');
  protected readonly selected = signal<Character>(CHARACTERS[0]);

  protected onStart(): void {
    this.view.set('menu');
  }

  protected onPlay(c: Character): void {
    this.selected.set(c);
    this.view.set('game');
  }

  protected onEdit(): void {
    this.view.set('editor');
  }

  protected onEditorPlay(): void {
    this.view.set('game');
  }

  protected onBackHome(): void {
    this.view.set('home');
  }

  protected onExit(): void {
    this.view.set('home');
  }
}
