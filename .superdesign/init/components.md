# Shared UI primitives

Framework: Angular 22.2 standalone components, zoneless change detection, signals, custom CSS. No external component library. Design tokens originate in `css/tafseel.css`; generated feature/global CSS must be changed at its source. Prepared for a Landing audit, 2026-10-05. No external visual reference is implied.

This catalog contains complete source for all shared component primitives and interaction directives. Native buttons, inputs, cards, dialog and tab styles live in the global CSS rather than standalone component classes. Use only the target page dependency subset for a design payload.

## BrandMarkComponent

Source: `frontend-angular/src/app/shared/components/brand-mark.component.ts`. Shared reusable UI component.

Inputs/outputs: tone ('auto');); width (20);); height (27);); alt ('');); eager (true);).

### frontend-angular/src/app/shared/components/brand-mark.component.ts

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The official Tafseel lockup, preserving the mark-to-lettering ratio. */
@Component({
  selector: 'tf-brand-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tone() === 'auto') {
      <img class="tf-brand-lockup tf-brand-lockup-light" decoding="async"
           [attr.loading]="eager() ? null : 'lazy'" src="assets/brand/tafseel-lockup.svg"
           [attr.alt]="alt()" [width]="lockupWidth()" [height]="lockupHeight()" />
      <img class="tf-brand-lockup tf-brand-lockup-dark" decoding="async"
           [attr.loading]="eager() ? null : 'lazy'" src="assets/brand/tafseel-lockup-dark.svg"
           alt="" [width]="lockupWidth()" [height]="lockupHeight()" />
    } @else {
      <img class="tf-brand-lockup" decoding="async"
           [attr.loading]="eager() ? null : 'lazy'"
           [src]="tone() === 'dark' ? 'assets/brand/tafseel-lockup-dark.svg' : 'assets/brand/tafseel-lockup.svg'"
           [attr.alt]="alt()" [width]="lockupWidth()" [height]="lockupHeight()" />
    }
  `,
  styles: `
    :host { display: contents; }
    .tf-brand-lockup-dark { display: none; }
    :host-context(html[data-theme="dark"]) .tf-brand-lockup-light { display: none; }
    :host-context(html[data-theme="dark"]) .tf-brand-lockup-dark { display: block; }
  `
})
export class BrandMarkComponent {
  /** Auto follows the page theme; explicit tones support fixed-color surfaces. */
  readonly tone = input<'light' | 'dark' | 'auto'>('auto');
  readonly width = input(20);
  readonly height = input(27);
  lockupHeight(): number { return Math.max(44, this.height()); }
  lockupWidth(): number { return Math.max(this.width(), Math.round(this.lockupHeight() * 1080 / 475.64)); }
  /** Empty by default: the surrounding link carries the accessible name. */
  readonly alt = input('');
  readonly eager = input(true);
}
```

## FilePickerComponent

Source: `frontend-angular/src/app/shared/components/file-picker.component.ts`. Shared reusable UI component.

Inputs/outputs: inputId (`tf-file-${++nextId}`);); title ();); hint ('');); cta ('');); accept ('');); multiple (false);); disabled (false);); busy (false);); busyText ('');); progress (null);); error ('');); ariaLabel ('');); files ([]);); removable (true);); compact (false);); testId ('');); picked ();); removed ();).

### frontend-angular/src/app/shared/components/file-picker.component.ts

```ts
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
```

## IconComponent

Source: `frontend-angular/src/app/shared/components/icon.component.ts`. Shared reusable UI component.

Inputs/outputs: name ();); size (20);); iconRole ('action');); strokeWidth (1.8);).

### frontend-angular/src/app/shared/components/icon.component.ts

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'eye' | 'eye-off' | 'student' | 'teacher'
  // Navigation and dashboards: one outline family, 24px grid, round joins, the caller's stroke.
  | 'home' | 'search' | 'file-plus' | 'inbox' | 'message' | 'briefcase' | 'megaphone' | 'wallet'
  | 'sliders' | 'clipboard-check' | 'user' | 'flag' | 'users' | 'grid' | 'activity' | 'coins'
  | 'document' | 'image' | 'audio' | 'video'
  | 'history' | 'calendar' | 'clock' | 'arrow-right' | 'check' | 'upload' | 'star' | 'bell';

/**
 * Tafseel's icon set: inline SVG in a single outline family (24px grid, round caps and joins), so an icon in
 * the sidebar, a card and a button read as one hand. Stroke and size come from the caller; colour is
 * `currentColor`. Arrows that point along the reading direction mirror in RTL through `.tf-icon-dir`.
 */
