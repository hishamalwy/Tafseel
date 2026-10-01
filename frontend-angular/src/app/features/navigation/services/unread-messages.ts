import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

interface Page { readonly items?: readonly Record<string, unknown>[] }

/** Messages waiting across the first page of conversations; a number, never a guess beyond what was read. */
export function unreadTotal(page: Page | null | undefined): number {
  return (page?.items ?? []).reduce((sum, row) => sum + Math.max(0, Number(row['unreadCount']) || 0), 0);
}

const POLL_MS = 60_000;

/**
 * Unread messages, for the "Messages" destination (UX-71, DEC-UX-04). A student waiting on a teacher's answer
 * should see that one arrived from wherever they are, without opening Messages to check. Read on each
 * navigation, when the tab comes back into view, and once a minute while it is open; a failed read shows
 * nothing rather than a wrong number.
 */
@Injectable({ providedIn: 'root' })
export class UnreadMessages {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private reading = false;
  private again = false;
  private watching = false;
  readonly count = signal(0);

  /**
   * Reads the count now. A read already under way is not doubled, but a request made while it runs is kept
   * and read again when it ends, so a message that arrived in between is never missed.
   */
  async refresh(): Promise<void> {
    this.watch();
    if (this.reading) { this.again = true; return; }
    this.reading = true;
    try {
      do {
        this.again = false;
        try {
          this.count.set(unreadTotal(await firstValueFrom(
            this.http.get<Page>('/api/v1/conversations?page=1&pageSize=50'))));
        } catch {
          this.count.set(0);
        }
      } while (this.again);
    } finally {
      this.reading = false;
    }
  }

  private watch(): void {
    const view = this.document.defaultView;
    if (this.watching || !view) return;
    this.watching = true;
    const onVisible = () => { if (this.document.visibilityState === 'visible') void this.refresh(); };
    this.document.addEventListener('visibilitychange', onVisible);
    const timer = view.setInterval(onVisible, POLL_MS);
    // The app lives as long as the tab; a test's injector does not, and must not leave a timer behind.
    this.destroyRef.onDestroy(() => {
      view.clearInterval(timer);
      this.document.removeEventListener('visibilitychange', onVisible);
    });
  }
}
