/**
 * Booking a live session.
 *
 * The whole difficulty here is time. The API returns each slot with a
 * `studentLocalStart` already converted into the timezone the client asked for,
 * so the browser must **not** re-interpret it as UTC — doing so shifts every
 * slot by the local offset. `parseLocalWallClock` and `toLocalIsoString` are
 * carried over from the legacy page for exactly that reason, and they are the
 * only place a date string is taken apart.
 */

export interface BookableService {
  readonly id: string;
  readonly currency: string;
  readonly allowedDurations: readonly number[];
  readonly canBook: boolean;
  readonly serviceCatalogCode: string;
  readonly basePrice: number | null;
  readonly emergencyPremiumAmount: number | null;
}

export interface Slot {
  /** Wall-clock start in the student's timezone; not a UTC instant. */
  readonly studentLocalStart: string;
  readonly emergency?: boolean;
}

export interface DayColumn {
  readonly key: string;
  readonly weekday: string;
  readonly date: string;
  readonly slots: readonly { readonly key: string; readonly label: string; readonly localStart: string; readonly emergency: boolean }[];
}

/**
 * Read a wall-clock string without letting the browser apply an offset.
 *
 * `new Date('2026-09-08T14:00:00')` is already local, but the API sometimes
 * appends `Z` or an offset. Stripping those first is what keeps 14:00 meaning
 * 14:00 in the student's own timezone.
 */
export function parseLocalWallClock(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  const clean = String(value).replace(/Z$/i, '').replace(/([+-]\d{2}:\d{2})$/, '');
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    const fallback = new Date(String(value));
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  return new Date(
    +match[1]!, +match[2]! - 1, +match[3]!, +match[4]!, +match[5]!, +(match[6] ?? 0));
}

/** Serialise back to the same offset-free form the API expects. */
export function toLocalIsoString(value: string | Date): string {
  if (typeof value === 'string') {
    return value.replace(/Z$/i, '').replace(/([+-]\d{2}:\d{2})$/, '').slice(0, 19);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
    + `T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

export function toDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const Booking = {
  /**
   * The service to book: the caller's preference if it is still bookable,
   * otherwise the first one that is. Only `live_session` services qualify.
   */
  pickService(
    services: readonly BookableService[] | null | undefined, preferredId?: string
  ): BookableService | null {
    const bookable = (services ?? []).filter(
      s => s?.canBook && String(s.serviceCatalogCode ?? '').toLowerCase() === 'live_session');
    if (!bookable.length) return null;
    if (preferredId) return bookable.find(s => String(s.id) === String(preferredId)) ?? null;
    return bookable[0]!;
  },

  durationsFor(service: BookableService | null): readonly number[] {
    const allowed = service?.allowedDurations ?? [];
    return allowed.length ? allowed : [60];
  },

  /** The seven-day grid, with each slot dropped into its own day column. */
  week(slots: readonly Slot[], locale: string, days = 7): readonly DayColumn[] {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const dayDate = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false });

    const byDay = new Map<string, Slot[]>();
    for (const slot of slots) {
      const local = parseLocalWallClock(slot.studentLocalStart);
      if (!local) continue;
      const key = toDateKey(local);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(slot); else byDay.set(key, [slot]);
    }

    // Noon anchor so a DST change cannot roll a column onto the wrong date.
    const start = new Date();
    start.setHours(12, 0, 0, 0);

    return Array.from({ length: days }, (_, offset) => {
      const day = new Date(start);
      day.setDate(start.getDate() + offset);
      const key = toDateKey(day);
      const daySlots = (byDay.get(key) ?? [])
        .map(slot => {
          const local = parseLocalWallClock(slot.studentLocalStart)!;
          return {
            key: `${key}T${time.format(local)}`,
            label: time.format(local),
            localStart: slot.studentLocalStart,
            emergency: !!slot.emergency
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));

      return { key, weekday: weekday.format(day), date: dayDate.format(day), slots: daySlots };
    });
  },

  /** The browser's own timezone, falling back to UTC where it cannot be read. */
  detectTimeZone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }
} as const;

export interface BookingDraft {
  readonly teacherServiceId: string;
  readonly title: string;
  readonly notes: string;
  readonly localStart: string;
  readonly studentTimeZoneId: string;
  readonly durationMinutes: number;
  readonly emergency: boolean;
}
