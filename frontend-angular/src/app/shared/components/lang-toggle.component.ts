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
