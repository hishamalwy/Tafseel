import { Injectable, computed, inject } from '@angular/core';
import { Money, MoneyView } from '@shared/models/money';
import {
  DisplayName, PartyNameFields, PartyRole, UserNameFields, initialsAvatar
} from '@shared/models/display-name';
import { LocaleService } from './locale.service';

const DEFAULT_AVATAR = 'assets/brand/default-avatar.svg?v=premium-1';

/**
 * The language-aware half of `js/tafseel.js` — `money`, `date`, `number`,
 * `badgeCount`, `userName`, `partyName`, `avatarUrl`.
 *
 * The rules themselves live in the domain (`Money`, `DisplayName`) because they
 * are decisions about how Tafseel presents value and identity, not about
 * Angular. This service only supplies the current language and the translated
 * fallback strings those rules need.
 *
 * It exists at all because the thirteen screens still to migrate make roughly
 * 2,600 calls into these helpers; without one home for them, each screen would
 * grow its own copy and they would drift.
 */
@Injectable({ providedIn: 'root' })
export class FormatService {
  private readonly locale = inject(LocaleService);

  private readonly isArabic = computed(() => this.locale.lang() === 'ar');
  private readonly intlLocale = computed(() => (this.isArabic() ? 'ar-SA' : 'en-US'));
  private readonly unavailable = computed(() => this.locale.t('td_unavailable', '—'));
  private readonly nameUnavailable = computed(() => this.locale.t('name_unavailable', '—'));

  // ---- money ----

  /** Plain text: `1,620 SAR`. Safe anywhere; never emits a currency glyph. */
  money(value: unknown, currency?: string): string {
    return Money.format(value, currency, this.unavailable());
  }

  /** For markup that pairs the number with the SAMA riyal mark. */
  moneyView(value: unknown, currency?: string, emptyText?: string): MoneyView {
    return Money.view(value, currency, emptyText ?? this.unavailable());
  }

  // ---- numbers and dates ----

  number(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.intlLocale(), options).format(value);
  }

  /**
   * Pill badges. Zero returns empty so the caller hides the badge entirely, and
   * anything past 99 is capped so a real count cannot overflow a small pill.
   */
  badgeCount(value: unknown): string {
    const n = Number(value) || 0;
    if (n <= 0) return '';
    if (n > 99) return this.isArabic() ? '+99' : '99+';
    return this.number(n);
  }

  date(value: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
    if (value == null || value === '') return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return new Intl.DateTimeFormat(
      this.intlLocale(),
      options ?? { dateStyle: 'medium', timeStyle: 'short' }
    ).format(parsed);
  }

  dateOnly(value: string | number | Date): string {
    return this.date(value, { dateStyle: 'medium' });
  }

  // ---- names and avatars ----

  userName(user: UserNameFields | null | undefined): string {
    return DisplayName.ofUser(user, this.isArabic(), this.nameUnavailable());
  }

  partyName(dto: PartyNameFields | null | undefined, role: PartyRole): string {
    return DisplayName.ofParty(dto, role, this.isArabic(), this.nameUnavailable());
  }

  readonly defaultAvatar = DEFAULT_AVATAR;

  /**
   * A real avatar when one exists, otherwise a deterministic monogram, otherwise
   * the house default. `version` busts the cache after an upload.
   */
  avatarUrl(
    userId: string | null | undefined, hasAvatar: boolean,
    version?: string | number | null, label?: string | null
  ): string {
    if (hasAvatar && userId) {
      const url = `/api/v1/users/${encodeURIComponent(userId)}/avatar`;
      return version == null || version === ''
        ? url
        : `${url}?v=${encodeURIComponent(String(version))}`;
    }
    if (label) return initialsAvatar(label, userId ?? label);
    return DEFAULT_AVATAR;
  }
}