@Component({
  selector: 'tf-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 24 24'" [attr.width]="size()" [attr.height]="size()"
         [attr.class]="name() === 'arrow-right' ? 'tf-icon-dir' : null"
         [attr.data-icon-role]="iconRole()" fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth()"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      @switch (name()) {
        @case ('document') { <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z"/><path d="M14 3v5h5M8 12h8M8 16h6"/> }
        @case ('image') { <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/> }
        @case ('audio') { <path d="M9 18V5l11-2v13M9 7l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/> }
        @case ('video') { <rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/> }
        @case ('eye') {
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>
        }
        @case ('eye-off') {
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-6.5 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94"/>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19"/>
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/>
        }
        @case ('student') {
          <path d="M22 10 12 5 2 10l10 5 10-5Z"/>
          <path d="M6 12v5c0 .7 2.7 2 6 2s6-1.3 6-2v-5"/><path d="M22 10v6"/>
        }
        @case ('teacher') {
          <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        }
        @case ('home') {
          <path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>
        }
        @case ('search') { <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/> }
        @case ('file-plus') {
          <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z"/><path d="M14 3v5h5"/><path d="M12 11v6M9 14h6"/>
        }
        @case ('inbox') {
          <path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6Z"/>
        }
        @case ('message') { <path d="M21 14a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/> }
        @case ('briefcase') {
          <rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>
        }
        @case ('megaphone') { <path d="M3 11v2a1 1 0 0 0 1 1h3l7 5V5L7 10H4a1 1 0 0 0-1 1Z"/><path d="M18 8.5a5 5 0 0 1 0 7"/> }
        @case ('wallet') {
          <path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6"/><path d="M17 14h.01"/>
        }
        @case ('sliders') {
          <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>
        }
        @case ('clipboard-check') {
          <rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="m9 13 2 2 4-4"/>
        }
        @case ('user') { <circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/> }
        @case ('flag') { <path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/> }
        @case ('users') {
          <circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>
        }
        @case ('grid') {
          <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
          <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
        }
        @case ('activity') { <path d="M3 12h4l3-8 4 16 3-8h4"/> }
        @case ('coins') {
          <ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M15 11.5c3.4.3 6 1.5 6 3 0 1.7-2.7 3-6 3-1.4 0-2.7-.2-3.7-.6"/><path d="M21 14.5v4c0 1.7-2.7 3-6 3s-6-1.3-6-3v-3"/>
        }
        @case ('history') { <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/> }
        @case ('calendar') { <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/> }
        @case ('clock') { <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/> }
        @case ('arrow-right') { <path d="M5 12h14"/><path d="m13 6 6 6-6 6"/> }
        @case ('check') { <path d="m5 12 5 5 9-10"/> }
        @case ('upload') { <path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/> }
        @case ('star') { <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/> }
        @case ('bell') { <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/> }
      }
    </svg>
  `,
  styles: `:host { display: contents; }`
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  readonly iconRole = input<'action' | 'status' | 'meta'>('action');
  readonly strokeWidth = input(1.8);
}
```

## LangToggleComponent

Source: `frontend-angular/src/app/shared/components/lang-toggle.component.ts`. Shared reusable UI component.

Inputs/outputs: None.

### frontend-angular/src/app/shared/components/lang-toggle.component.ts

```ts
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { LocaleService } from '@core/i18n/locale.service';

/**
 * Arabic/English switch. The label names the language you would move *to*,
 * written in that language — the convention the legacy pages used.
 *
 * For a signed-in person the choice is also saved on the account (UX-26), so the e-mails Tafseel sends
 * afterwards are in the language they now read the site in. Saving is best effort: the switch never waits
 * more than a moment, and a failed save leaves the e-mail language as it was.
 */
@Component({
  selector: 'tf-lang-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="tf-lang-toggle" (click)="switch()" [disabled]="saving()"
            [attr.aria-label]="label()" [attr.title]="label()"></button>
  `,
  styles: `:host { display: contents; }`
})
export class LangToggleComponent {
  readonly locale = inject(LocaleService);
  private readonly http = inject(HttpClient);
  private readonly session = inject(SESSION_STORE, { optional: true });
  readonly saving = signal(false);
  readonly label = computed(() => (this.locale.lang() === 'ar' ? 'English' : 'العربية'));

  async switch(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    const next = this.locale.lang() === 'ar' ? 'en' : 'ar';
    if (this.session?.current()) {
      try {
        await firstValueFrom(this.http.put<void>('/api/v1/auth/language', { lang: next }).pipe(timeout(2000)));
      } catch { /* the site still switches; e-mails keep the previous language */ }
    }
    try { await this.locale.set(next); }
    finally { this.saving.set(false); }
  }
}
```

## TeacherStylesComponent

Source: `frontend-angular/src/app/shared/components/lazy-feature-styles.component.ts`. Shared reusable UI component.

Inputs/outputs: None.

### frontend-angular/src/app/shared/components/lazy-feature-styles.component.ts

```ts
import { Component, ViewEncapsulation } from '@angular/core';

/** Feature rules are installed with their lazy pages; the token and shell CSS stays global. */
@Component({selector:'tf-teacher-styles',template:'',styleUrl:'../../../generated/teachers.css',encapsulation:ViewEncapsulation.None})
export class TeacherStylesComponent {}

@Component({selector:'tf-booking-styles',template:'',styleUrl:'../../../generated/booking.css',encapsulation:ViewEncapsulation.None})
export class BookingStylesComponent {}
```

## PasswordFieldComponent

Source: `frontend-angular/src/app/shared/components/password-field.component.ts`. Shared reusable UI component.

Inputs/outputs: fieldId ();); label ();); value ('');); name ('');); required (false);); disabled (false);); readOnly (false);); autocomplete ('current-password');); placeholder (null);); invalid (false);); message ('');); focused ();); blurred ();); revealedState (null);).

### frontend-angular/src/app/shared/components/password-field.component.ts

```ts
import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal } from '@angular/core';
import { LocaleService } from '@core/i18n/locale.service';
import { IconComponent } from './icon.component';

/**
 * A password input with its own reveal toggle.
 *
 * The auth page carried this markup four times — two on register, two on reset —
 * each with the full pair of eye SVGs inlined and its own `showPassword` flag.
 * The reveal state belongs to the field, so it lives here.
 */
@Component({
  selector: 'tf-password-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="tf-field">
      <label [attr.for]="fieldId()">{{ label() }}</label>
      <div class="tf-password-wrap">
        <input [id]="fieldId()" [name]="name() || fieldId()" [required]="required()" [disabled]="disabled()" [readOnly]="readOnly()" [type]="revealed() ? 'text' : 'password'" dir="ltr"
               [attr.autocomplete]="autocomplete()" [attr.placeholder]="placeholder()"
               [class.tf-field--invalid]="invalid()" [attr.aria-invalid]="invalid()"
               [attr.aria-describedby]="message() ? fieldId() + '-msg' : null"
               [value]="value()"
               (input)="value.set($any($event.target).value)"
               (focus)="focused.emit()" (blur)="blurred.emit()" />
        <button type="button" class="tf-password-toggle" [disabled]="disabled()" (click)="toggle()"
                [attr.aria-pressed]="revealed()" [attr.aria-label]="toggleLabel()">
          <tf-icon [name]="revealed() ? 'eye-off' : 'eye'" />
        </button>
      </div>
      @if (message(); as text) {
        <span class="tf-field-help" [class.tf-field-error]="invalid()"
              [id]="fieldId() + '-msg'" [attr.role]="invalid() ? 'alert' : null">{{ text }}</span>
      }
    </div>
  `,
  styles: `
    :host { display: contents; }
    .tf-field--invalid { border-color: var(--error); background: var(--error-soft); }
    .tf-field-error { color: var(--error); font-weight: 600; }
    /* The shared sheet removes the outline and only recolours the icon, which is not a visible
       focus indicator; this restores the same 3px ring every other control uses. */
    .tf-password-toggle:focus-visible {
      box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 30%, transparent);
      border-radius: var(--r-sm);
    }
  `
})
export class PasswordFieldComponent {
  private readonly locale = inject(LocaleService);

  readonly fieldId = input.required<string>();
  readonly label = input.required<string>();
  readonly value = model('');
  readonly name = input('');
  readonly required = input(false);
  readonly disabled = input(false);
  readonly readOnly = input(false);
  readonly autocomplete = input<string>('current-password');
  readonly placeholder = input<string | null>(null);
  readonly invalid = input(false);
  readonly message = input<string>('');
  readonly focused = output<void>();
  readonly blurred = output<void>();

  /**
   * Optional shared reveal: password and confirm-password toggled together in
   * the original, so a caller can pass one signal to both fields.
   */
  readonly revealedState = input<ReturnType<typeof signal<boolean>> | null>(null);
  private readonly ownRevealed = signal(false);

  readonly revealed = computed(() => this.revealedState()?.() ?? this.ownRevealed());

  readonly toggleLabel = computed(() =>
    this.locale.lang() === 'ar'
      ? (this.revealed() ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور')
      : (this.revealed() ? 'Hide password' : 'Show password'));

  toggle(): void {
    if (this.disabled()) return;
    const shared = this.revealedState();
    if (shared) shared.set(!shared());
    else this.ownRevealed.set(!this.ownRevealed());
  }
}
```

## PasswordRulesComponent

Source: `frontend-angular/src/app/shared/components/password-rules.component.ts`. Shared reusable UI component.

Inputs/outputs: rules ();); heading ();).

### frontend-angular/src/app/shared/components/password-rules.component.ts

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface PasswordRuleView {
  readonly label: string;
  readonly satisfied: boolean;
}

/**
 * The live checklist under a new-password field.
 *
 * The legacy version built a `badgeStyle` string in JavaScript and re-rendered
 * the whole inline style on every keystroke. The only thing that actually changes
 * per rule is whether it is met, so that is the only thing bound here.
 */
