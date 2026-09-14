import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

/**
 * localStorage behind an interface.
 *
 * Two things it absorbs so nothing above has to:
 *  - there is no `localStorage` when this runs on the server during SSR or
 *    prerendering, so reads answer null and writes are dropped;
 *  - storage throws rather than returning null in private mode and when a
 *    browser blocks site data, which would otherwise take the page down.
 */
@Injectable({ providedIn: 'root' })
export class BrowserPreferences {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  read(key: string): string | null {
    if (!this.isBrowser) return null;
    try {
      return this.document.defaultView?.localStorage.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  write(key: string, value: string): void {
    if (!this.isBrowser) return;
    try {
      this.document.defaultView?.localStorage.setItem(key, value);
    } catch {
      // Preference simply is not remembered; not worth surfacing.
    }
  }

  remove(key: string): void {
    if (!this.isBrowser) return;
    try {
      this.document.defaultView?.localStorage.removeItem(key);
    } catch {
      // Nothing to do: the value is unreachable either way.
    }
  }
}
