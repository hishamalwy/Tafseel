import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

/**
 * `sessionStorage` behind the same interface as [[BrowserPreferences]].
 *
 * The distinction matters: what belongs here is scoped to one tab and one visit
 * — "I already closed that dialog" — and must not follow the visitor into
 * tomorrow the way a remembered theme does. The same two hazards apply, so the
 * same two guards do: no storage during SSR, and storage that throws rather
 * than answering null in private mode.
 */
@Injectable({ providedIn: 'root' })
export class SessionPreferences {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  read(key: string): string | null {
    if (!this.isBrowser) return null;
    try {
      return this.document.defaultView?.sessionStorage.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  write(key: string, value: string): void {
    if (!this.isBrowser) return;
    try {
      this.document.defaultView?.sessionStorage.setItem(key, value);
    } catch {
      // Best effort: the visit simply is not remembered.
    }
  }
}