@Component({
  selector: 'tf-password-rules',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tf-pw-rules">
      <span class="tf-pw-rules__heading">{{ heading() }}</span>
      @for (rule of rules(); track rule.label) {
        <div class="tf-pw-rule" [class.tf-pw-rule--met]="rule.satisfied">
          <span class="tf-pw-rule__badge" aria-hidden="true">@if (rule.satisfied) { <svg viewBox="0 0 24 24" width="12" height="12"><path d="m5 12.5 4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg> }</span>
          <span>{{ rule.label }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: contents; }
    .tf-pw-rules {
      display: grid; gap: 6px; padding: 12px 14px;
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: var(--r-sm);
    }
    .tf-pw-rules__heading {
      font-size: var(--type-caption-size); font-weight: 700; color: var(--text-2);
      text-transform: uppercase; letter-spacing: .03em; margin-block-end: 2px;
    }
    .tf-pw-rule {
      display: flex; align-items: center; gap: 8px;
      font-size: var(--type-meta-size); font-weight: 600; color: var(--text-2);
    }
    .tf-pw-rule--met { color: var(--success); }
    .tf-pw-rule__badge {
      display: inline-flex; align-items: center; justify-content: center;
      inline-size: 16px; block-size: 16px; border-radius: 50%;
      font-size: var(--type-caption-size); line-height: 1; flex: none;
      background: var(--surface); color: var(--muted); border: 1px solid var(--border);
      transition: background-color var(--t), color var(--t), border-color var(--t);
    }
    .tf-pw-rule--met .tf-pw-rule__badge {
      background: var(--success-soft); color: var(--success); border-color: transparent;
    }
    @media (prefers-reduced-motion: reduce) { .tf-pw-rule__badge { transition: none; } }
  `
})
export class PasswordRulesComponent {
  readonly rules = input.required<readonly PasswordRuleView[]>();
  readonly heading = input.required<string>();
}
```

## PricePanelComponent

Source: `frontend-angular/src/app/shared/components/price-panel.component.ts`. Shared reusable UI component.

Inputs/outputs: order ();); paid (false);); emphasis (false);).

### frontend-angular/src/app/shared/components/price-panel.component.ts

```ts
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { AgreedPriceSource, PriceRow, agreedPrice } from '@shared/models/agreed-price';
import { PriceComponent } from './price.component';

/**
 * What the student pays, and — when the teacher accepted at a different price — what they were shown when
 * they sent the request (UX-09).
 *
 * The request, the order and checkout all render this one component, so the three screens cannot drift into
 * three different accounts of the same money. The rows come from `agreedPrice`; this only puts words and the
 * house money mark on them.
 */
@Component({
  selector: 'tf-price-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PriceComponent],
  template: `
    <dl class="tf-price-panel" [attr.data-comparison]="view().comparison" [attr.data-emphasis]="emphasis()" data-testid="price-panel">
      @for (row of view().rows; track row.key) {
        <div class="tf-price-panel-row" [attr.data-row]="row.key" [attr.data-testid]="'price-row-' + row.key">
          <dt>{{ label(row) }}</dt>
          <dd><tf-price [amount]="row.amount" [currency]="view().currency" [size]="row.key === 'total' ? totalSize() : ''" /></dd>
        </div>
      }
    </dl>
    @if (reason(); as why) {
      <p class="tf-price-panel-reason" data-testid="price-reason"><strong>{{ locale.t('price_reason_label', 'Why the price changed (the teacher’s words):') }}</strong> <span dir="auto">{{ why }}</span></p>
    }
    @if (!paid()) {
      <p class="tf-price-panel-note" data-testid="price-note">{{ locale.t('price_nothing_charged', 'Nothing is charged unless you choose to pay.') }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .tf-price-panel { display: flex; flex-direction: column; gap: 12px; margin: 0; }
    .tf-price-panel-row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; font-size: var(--type-body-size); }
    .tf-price-panel-row dt { color: var(--text-2); margin: 0; }
    .tf-price-panel-row dd { margin: 0; font-weight: 650; text-align: end; word-break: break-word; }
    .tf-price-panel-row[data-row='total'] { margin-block-start: 4px; padding-block-start: 14px; border-block-start: 1px solid var(--border); }
    .tf-price-panel-row[data-row='total'] dt { color: var(--text); font-weight: 650; }
    .tf-price-panel-reason { margin: 12px 0 0; padding: 10px 12px; font-size: var(--type-body-sm-size); line-height: 1.6; background: var(--surface-2); border-radius: var(--r-sm); }
    .tf-price-panel-note { margin: 12px 0 0; font-size: var(--type-label-size); color: var(--text-2); line-height: 1.5; max-width: 48ch; }
    /* Checkout: the amount being charged is the loudest thing on the screen, as it was before UX-09. */
    .tf-price-panel[data-emphasis='true'] .tf-price-panel-row[data-row='total'] { margin-block-start: 8px; padding-block-start: 16px; }
    .tf-price-panel[data-emphasis='true'] .tf-price-panel-row[data-row='total'] dd {
      font-family: var(--font-display); font-weight: 700; letter-spacing: -.03em; font-variant-numeric: tabular-nums; line-height: 1.1;
    }
  `
})
export class PricePanelComponent {
  readonly locale = inject(LocaleService);
  private readonly fmt = inject(FormatService);

  /** The order, straight from the API: its price, fee, total and captured listed price. */
  readonly order = input.required<AgreedPriceSource>();
  /** True once the money has actually been taken, which changes only the last label. */
  readonly paid = input(false);
  /** Checkout sizes the total like the headline it is; the detail pages keep it in the body scale. */
  readonly emphasis = input(false);

  readonly view = computed(() => agreedPrice(this.order(), this.paid()));
  /** Shown only when the agreed price differs from the listed one and the teacher explained it. */
  readonly reason = computed(() => {
    const value = this.order().priceChangeReason;
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  });
  readonly totalSize = computed<'md' | 'xl' | ''>(() => (this.emphasis() ? 'xl' : 'md'));

  label(row: PriceRow): string {
    return row.percent === undefined
      ? this.locale.t(row.labelKey, row.fallback)
      // The fee is the one label that carries a number, and it is the rate the order recorded — not a
      // constant this screen knows.
      : this.locale.format(row.labelKey, { percent: this.fmt.number(row.percent, { maximumFractionDigits: 2 }) }, row.fallback);
  }
}
```

## PriceComponent

Source: `frontend-angular/src/app/shared/components/price.component.ts`. Shared reusable UI component.

Inputs/outputs: amount ();); currency ('SAR');); emptyText (undefined);); size ('');).

### frontend-angular/src/app/shared/components/price.component.ts

```ts
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';

/**
 * An amount of money, rendered the way Tafseel renders money.
 *
 * SAR is drawn with the official SAMA mark (U+20C1) via the self-hosted
 * `saudi_riyal` face — the same glyph in Arabic and English. Every other
 * currency falls back to `amount CODE`. The legacy pages repeated this pair of
 * `sc-if` branches at every price on every screen; the decision belongs to the
 * amount, not to each site that shows one.
 *
 * `dir="ltr"` is on the number on purpose: prices read left-to-right even in an
 * Arabic layout.
 */
@Component({
  selector: 'tf-price',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view().isSarAmount) {
      <span class="tf-price-line" dir="ltr">
        <span class="tf-price-currency tf-price-currency--mark"
              [title]="currencyName()" [attr.aria-label]="currencyName()" data-i18n-skip></span>@if (size(); as scale) {
          <strong [class]="'tf-price-' + scale">{{ view().amountNumber }}</strong>
        } @else {
          {{ view().amountNumber }}
        }
      </span>
    } @else {
      {{ view().amount }}
    }
  `,
  styles: `:host { display: contents; }`
})
export class PriceComponent {
  private readonly fmt = inject(FormatService);
  private readonly locale = inject(LocaleService);

