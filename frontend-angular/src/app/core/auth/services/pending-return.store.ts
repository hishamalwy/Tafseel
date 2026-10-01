import { Injectable, inject } from '@angular/core';
import { BrowserPreferences } from '@core/storage/browser-preferences';
import { safeReturnUrl } from '@core/auth/guards/auth.guards';

const KEY = 'tafseel-pending-return';
/** Long enough to find the confirmation e-mail the next day; short enough not to surprise anyone. */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Where a new account was heading when it was created.
 *
 * A visitor who presses "Request this service" is sent to sign up with `?return=`. Registering then
 * goes through the confirmation e-mail, whose link opens a fresh login page without that address, so
 * the teacher and service they chose used to be lost and they landed on an empty home. The address is
 * kept in this browser until the first login after confirmation uses it.
 */
@Injectable({ providedIn: 'root' })
export class PendingReturnStore {
  private readonly prefs = inject(BrowserPreferences);

  remember(url: string | null, now = Date.now()): void {
    const safe = safeReturnUrl(url);
    if (safe) this.prefs.write(KEY, JSON.stringify({ url: safe, at: now }));
  }

  /** The remembered address, once; it is forgotten as soon as it is read. */
  take(now = Date.now()): string | null {
    const raw = this.prefs.read(KEY);
    if (!raw) return null;
    this.prefs.remove(KEY);
    try {
      const { url, at } = JSON.parse(raw) as { url?: unknown; at?: unknown };
      if (typeof url !== 'string' || typeof at !== 'number' || now - at > MAX_AGE_MS) return null;
      return safeReturnUrl(url);
    } catch {
      return null;
    }
  }
}
