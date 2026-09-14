import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, LOCALE_ID, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BrowserPreferences } from '@core/storage/browser-preferences';

export type Lang = 'ar' | 'en';

const STORAGE_KEY = 'tafseel-lang';
type Table = Readonly<Record<string, string>>;

/**
 * Language, direction and string lookup — ported from `js/tafseel.js`.
 *
 * Same storage key, same default (`en`, tafseel.js line 63) and the same two
 * attributes on <html>, so `css/tafseel.css` keys its RTL rules off exactly what
 * it did before. Translation keys are unchanged, so every `data-i18n` name in the
 * legacy pages still resolves.
 *
 * Only the delivery changed: `js/locales.js` ships both languages in one 337KB
 * file on every page (twice, before Phase 00). Here each language is a separate
 * JSON fetched on demand — about 130KB of the one the visitor reads, none of the
 * other.
 */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly document = inject(DOCUMENT);
  private readonly http = inject(HttpClient);
  private readonly prefs = inject(BrowserPreferences);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly buildLocale = inject(LOCALE_ID);

  private readonly current = signal<Lang>(this.initial());
  private readonly tables = signal<Readonly<Partial<Record<Lang, Table>>>>({});

  readonly lang = this.current.asReadonly();
  readonly dir = computed<'rtl' | 'ltr'>(() => (this.current() === 'ar' ? 'rtl' : 'ltr'));
  readonly isRtl = computed(() => this.current() === 'ar');
  readonly ready = computed(() => this.tables()[this.current()] !== undefined);

  constructor() {
    effect(() => {
      const lang = this.current();
      const root = this.document.documentElement;
      root.setAttribute('lang', lang);
      root.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      this.prefs.write(STORAGE_KEY, lang);
      if (this.isBrowser) void this.load(lang);
    });
  }

  /** Mirrors `Tafseel.t(key, fallback)` so ported templates keep working. */
  t(key: string, fallback = ''): string {
    return this.tables()[this.current()]?.[key] ?? fallback ?? key;
  }

  /**
   * The same lookup with `{name}` placeholders filled in, as `js/locales.js`
   * writes them (`"Delivery within {hours}h"`). Substitution runs over the
   * fallback too, so a missing table still produces a finished sentence rather
   * than a visible placeholder.
   */
  format(key: string, values: Readonly<Record<string, string | number>>, fallback = ''): string {
    return Object.entries(values).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      this.t(key, fallback));
  }

  set(lang: Lang): void {
    this.current.set(lang);
  }

  toggle(): void {
    this.current.update(l => (l === 'ar' ? 'en' : 'ar'));
  }

  async load(lang: Lang): Promise<void> {
    if (this.tables()[lang]) return;
    try {
      const table = await firstValueFrom(this.http.get<Table>(`locale/${lang}.json`));
      this.tables.update(t => ({ ...t, [lang]: table }));
    } catch {
      // A missing table must not blank the UI: t() falls back to the inline
      // English the template already carries.
      this.tables.update(t => ({ ...t, [lang]: {} }));
    }
  }

  private initial(): Lang {
    // On the server there is no stored preference, and falling back to English
    // would make the Arabic prerender emit English pages — the exact opposite of
    // what building a per-locale bundle is for. The build's own LOCALE_ID is the
    // right answer there.
    if (!this.isBrowser) return this.buildLocale.toLowerCase().startsWith('ar') ? 'ar' : 'en';

    const stored = this.prefs.read(STORAGE_KEY);
    if (stored === 'ar' || stored === 'en') return stored;
    // No stored choice: follow the locale this bundle was built for, so a visitor
    // who landed on /ar/... gets Arabic without having to toggle.
    return this.buildLocale.toLowerCase().startsWith('ar') ? 'ar' : 'en';
  }
}
