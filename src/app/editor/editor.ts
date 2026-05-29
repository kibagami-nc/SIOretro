import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { EditorEngine, Tool } from '../game/editor-engine';
import { ITEM_LABELS, ITEM_TYPES } from '../game/furniture';
import { CHARACTERS, cssColor } from '../characters';

interface ToolButton {
  key: Tool;
  label: string;
  color?: string;
}

@Component({
  selector: 'app-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  readonly play = output<void>();
  readonly exit = output<void>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private engine?: EditorEngine;

  protected readonly tool = signal<Tool>('desk');
  protected readonly count = signal(0);
  protected readonly hasSelection = signal(false);
  protected readonly saved = signal(false);

  protected readonly tools: ToolButton[] = [
    { key: 'select', label: 'Sélection' },
    // tous les objets sauf le PNJ générique : chaque alternant a sa propre catégorie
    ...ITEM_TYPES.filter((t) => t !== 'npc').map((t) => ({ key: t, label: ITEM_LABELS[t] })),
  ];

  /** Une catégorie par alternant : place exactement ce personnage en PNJ. */
  protected readonly npcTools: ToolButton[] = CHARACTERS.map((c) => ({
    key: `npc:${c.id}` as Tool,
    label: c.name,
    color: cssColor(c.color),
  }));

  ngAfterViewInit(): void {
    this.engine = new EditorEngine(this.canvasRef().nativeElement, {
      onChange: (c, sel) => {
        this.count.set(c);
        this.hasSelection.set(sel);
      },
      onTool: (t) => this.tool.set(t),
    });
    this.engine.start();
  }

  protected setTool(t: Tool): void {
    this.engine?.setTool(t);
  }

  protected rotate(): void {
    this.engine?.rotate();
  }

  protected remove(): void {
    this.engine?.removeSelected();
  }

  protected save(): void {
    this.engine?.save();
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 1400);
  }

  protected resetDefault(): void {
    this.engine?.resetDefault();
  }

  protected clearAll(): void {
    this.engine?.clearAll();
  }

  protected export(): void {
    this.engine?.exportJson();
  }

  protected testPlay(): void {
    this.engine?.save();
    this.play.emit();
  }

  protected back(): void {
    this.exit.emit();
  }

  ngOnDestroy(): void {
    this.engine?.dispose();
  }
}