  readonly amount = input.required<number | string | null | undefined>();
  readonly currency = input<string>('SAR');
  /** Shown when the amount is missing; defaults to the translated placeholder. */
  readonly emptyText = input<string | undefined>(undefined);
  /**
   * Type scale, when the site wants one. It has to sit *inside* `.tf-price-line`
   * because `css/tafseel.css` sizes the riyal mark from it
   * (`.tf-price-line:has(.tf-price-md) .tf-price-currency--mark`) — putting the
   * class on a wrapper would leave the mark at body size beside a 28px number.
   */
  readonly size = input<'md' | 'lg' | 'xl' | ''>('');

  readonly view = computed(() =>
    this.fmt.moneyView(this.amount(), this.currency(), this.emptyText()));

  /**
   * What a screen reader says for the drawn mark. It is the only word on the price, so in Arabic it is an
   * Arabic word — "SAR" read aloud in an Arabic sentence is the same defect as printing it (UX-06).
   */
  readonly currencyName = computed(() => this.locale.t('currency_sar', 'SAR'));
}
```

## PromotionContentComponent

Source: `frontend-angular/src/app/shared/components/promotion-content.component.ts`. Shared reusable UI component.

Inputs/outputs: title ();); body ('');); titleId ('promo-wizard-title');); lead ('mark');); figure ('');); figureNote ('');); dateDay ('');); dateMonth ('');); code ('');); codeLabel ('');); copyLabel ('');); interactive (true);); units (null);); countdownLabel ('');); copyRequested ();).

### frontend-angular/src/app/shared/components/promotion-content.component.ts

```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** The same campaign content in the public dialog and the local editor preview. */
@Component({
  selector: 'tf-promotion-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ':host{display:contents}',
  template: `
    @switch (lead()) {
      @case ('figure') { <p class="tf-promo-lead tf-promo-lead--figure"><span class="tf-promo-lead-figure">{{ figure() }}</span><span class="tf-promo-lead-note">{{ figureNote() }}</span></p> }
      @case ('date') { <div class="tf-promo-lead"><div class="tf-promo-date"><span class="tf-promo-date-day">{{ dateDay() }}</span><span class="tf-promo-date-month">{{ dateMonth() }}</span></div></div> }
      @default { <div class="tf-promo-lead tf-promo-lead--mark" aria-hidden="true"><img data-tafseel-mark data-tafseel-mark-force="dark" src="assets/brand/tafseel-mark-dark.svg" alt="" width="48" height="65" /></div> }
    }
    <div class="tf-promo-wizard-copy">
      <h2 class="tf-promo-title" [id]="titleId()">{{ title() }}</h2>
      @if (body()) { <p class="tf-promo-body">{{ body() }}</p> }
      @if (code()) {
        <div class="tf-promo-field"><span class="tf-promo-field-label">{{ codeLabel() }}</span>
          @if (interactive()) { <button type="button" class="tf-promo-code" data-testid="promo-code" (click)="copyRequested.emit()"><span class="tf-promo-code-value">{{ code() }}</span><span class="tf-promo-code-copy">{{ copyLabel() }}</span></button> }
          @else { <span class="tf-promo-code"><span class="tf-promo-code-value">{{ code() }}</span></span> }
        </div>
      }
      @if (units(); as countdown) {
        <div class="tf-promo-field"><span class="tf-promo-field-label">{{ countdownLabel() }}</span><div class="tf-promo-countdown" role="timer" [attr.aria-label]="countdownLabel()">
          @for (unit of countdown; track unit.label) { <span class="tf-promo-countdown-unit"><span class="tf-promo-countdown-value">{{ unit.value }}</span><span class="tf-promo-countdown-label">{{ unit.label }}</span></span> }
        </div></div>
      }
    </div>
  `
})
export class PromotionContentComponent {
  readonly title = input.required<string>();
  readonly body = input('');
  readonly titleId = input('promo-wizard-title');
  readonly lead = input<'figure' | 'date' | 'mark'>('mark');
  readonly figure = input('');
  readonly figureNote = input('');
  readonly dateDay = input('');
  readonly dateMonth = input('');
  readonly code = input('');
  readonly codeLabel = input('');
  readonly copyLabel = input('');
  readonly interactive = input(true);
  readonly units = input<readonly { value: string; label: string }[] | null>(null);
  readonly countdownLabel = input('');
  readonly copyRequested = output<void>();
}
```

### frontend-angular/src/app/shared/components/protected-file-viewer.component.html

```html
<dialog #dialog class="tf-secure-media-dialog" [attr.aria-labelledby]="headingId" (click)="backdrop($event)" (cancel)="close()">
  <header class="tf-secure-media-head">
    <div>
      <span>{{ t('protected_viewer_label', 'Protected viewer') }}</span>
      <h2 [id]="headingId">{{ fileName() }}</h2>
    </div>
    <button type="button" (click)="close()" [attr.aria-label]="t('common_close', 'Close')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </header>
  <div class="tf-secure-media-stage" (contextmenu)="prevent($event)" (dragstart)="prevent($event)">
    @if (loading()) {
      <p class="tf-secure-media-status" role="status">{{ t('common_loading', 'Loading…') }}</p>
    } @else if (failed()) {
      <p class="tf-secure-media-status" role="alert">{{ t('protected_viewer_failed', 'The file could not be opened.') }}</p>
      <button type="button" class="tf-button tf-button-secondary" (click)="retry()">{{ t('common_retry', 'Retry') }}</button>
    } @else if (kind() === 'image') {
      <img [src]="url()" [alt]="fileName()" draggable="false" />
    } @else if (kind() === 'video') {
      <video [src]="url()" controls controlsList="nodownload noplaybackrate" disablePictureInPicture></video>
    } @else if (kind() === 'audio') {
      <audio [src]="url()" controls controlsList="nodownload noplaybackrate"></audio>
    } @else if (kind() === 'pdf') {
      <iframe [src]="frameUrl()" [title]="fileName()"></iframe>
    } @else {
      <p class="tf-secure-media-status" role="alert">{{ t('protected_viewer_unsupported', 'This file must be provided as a PDF or browser-viewable media.') }}</p>
    }
    @if (!loading() && !failed() && kind() !== 'unsupported') {
      <div class="tf-secure-media-watermark" aria-hidden="true">
        <span>{{ watermark }}</span><span>{{ watermark }}</span><span>{{ watermark }}</span>
      </div>
    }
  </div>
  <p class="tf-secure-media-note">{{ t('protected_viewer_note', 'This material is available for viewing inside Tafseel only.') }}</p>
</dialog>
```

## ProtectedFileViewerComponent

Source: `frontend-angular/src/app/shared/components/protected-file-viewer.component.ts`. Shared reusable UI component.

Inputs/outputs: None.

### frontend-angular/src/app/shared/components/protected-file-viewer.component.ts

```ts
import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { ProtectedFile, ProtectedObjectUrl } from '@core/http/protected-file.service';
import { LocaleService } from '@core/i18n/locale.service';

type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'unsupported';
let viewerSequence = 0;

