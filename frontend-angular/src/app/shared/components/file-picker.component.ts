import { IconComponent, IconName } from './icon.component';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, untracked, output, signal } from '@angular/core';
import { LocaleService } from '@core/i18n/locale.service';

let nextId = 0;

/** "1.4 MB", "320 KB": the size a person reads, never below 1 KB. */
export function fileSizeText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  return bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** The short badge on a chosen file: its extension ("MP4", "PDF"), which reads the same in both languages. */
export function fileKindText(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1) : '';
  return /^[a-z0-9]{1,5}$/i.test(ext) ? ext.toUpperCase() : 'FILE';
}

/**
 * The one way Tafseel asks for a file: a drop zone that is also a button, then the chosen files as
 * rows with their kind, size and a Remove action, an upload state and an error in words.
 *
 * It owns presentation only. The page keeps its own list of files and its own upload, and hears about
 * choices through `picked`; `files`, `busy` and `error` flow back in. The native input stays inside the
 * label, under `inputId`, so a label `for` it, a keyboard user (the zone shows the focus ring) and a
 * browser test's `setInputFiles` all reach it as before.
 */
@Component({
  selector: 'tf-file-picker',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="tf-upload-drop" [class.tf-upload-drop--compact]="compact()" [class.is-dragover]="dragging()"
           [class.is-busy]="busy()" [attr.data-testid]="testId() || null"
           (dragover)="dragOver($event)" (dragleave)="dragging.set(false)" (drop)="drop($event)">
      <input type="file" [id]="inputId()" [attr.accept]="accept() || null" [multiple]="multiple()"
             [disabled]="disabled() || busy()" [attr.aria-label]="ariaLabel() || null"
             [attr.aria-describedby]="hint() ? hintId : null" [attr.aria-invalid]="error() ? 'true' : null"
             (change)="changed($event)">
      <span class="tf-upload-drop-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>
      </span>
      <span class="tf-upload-drop-copy">
        <strong class="tf-upload-drop-title">{{ title() }}</strong>
        @if (hint()) { <small class="tf-upload-drop-hint" [id]="hintId">{{ hint() }}</small> }
      </span>
      <span class="tf-upload-drop-cta" aria-hidden="true">{{ cta() || t('apply_demo_browse', 'Browse files') }}</span>
    </label>
    @if (busy()) {
      <div class="tf-upload-progress" role="status">
        <span class="tf-upload-file-status">{{ busyText() || t('common_uploading', 'Uploading…') }}</span>
        @if (progress() !== null) { <progress class="tf-upload-real-progress" max="100" [value]="progress()" [attr.aria-label]="busyText() || t('common_uploading', 'Uploading…')"></progress> }
        @else { <span class="tf-upload-file-bar" aria-hidden="true"><span></span></span> }
      </div>
    }
    @if (files().length) {
      <ul class="tf-upload-files">
        @for (file of files(); track $index; let index = $index) {
          <li class="tf-upload-file" animate.enter="tf-motion-fade" data-testid="picked-file">
            @if (previews().get(file); as preview) { <img class="tf-upload-file-preview" [src]="preview" alt="" width="44" height="44" /> }
            @else { <span class="tf-upload-file-kind" aria-hidden="true"><tf-icon [name]="fileIcon(file)" [size]="22" iconRole="meta" /></span> }
            <span class="tf-upload-file-main"><strong>{{ file.name }}</strong><span class="tf-upload-file-size"><span class="tf-file-kind-label">{{ kind(file) }}</span> · {{ size(file) }}</span></span>
            @if (removable() && !busy()) {
              <button type="button" class="tf-upload-file-remove" (click)="removed.emit(index)"
                      [attr.aria-label]="t('common_remove', 'Remove') + ' ' + file.name">{{ t('common_remove', 'Remove') }}</button>
            }
          </li>
        }
      </ul>
    }
    @if (error()) { <p class="tf-upload-file-error" role="alert">{{ error() }}</p> }
  `,
  styles: `:host { display: grid; gap: 10px; min-width: 0; }`
})
export class FilePickerComponent {
  private readonly locale = inject(LocaleService);

  readonly inputId = input(`tf-file-${++nextId}`);
  readonly title = input.required<string>();
  /** Accepted kinds and the size limit, in words. */
  readonly hint = input('');
  readonly cta = input('');
  readonly accept = input('');
  readonly multiple = input(false);
  readonly disabled = input(false);
  readonly busy = input(false);
  readonly busyText = input('');
  /** An actual transferred percentage, when the owning gateway reports one; otherwise indeterminate. */
  readonly progress = input<number | null>(null);
  readonly error = input('');
  /** For a zone with no visible label of its own elsewhere. */
  readonly ariaLabel = input('');
  readonly files = input<readonly File[]>([]);
  readonly removable = input(true);
  /** One row instead of a panel, for a composer or a form's optional attachment. */
  readonly compact = input(false);
  readonly testId = input('');

  readonly picked = output<File[]>();
  readonly removed = output<number>();

  readonly dragging = signal(false);
  readonly hintId = `tf-file-hint-${++nextId}`;

  readonly previews = signal<ReadonlyMap<File, string>>(new Map());

  constructor() {
    effect(() => {
      const current = untracked(this.previews), next = new Map<File, string>();
      for (const file of this.files()) {
        if (/^image\/(png|jpeg|webp)$/.test(file.type) && typeof URL.createObjectURL === 'function')
          next.set(file, current.get(file) ?? URL.createObjectURL(file));
      }
      for (const [file, url] of current) if (!next.has(file)) URL.revokeObjectURL(url);
      this.previews.set(next);
    });
    inject(DestroyRef).onDestroy(() => { for (const url of this.previews().values()) URL.revokeObjectURL(url); });
  }

  fileIcon(file: File): IconName {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('audio/')) return 'audio';
    if (file.type.startsWith('video/')) return 'video';
    return 'document';
  }

  t(key: string, fallback: string): string { return this.locale.t(key, fallback); }
  size(file: File): string { return fileSizeText(file.size); }
  kind(file: File): string { return fileKindText(file.name); }

  changed(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = Array.from(input.files ?? []);
    // Cleared so choosing the same file again, after removing it, still fires a change.
    input.value = '';
    if (chosen.length) this.picked.emit(chosen);
  }

  dragOver(event: DragEvent): void {
    if (this.disabled() || this.busy()) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  drop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.disabled() || this.busy()) return;
    const dropped = Array.from(event.dataTransfer?.files ?? []);
    if (dropped.length) this.picked.emit(this.multiple() ? dropped : dropped.slice(0, 1));
  }
}
