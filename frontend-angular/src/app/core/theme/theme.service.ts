import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';
import { BrowserPreferences } from '@core/storage/browser-preferences';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'tafseel-theme';

/**
 * Theme, ported to match `js/tafseel.js` and `js/boot-prefs.js` exactly.
 *
 * The default is **light**, not the OS preference. `boot-prefs.js` explains why:
 * following `prefers-color-scheme` at boot paints a dark splash over a light
 * page. Changing it here would change what every existing visitor sees, so it
 * stays.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly prefs = inject(BrowserPreferences);
  private readonly current = signal<Theme>(this.initial());

  readonly theme = this.current.asReadonly();

  constructor() {
    effect(() => {
      const theme = this.current();
      this.document.documentElement.setAttribute('data-theme', theme);
      this.prefs.write(STORAGE_KEY, theme);
    });
  }

  set(theme: Theme): void { this.current.set(theme); }
  toggle(): void { this.current.update(t => (t === 'dark' ? 'light' : 'dark')); }

  private initial(): Theme {
    const stored = this.prefs.read(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : 'light';
  }
}