@Component({
  selector: 'tf-protected-file-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './protected-file-viewer.component.html',
  styles: ':host{display:contents}'
})
export class ProtectedFileViewerComponent implements OnDestroy {
  readonly headingId = `protected-file-title-${++viewerSequence}`;
  @ViewChild('dialog', { static: true }) private readonly dialog?: ElementRef<HTMLDialogElement>;
  private readonly files = inject(ProtectedFile);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly session = inject(SESSION_STORE);
  private readonly locale = inject(LocaleService);
  private object: ProtectedObjectUrl | null = null;
  private request = 0;
  private source: { path: string; fileName: string; type: string } | undefined;

  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly fileName = signal('');
  readonly url = signal('');
  readonly frameUrl = signal<SafeResourceUrl | null>(null);
  readonly kind = signal<PreviewKind>('unsupported');
  readonly watermark = this.session.current()?.email || this.session.current()?.fullName || 'Tafseel';

  async open(path: string, fileName: string, declaredType = ''): Promise<void> {
    this.source = { path, fileName, type: declaredType };
    const request = ++this.request;
    this.release();
    this.fileName.set(fileName);
    this.kind.set(this.mediaKind(declaredType, fileName));
    this.loading.set(true);
    this.failed.set(false);
    if (this.dialog && !this.dialog.nativeElement.open) this.dialog.nativeElement.showModal();
    try {
      const object = await this.files.objectUrl(path);
      if (request !== this.request) { object?.revoke(); return; }
      if (!object) throw new Error('missing-file');
      this.object = object;
      this.kind.set(this.mediaKind(object.contentType || declaredType, fileName));
      this.url.set(object.url);
      if (this.kind() === 'pdf') {
        this.frameUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(
          `${object.url}#toolbar=0&navpanes=0&statusbar=0&messages=0`
        ));
      }
    } catch {
      if (request === this.request) this.failed.set(true);
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  close(): void {
    this.request++;
    this.dialog?.nativeElement.close();
    this.release();
    this.source = undefined;
  }

  retry(): void {
    if (this.source && !this.loading()) void this.open(this.source.path, this.source.fileName, this.source.type);
  }

  backdrop(event: MouseEvent): void {
    if (event.target === this.dialog?.nativeElement) this.close();
  }

  prevent(event: Event): void { event.preventDefault(); }
  t(key: string, fallback: string): string { return this.locale.t(key, fallback); }
  ngOnDestroy(): void { this.request++; this.source = undefined; this.release(); }

  private release(): void {
    this.object?.revoke();
    this.object = null;
    this.url.set('');
    this.frameUrl.set(null);
  }

  private mediaKind(contentType: string, fileName: string): PreviewKind {
    const type = contentType.toLowerCase();
    if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(fileName)) return 'image';
    if (type.startsWith('video/') || /\.(mp4|webm)$/i.test(fileName)) return 'video';
    if (type.startsWith('audio/') || /\.(wav|mp3|m4a|aac|ogg)$/i.test(fileName)) return 'audio';
    if (type === 'application/pdf' || /\.pdf$/i.test(fileName)) return 'pdf';
    return 'unsupported';
  }
}
```

### frontend-angular/src/app/shared/components/skeleton.component.css

```css
:host{display:block;min-inline-size:0}
.tf-loading-shape__form{display:grid;gap:var(--space-5);padding:var(--space-5);border:1px solid var(--border-subtle);border-radius:var(--r-lg);background:var(--surface)}
.tf-loading-shape__control{block-size:44px;inline-size:100%;border-radius:var(--r-sm)}
.tf-loading-shape[data-kind="queue"] .tf-loading-shape__content,.tf-loading-shape[data-kind="table"] .tf-loading-shape__content{gap:0;border:1px solid var(--border-subtle);border-radius:var(--r-md);overflow:hidden}
.tf-loading-shape[data-kind="queue"] .tf-loading-shape__row,.tf-loading-shape[data-kind="table"] .tf-loading-shape__row{border:0;border-block-start:1px solid var(--border-subtle);border-radius:0}
.tf-loading-shape[data-kind="table"] .tf-loading-shape__lines{grid-template-columns:repeat(3,minmax(0,1fr));align-items:center}
.tf-loading-shape[data-kind="table"] .tf-loading-shape__lines i{inline-size:85%;block-size:14px}
.tf-loading-shape{inline-size:100%;min-inline-size:0}
.tf-loading-shape__content{display:grid;gap:var(--space-4)}
.tf-loading-shape__row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:var(--space-4);
  padding:var(--space-5);border:1px solid var(--border-subtle);border-radius:var(--r-lg);background:var(--surface)}
.tf-loading-shape i{display:block;min-inline-size:0}
.tf-loading-shape__lines{display:grid;gap:var(--space-3)}
.tf-loading-shape__title{inline-size:65%;block-size:18px}
.tf-loading-shape__line{inline-size:90%;block-size:13px}
.tf-loading-shape__short{inline-size:45%;block-size:12px}
.tf-loading-shape__action{inline-size:72px;block-size:32px}
.tf-loading-shape__avatar{inline-size:64px;block-size:64px;border-radius:var(--r-md)}
.tf-loading-shape__identity{display:grid;grid-template-columns:80px minmax(0,1fr);align-items:center;gap:var(--space-5);padding:var(--space-6)}
.tf-loading-shape__identity>div{display:grid;gap:var(--space-3)}
.tf-loading-shape__identity .tf-loading-shape__avatar{inline-size:80px;block-size:80px}
.tf-loading-shape__summary{display:grid;gap:var(--space-3);padding:var(--space-5);border-block:1px solid var(--border-subtle)}
.tf-loading-shape[data-kind="teachers"] .tf-loading-shape__content{grid-template-columns:repeat(3,minmax(0,1fr))}
.tf-loading-shape[data-kind="teachers"] .tf-loading-shape__row{grid-template-columns:64px minmax(0,1fr);min-block-size:270px;align-content:start}
.tf-loading-shape[data-kind="teachers"] .tf-loading-shape__action{grid-column:1/-1;inline-size:100%;margin-block-start:var(--space-6)}
.tf-loading-shape[data-kind="slots"] .tf-loading-shape__content{grid-template-columns:repeat(3,minmax(0,1fr))}
.tf-loading-shape[data-kind="slots"] .tf-loading-shape__row{grid-template-columns:minmax(0,1fr);padding:var(--space-3)}
.tf-loading-shape[data-kind="slots"] .tf-loading-shape__action{display:none}
.tf-loading-shape[data-kind="balances"] .tf-loading-shape__content{grid-template-columns:repeat(3,minmax(0,1fr))}
.tf-loading-shape[data-kind="balances"] .tf-loading-shape__row{grid-template-columns:minmax(0,1fr);min-block-size:145px}
.tf-loading-shape[data-kind="balances"] .tf-loading-shape__action{display:none}
@media(max-width:767px){.tf-loading-shape[data-kind="teachers"] .tf-loading-shape__content,.tf-loading-shape[data-kind="balances"] .tf-loading-shape__content{grid-template-columns:minmax(0,1fr)}}


