import { Injectable, computed, inject } from '@angular/core';
import { Money, MoneyView, RIYAL_MARK } from '@shared/models/money';
import {
  DisplayName, PartyNameFields, PartyRole, UserNameFields
} from '@shared/models/display-name';
import { LocaleService } from './locale.service';

/**
 * Who a picture stands in for when a person has not uploaded one. A teacher at a board and a student in a
 * graduation cap say what the person is; the two-letter monogram they replaced said only how the name is spelled.
 */
const DEFAULT_AVATARS: Readonly<Record<PartyRole, string>> = {
  teacher: 'assets/brand/default-avatar-teacher.svg?v=role-1',
  student: 'assets/brand/default-avatar-student.svg?v=role-1'
};

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
  private readonly intlLocale = computed(() => (this.isArabic() ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US'));
  private readonly unavailable = computed(() => this.locale.t('td_unavailable', '—'));
  /** Official SAMA mark — the same glyph in Arabic and English. */
  private readonly sarLabel = computed(() => this.locale.t('currency_sar_short', RIYAL_MARK));
  private readonly nameUnavailable = computed(() => this.locale.t('name_unavailable', '—'));

  // ---- money ----

  /** Plain text: `1,620 ⃁` in both languages. Safe anywhere; never "SAR" or «ر.س». */
  money(value: unknown, currency?: string): string {
    return Money.format(value, currency, this.unavailable(), this.sarLabel());
  }

  /**
   * A currency named without an amount, as the official mark: «السعر (⃁)».
   * Any other currency keeps its ISO code.
   */
  currencyLabel(currency: string | null | undefined): string {
    const code = (currency ?? 'SAR').trim().toUpperCase() || 'SAR';
    return code === 'SAR' ? this.sarLabel() : code;
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

  /**
   * A length of time a person reads at a glance: "12 hours", "2 days", "1 week", "1 day and 12 hours"
   * («يومان», «٣ أيام»). Tafseel stores delivery and validity in hours; nobody plans a week as 168 hours.
   */
  duration(hours: unknown): string {
    const total = Math.max(0, Math.round(Number(hours) || 0));
    const unit = (n: number, name: 'hour' | 'day' | 'week') =>
      new Intl.NumberFormat(this.intlLocale(), { style: 'unit', unit: name, unitDisplay: 'long' }).format(n);
    if (total < 24) return unit(total, 'hour');
    const days = Math.floor(total / 24), rest = total % 24;
    if (rest) return new Intl.ListFormat(this.intlLocale(), { type: 'conjunction' }).format([unit(days, 'day'), unit(rest, 'hour')]);
    return days % 7 === 0 ? unit(days / 7, 'week') : unit(days, 'day');
  }

  dateOnly(value: string | number | Date): string {
    return this.date(value, { dateStyle: 'medium' });
  }

  /** "2 hours ago" / «قبل ساعتين» within the last day; a date otherwise. */
  relative(value: string | number | Date, now = Date.now()): string {
    if (value == null || value === '') return '';
    const at = new Date(value).getTime();
    if (Number.isNaN(at)) return '';
    const minutes = Math.round((now - at) / 60_000);
    if (minutes < 0 || minutes >= 24 * 60) return this.dateOnly(value);
    const words = new Intl.RelativeTimeFormat(this.intlLocale(), { numeric: 'auto' });
    return minutes < 60 ? words.format(-minutes, 'minute') : words.format(-Math.floor(minutes / 60), 'hour');
  }

  // ---- names and avatars ----

  userName(user: UserNameFields | null | undefined): string {
    return DisplayName.ofUser(user, this.isArabic(), this.nameUnavailable());
  }

  partyName(dto: PartyNameFields | null | undefined, role: PartyRole): string {
    return DisplayName.ofParty(dto, role, this.isArabic(), this.nameUnavailable());
  }

  /** The picture for someone with no upload, by what they are on Tafseel. */
  defaultAvatar(role: PartyRole): string {
    return DEFAULT_AVATARS[role];
  }

  /**
   * A real avatar when one exists, otherwise the default for the person's role.
   * `version` busts the cache after an upload.
   */
  avatarUrl(
    userId: string | null | undefined, hasAvatar: boolean,
    version?: string | number | null, role: PartyRole = 'teacher'
  ): string {
    if (hasAvatar && userId) {
      const url = `/api/v1/users/${encodeURIComponent(userId)}/avatar`;
      return version == null || version === ''
        ? url
        : `${url}?v=${encodeURIComponent(String(version))}`;
    }
    return DEFAULT_AVATARS[role];
  }
}
