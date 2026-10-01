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

  /**
   * Each language is its own bundle under its own prefix (/ar/..., /en/...), so
   * switching language is switching address: the same page, the other prefix.
   * Changing only the strings in place left an Arabic page sitting at /en/, and
   * every link, reload and share from it came back in English. Without a prefix
   * (`ng serve`) there is only one bundle, and the switch stays in place.
   */
  set(lang: Lang): void {
    this.prefs.write(STORAGE_KEY, lang);
    const prefixed = this.urlLocale();
    const location = this.document.defaultView?.location;
    if (prefixed && prefixed !== lang && location) {
      const rest = location.pathname.replace(/^\/(ar|en)(?=\/|$)/i, '');
      location.assign(`/${lang}${rest || '/'}${location.search}${location.hash}`);
      return;
    }
    this.current.set(lang);
  }

  toggle(): void {
    this.set(this.current() === 'ar' ? 'en' : 'ar');
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

  /** The language the address is under, or null where there is no prefix. */
  private urlLocale(): Lang | null {
    if (!this.isBrowser) return null;
    const first = this.document.defaultView?.location.pathname.split('/')[1]?.toLowerCase();
    return first === 'ar' || first === 'en' ? first : null;
  }

  private initial(): Lang {
    // On the server there is no stored preference, and falling back to English
    // would make the Arabic prerender emit English pages — the exact opposite of
    // what building a per-locale bundle is for. The build's own LOCALE_ID is the
    // right answer there.
    if (!this.isBrowser) return this.buildLocale.toLowerCase().startsWith('ar') ? 'ar' : 'en';

    // The address names the language when it has a prefix, and it wins over a
    // stored choice: a shared /en/ link opens in English for everyone.
    const prefixed = this.urlLocale();
    if (prefixed) return prefixed;
    const stored = this.prefs.read(STORAGE_KEY);
    if (stored === 'ar' || stored === 'en') return stored;
    // No stored choice: follow the locale this bundle was built for, so a visitor
    // who landed on /ar/... gets Arabic without having to toggle.
    return this.buildLocale.toLowerCase().startsWith('ar') ? 'ar' : 'en';
  }
}