.tf-loading-shape[data-kind="work"] .tf-loading-shape__content{gap:0;border:1px solid var(--border-subtle);border-radius:var(--r-lg);overflow:hidden}
.tf-loading-shape[data-kind="work"] .tf-loading-shape__row{border:0;border-block-start:1px solid var(--border-subtle);border-radius:0}
.tf-loading-shape[data-kind="work"] .tf-loading-shape__row:first-child{border-block-start:0}
.tf-loading-shape[data-kind="detail"] .tf-loading-shape__content{grid-template-columns:minmax(0,1fr) minmax(240px,340px)}
.tf-loading-shape[data-kind="detail"] .tf-loading-shape__row:first-child{grid-row:span 2;min-block-size:320px;align-content:start}
@media(max-width:960px){.tf-loading-shape[data-kind="detail"] .tf-loading-shape__content{grid-template-columns:minmax(0,1fr)}.tf-loading-shape[data-kind="detail"] .tf-loading-shape__row:first-child{grid-row:auto;min-block-size:200px}}
```

## SkeletonComponent

Source: `frontend-angular/src/app/shared/components/skeleton.component.ts`. Shared reusable UI component.

Inputs/outputs: kind ('work');); label ('');); avatarSrc ('');); avatarTransitionName ('none');).

### frontend-angular/src/app/shared/components/skeleton.component.ts

```ts
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { LocaleService } from '@core/i18n/locale.service';

/** The shapes describe real page anatomy; no invented data or simulated progress. */
@Component({
  selector: 'tf-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './skeleton.component.css',
  template: `
    <div class="tf-loading-shape" data-state="loading" [attr.data-kind]="kind()" role="status" aria-live="polite" aria-busy="true">
      <span class="tf-sr-only">{{ label() || locale.t('common_loading', 'Loading…') }}</span>
      <div aria-hidden="true" class="tf-loading-shape__content">
        @if (kind() === 'profile') {
          <div class="tf-loading-shape__identity">
            @if (avatarSrc()) {
              <img class="tf-loading-shape__avatar" [src]="avatarSrc()" [style.view-transition-name]="avatarTransitionName()" alt="" width="80" height="80" />
            } @else { <i class="tf-skeleton tf-loading-shape__avatar"></i> }
            <div><i class="tf-skeleton tf-loading-shape__title"></i><i class="tf-skeleton tf-loading-shape__line"></i><i class="tf-skeleton tf-loading-shape__short"></i></div>
          </div>
          <div class="tf-loading-shape__summary"><i class="tf-skeleton tf-loading-shape__line"></i><i class="tf-skeleton tf-loading-shape__short"></i></div>
        }
        @if (kind() === 'form') {
          <div class="tf-loading-shape__form">
            @for (row of rows; track row) { <div class="tf-loading-shape__lines"><i class="tf-skeleton tf-loading-shape__short"></i><i class="tf-skeleton tf-loading-shape__control"></i></div> }
            <i class="tf-skeleton tf-loading-shape__action"></i>
          </div>
        } @else { @for (row of rows; track row) {
          <div class="tf-loading-shape__row">
            @if (kind() === 'teachers') { <i class="tf-skeleton tf-loading-shape__avatar"></i> }
            <div class="tf-loading-shape__lines"><i class="tf-skeleton tf-loading-shape__title"></i><i class="tf-skeleton tf-loading-shape__line"></i><i class="tf-skeleton tf-loading-shape__short"></i></div>
            <i class="tf-skeleton tf-loading-shape__action"></i>
          </div>
        } }
      </div>
    </div>
  `
})
export class SkeletonComponent {
  readonly locale = inject(LocaleService);
  readonly kind = input<'profile' | 'teachers' | 'work' | 'slots' | 'detail' | 'balances' | 'queue' | 'table' | 'form'>('work');
  readonly label = input('');
  readonly avatarSrc = input('');
  readonly avatarTransitionName = input('none');
  readonly rows = [0, 1, 2];
}
```

## TextFieldComponent

Source: `frontend-angular/src/app/shared/components/text-field.component.ts`. Shared reusable UI component.

Inputs/outputs: fieldId ();); label ();); value ('');); name ('');); required (false);); disabled (false);); readOnly (false);); type ('text');); autocomplete (null);); placeholder (null);); inputMode (null);); maxLength (null);); dir (null);); invalid (false);); message ('');); blurred ();).

### frontend-angular/src/app/shared/components/text-field.component.ts

```ts
import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

/**
 * Label, control, and the one message slot beneath it.
 *
 * The legacy pages repeated this trio for every input and hand-wrote the invalid
 * styling as an inline `style="border-color:var(--error);…"` at each site. Here
 * the invalid state is a class the stylesheet already knows, and the error is
 * announced once, in one place.
 */
@Component({
  selector: 'tf-text-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tf-field">
      <label [attr.for]="fieldId()">{{ label() }}</label>
      <input [id]="fieldId()" [name]="name() || fieldId()" [required]="required()" [disabled]="disabled()" [readOnly]="readOnly()" [type]="type()" [attr.inputmode]="inputMode()"
             [attr.autocomplete]="autocomplete()" [attr.placeholder]="placeholder()"
             [attr.maxlength]="maxLength()" [attr.dir]="direction()"
             [attr.spellcheck]="type() === 'email' ? 'false' : null"
             [class.tf-field--invalid]="invalid()"
             [attr.aria-invalid]="invalid()"
             [attr.aria-describedby]="message() ? fieldId() + '-msg' : null"
             [value]="value()"
             (input)="value.set($any($event.target).value)"
             (blur)="blurred.emit()" />
      @if (message(); as text) {
        <span class="tf-field-help" [class.tf-field-error]="invalid()"
              [id]="fieldId() + '-msg'" [attr.role]="invalid() ? 'alert' : null">{{ text }}</span>
      }
    </div>
  `,
  styles: `
    :host { display: contents; }
    /* The legacy markup set these inline at every call site; they belong to the
       field, and only apply when the field says it is invalid. */
    .tf-field--invalid { border-color: var(--error); background: var(--error-soft); }
    .tf-field-error { color: var(--error); font-weight: 600; }
  `
})
export class TextFieldComponent {
  readonly fieldId = input.required<string>();
  readonly label = input.required<string>();
  readonly value = model('');
  readonly name = input('');
  readonly required = input(false);
  readonly disabled = input(false);
  readonly readOnly = input(false);
  readonly type = input<'text' | 'email' | 'password'>('text');
  readonly autocomplete = input<string | null>(null);
  readonly placeholder = input<string | null>(null);
  readonly inputMode = input<string | null>(null);
  readonly maxLength = input<number | null>(null);
  readonly dir = input<string | null>(null);
  /** An address is Latin left-to-right text; in an RTL field its "@" and "." jump ends as it is typed. */
  readonly direction = computed(() => this.dir() ?? (this.type() === 'email' ? 'ltr' : null));
  readonly invalid = input(false);
  /** Error when `invalid`, hint otherwise — one slot, so they cannot both show. */
  readonly message = input<string>('');
  readonly blurred = output<void>();
}
```

## ThemeToggleComponent

Source: `frontend-angular/src/app/shared/components/theme-toggle.component.ts`. Shared reusable UI component.

Inputs/outputs: None.

### frontend-angular/src/app/shared/components/theme-toggle.component.ts

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LocaleService } from '@core/i18n/locale.service';
import { ThemeService } from '@core/theme/theme.service';

let nextMaskId = 0;

/**
 * Light/dark switch. One icon morphs between a crescent and a sun: the disc
 * shrinks, the shadow that bites it slides away and the rays open. Every step is
 * driven by `css/tafseel.css` through `html[data-theme]`, so nothing is toggled
 * from here and the first paint is already right.
 */
@Component({
  selector: 'tf-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="tf-theme-toggle" (click)="theme.toggle()" [attr.aria-label]="label()">
      <svg class="tf-theme-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <mask [attr.id]="maskId">
          <rect width="24" height="24" fill="#fff" />
          <circle class="tf-theme-icon__bite" cx="18.5" cy="5.5" r="7" fill="#000" />
        </mask>
        <circle class="tf-theme-icon__disc" cx="12" cy="12" r="8.5" [attr.mask]="'url(#' + maskId + ')'" />
        <g class="tf-theme-icon__rays">
          <path d="M12 1.75v1.5M12 20.75v1.5M1.75 12h1.5M20.75 12h1.5M4.75 4.75l1.06 1.06M18.19 18.19l1.06 1.06M4.75 19.25l1.06-1.06M18.19 5.81l1.06-1.06" />
        </g>
      </svg>
    </button>
  `,
  styles: `:host { display: contents; }`
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
  private readonly locale = inject(LocaleService);

  /** Mask ids are document-global, and a page can hold more than one toggle. */
  readonly maskId = `tf-theme-mask-${nextMaskId++}`;

  readonly label = computed(() =>
    this.locale.lang() === 'ar' ? 'تبديل المظهر' : 'Toggle theme');
}
```

## TimeZoneSelectComponent

Source: `frontend-angular/src/app/shared/components/time-zone-select.component.ts`. Shared reusable UI component.

Inputs/outputs: fieldId ();); name ('');); value ();); choices ();); invalid (false);); disabled (false);); describedBy ('');); valueChange ();).

