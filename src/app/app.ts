import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MenuComponent } from './menu/menu';
import { GameComponent } from './game/game';
import { EditorComponent } from './editor/editor';
import { CHARACTERS, type Character } from './characters';

type View = 'menu' | 'game' | 'editor';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MenuComponent, GameComponent, EditorComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly view = signal<View>('menu');
  protected readonly selected = signal<Character>(CHARACTERS[0]);

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

  protected onExit(): void {
    this.view.set('menu');
  }
}