### frontend-angular/src/app/shared/components/time-zone-select.component.ts

```ts
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { LocaleService } from '@core/i18n/locale.service';
import { timeZoneLabel } from '@shared/utils/time-zones';

/** A native select with a local search; filtering never changes the saved IANA value. */
@Component({
  selector: 'tf-time-zone-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (choices().length > 12) {
      <label class="tf-sr-only" [for]="fieldId() + '-search'">{{ locale.t('craft_zone_search', 'Search for a city or time zone') }}</label>
      <input type="search" autocomplete="off" [id]="fieldId() + '-search'" [name]="fieldId() + '-search'"
        [placeholder]="locale.t('craft_zone_search', 'Search for a city or time zone')" [value]="search()"
        (input)="search.set($any($event.target).value)" [disabled]="disabled()" />
    }
    <select [id]="fieldId()" [name]="name() || fieldId()" [value]="value()" [disabled]="disabled()"
      [attr.aria-invalid]="invalid() || null" [attr.aria-describedby]="describedBy() || null"
      (change)="valueChange.emit($any($event.target).value)">
      @for (choice of visible(); track choice.zone) { <option [value]="choice.zone" [selected]="choice.zone === value()">{{ choice.label }}</option> }
    </select>
    @if (search() && !matches().length) { <span class="tf-field-help" role="status">{{ locale.t('craft_zone_no_results', 'No matching zones. Your current selection is kept.') }}</span> }
  `,
  styles: ':host{display:grid;gap:var(--space-2,8px);min-inline-size:0}'
})
export class TimeZoneSelectComponent {
  readonly locale = inject(LocaleService);
  readonly fieldId = input.required<string>();
  readonly name = input('');
  readonly value = input.required<string>();
  readonly choices = input.required<readonly string[]>();
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly describedBy = input('');
  readonly valueChange = output<string>();
  readonly search = signal('');
  readonly options = computed(() => [...new Set([this.value(), ...this.choices()].filter(Boolean))].map(zone => ({ zone, label: timeZoneLabel(zone, this.locale.lang()) })));
  readonly matches = computed(() => {
    const needle = this.search().trim().toLocaleLowerCase(this.locale.lang());
    return this.options().filter(option => `${option.zone.replaceAll('_', ' ')} ${option.label}`.toLocaleLowerCase(this.locale.lang()).includes(needle));
  });
  readonly visible = computed(() => {
    const current = this.options().find(option => option.zone === this.value());
    return current && !this.matches().includes(current) ? [current, ...this.matches()] : this.matches();
  });
}
```

## ToastComponent

Source: `frontend-angular/src/app/shared/components/toast.component.ts`. Shared reusable UI component.

Inputs/outputs: message ('');).

### frontend-angular/src/app/shared/components/toast.component.ts

```ts
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ToastService } from '@shared/services/toast.service';

/**
 * The transient confirmation strip. Positioning and the rise animation come from
 * the stylesheet; the legacy pages inlined all of it at each use site.
 */
@Component({
  selector: 'tf-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The live region is always in the page and only its content comes and goes:
  // a region inserted together with its text is often not announced at all.
  template: `
    <div class="tf-toast-region" role="status" aria-live="polite" aria-atomic="true">
      @if (text(); as shown) {
        <div class="tf-toast" [class.is-leaving]="toasts.leaving()">{{ shown }}</div>
      }
    </div>
  `,
  styles: `
    :host { display: contents; }
    /* Out of flow, so the empty region adds no gap to the grid or flex row it sits in. */
    .tf-toast-region { position: fixed; inline-size: 0; block-size: 0; }
    .tf-toast.is-leaving { opacity: 0; transform: translateY(6px); }
    .tf-toast {
      position: fixed; inset-block-end: 24px; inset-inline-end: 24px; z-index: 80;
      background: var(--surface); box-shadow: var(--shadow-lg);
      border-radius: var(--r-md); padding: 14px 18px;
      font-size: var(--type-body-sm-size); font-weight: 500; max-inline-size: 320px;
      animation: tf-rise 220ms ease both;
      transition: opacity 180ms ease, transform 180ms ease;
    }
    @media (prefers-reduced-motion: reduce) { .tf-toast { animation: none; } }
  `
})
export class ToastComponent {
  readonly toasts = inject(ToastService);

  /** An explicit message wins; otherwise the component shows the shared one. */
  readonly message = input<string>('');
  readonly text = () => this.message() || this.toasts.message();
}
```

### frontend-angular/src/app/shared/components/ui-state.component.css

```css
:host{display:block;min-inline-size:0}
.tf-ui-state{display:grid;justify-items:center;gap:var(--space-4);padding:var(--space-8) var(--space-6);
  color:var(--text);text-align:center;border:1px solid var(--border-subtle);border-radius:var(--r-lg);background:var(--surface)}
.tf-ui-state__symbol{display:grid;place-items:center;inline-size:52px;block-size:52px;border-radius:var(--r-md);
  background:var(--primary-soft);color:var(--primary);flex:none}
.tf-ui-state[data-state="success"] .tf-ui-state__symbol{background:var(--success-soft);color:var(--success)}
.tf-ui-state[data-state="error"] .tf-ui-state__symbol{background:var(--error-soft);color:var(--error)}
.tf-ui-state[data-state="waiting"] .tf-ui-state__symbol{background:var(--info-soft);color:var(--info)}
.tf-ui-state[data-variant="caught-up"]{background:transparent;border-style:dashed}
.tf-ui-state__copy{display:grid;justify-items:inherit;gap:var(--space-related);min-inline-size:0;max-inline-size:58ch}
.tf-ui-state__title{margin:0;font-size:var(--type-item-title-size);line-height:var(--type-item-title-line);font-weight:var(--weight-strong);text-wrap:balance}
.tf-ui-state__body{margin:0;color:var(--text-2);font-size:var(--type-body-sm-size);line-height:var(--type-body-sm-line);text-wrap:pretty}
.tf-ui-state__actions{display:flex;flex-wrap:wrap;justify-content:center;gap:var(--space-2);margin-block-start:var(--space-2)}
.tf-ui-state__actions:empty{display:none}
.tf-ui-state--compact{display:flex;align-items:flex-start;justify-content:flex-start;text-align:start;padding:var(--space-4);gap:var(--space-3)}
.tf-ui-state--compact .tf-ui-state__symbol{inline-size:40px;block-size:40px}
.tf-ui-state--compact .tf-ui-state__copy{justify-items:start}
.tf-ui-state--compact .tf-ui-state__actions{justify-content:flex-start}
```

## UiStateComponent

Source: `frontend-angular/src/app/shared/components/ui-state.component.ts`. Shared reusable UI component.

Inputs/outputs: state ('empty');); variant ('first-use');); title ();); body ('');); icon (null);); compact (false);).

### frontend-angular/src/app/shared/components/ui-state.component.ts

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent, IconName } from './icon.component';

/** Presentation only: the caller supplies the server-grounded message and real actions. */
@Component({
  selector: 'tf-ui-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './ui-state.component.css',
  imports: [IconComponent],
  host: { 'class': 'tf-ui-state-host' },
  template: `
    <section animate.enter="tf-motion-enter" class="tf-ui-state" [attr.data-state]="state()" [attr.data-variant]="variant()"
             [class.tf-ui-state--compact]="compact()" [attr.role]="state() === 'error' ? 'alert' : 'status'"
             [attr.aria-live]="state() === 'error' ? 'assertive' : 'polite'" aria-atomic="true">
      <span class="tf-ui-state__symbol" aria-hidden="true"><tf-icon [name]="symbol()" [size]="24" iconRole="status" /></span>
      <div class="tf-ui-state__copy">
        <p class="tf-ui-state__title">{{ title() }}</p>
        @if (body()) { <p class="tf-ui-state__body">{{ body() }}</p> }
        <div class="tf-ui-state__actions"><ng-content /></div>
      </div>
    </section>
  `
})
export class UiStateComponent {
  readonly state = input<'empty' | 'success' | 'error' | 'waiting' | 'updating'>('empty');
  readonly variant = input<'first-use' | 'filtered' | 'caught-up' | 'confirmation'>('first-use');
  readonly title = input.required<string>();
  readonly body = input('');
  readonly icon = input<IconName | null>(null);
  readonly compact = input(false);
  readonly symbol = computed<IconName>(() => this.icon() ?? (this.state() === 'success' || this.variant() === 'caught-up'
    ? 'check' : this.state() === 'error' ? 'flag' : this.state() === 'waiting' ? 'clock'
      : this.variant() === 'filtered' ? 'search' : 'file-plus'));
}
```

## ActionFeedbackDirective

Source: `frontend-angular/src/app/shared/directives/action-feedback.directive.ts`. Shared reusable UI interaction directive.

Inputs/outputs: tfActionFeedback ('idle');).

### frontend-angular/src/app/shared/directives/action-feedback.directive.ts

```ts
import { Directive, input } from '@angular/core';

/** Keeps the label and icon lane stable through a caller's real async state. */
@Directive({
  selector: 'button[tfActionFeedback]',
  host: {
    'class': 'tf-feedback-button',
    '[attr.data-feedback]': 'tfActionFeedback()',
    '[attr.aria-busy]': "tfActionFeedback() === 'busy' ? 'true' : null"
  }
})
export class ActionFeedbackDirective {
  readonly tfActionFeedback = input<'idle' | 'busy' | 'success'>('idle');
}
```

## SegmentedControlDirective

Source: `frontend-angular/src/app/shared/directives/segmented-control.directive.ts`. Shared reusable UI interaction directive.

Inputs/outputs: None.

### frontend-angular/src/app/shared/directives/segmented-control.directive.ts

```ts
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/** A single selection plane follows existing aria state, including RTL and resized labels. */
@Directive({ selector: '[tfSegmented]' })
export class SegmentedControlDirective {
  private readonly host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      const host = this.host;
      const marker = this.document.createElement('span');
      marker.className = 'tf-segment-indicator';
      marker.setAttribute('aria-hidden', 'true');
      host.prepend(marker);
      host.classList.add('tf-segmented');
      const position = (): void => {
        const selected = host.querySelector<HTMLElement>('[aria-pressed="true"], [aria-selected="true"]');
        if (!selected) { marker.hidden = true; return; }
        const parent = host.getBoundingClientRect(), child = selected.getBoundingClientRect();
        const rtl = this.document.defaultView?.getComputedStyle(host).direction === 'rtl';
        const x = rtl ? child.right - parent.right + host.clientLeft + host.scrollLeft
          : child.left - parent.left - host.clientLeft + host.scrollLeft;
        marker.hidden = false;
        marker.style.inlineSize = `${child.width}px`;
        marker.style.blockSize = `${child.height}px`;
        marker.style.transform = `translate(${x}px, ${child.top - parent.top - host.clientTop + host.scrollTop}px)`;
      };
      const mutations = new MutationObserver(position);
      mutations.observe(host, { subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected'], childList: true });
      const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(position) : null;
      resize?.observe(host);
      host.addEventListener('scroll', position, { passive: true });
      position();
      this.destroyRef.onDestroy(() => {
        mutations.disconnect(); resize?.disconnect(); host.removeEventListener('scroll', position);
      });
    });
  }
}
```

## TeacherTransition

Source: `frontend-angular/src/app/shared/directives/teacher-transition.directive.ts`. Shared reusable UI component.

Inputs/outputs: tfTeacherTransition ();).

### frontend-angular/src/app/shared/directives/teacher-transition.directive.ts

```ts
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Directive, ElementRef, Injectable, Injector, afterNextRender, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { InteractionMotion } from '@core/a11y/interaction-motion.service';

/** One shared avatar, only on a deliberate pointer navigation to a teacher's profile. */
@Injectable({ providedIn: 'root' })
export class TeacherTransition {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly motion = inject(InteractionMotion);
  readonly teacherId = signal('');
  readonly avatarSrc = signal('');

  start(event: MouseEvent, link: HTMLAnchorElement, id: string): void {
    const avatar = link.closest('article')?.querySelector<HTMLImageElement>('.tf-mk-av');
    if (event.defaultPrevented || event.button !== 0 || event.detail === 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        link.target === '_blank' || !avatar || !this.motion.allowed() || !this.document.startViewTransition || this.teacherId()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.teacherId.set(id);
    this.avatarSrc.set(avatar.currentSrc || avatar.src);
    avatar.style.viewTransitionName = 'tf-teacher-avatar';
    const transition = this.document.startViewTransition(async () => {
      if (!await this.router.navigateByUrl('/teachers/' + encodeURIComponent(id))) {
        transition.skipTransition();
        return;
      }
      // The existing public avatar is present in the destination skeleton.
      // Capture the next render, never wait for profile/review/API responses.
      await new Promise<void>(resolve => afterNextRender(resolve, { injector: this.injector }));
    });
    void transition.finished.catch(() => {}).finally(() => {
      this.teacherId.set('');
      this.avatarSrc.set('');
      avatar.style.viewTransitionName = '';
    });
  }
}

@Directive({ selector: 'a[tfTeacherTransition]' })
export class TeacherTransitionDirective {
  readonly tfTeacherTransition = input.required<string>();
  private readonly link = inject(ElementRef<HTMLAnchorElement>).nativeElement;
  private readonly transition = inject(TeacherTransition);
  constructor() {
    const click = (event: MouseEvent): void => this.transition.start(event, this.link, this.tfTeacherTransition());
    this.link.addEventListener('click', click, true);
    inject(DestroyRef).onDestroy(() => this.link.removeEventListener('click', click, true));
  }
}
```
