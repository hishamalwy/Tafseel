import { AvailabilityException, WeeklyRule } from './teacher-profile';

/**
 * Weekly availability and one-off exceptions, in the API's own model.
 *
 * A weekly rule is a day of the week (`DayOfWeek`, Sunday = 0), a start and end wall-clock
 * time and the IANA/Windows time zone those times are in. The zone travels with the rule and
 * is shown next to it: nothing here converts a rule's times into the browser's zone.
 *
 * An exception is an absolute interval. The browser's `datetime-local` input has no zone, so
 * it is read in the browser's zone and the page says which zone that is.
 */

export const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;
export const SLOT_RANGE = { min: 15, max: 240 } as const;
export const MAX_RULES = 28;
export const REASON_MAX = 500;

export interface RuleDraft {
  readonly days: readonly number[];
  readonly start: string;
  readonly end: string;
  readonly timeZoneId: string;
  readonly slotMinutes: number | null;
}

/** The body entries of `PUT /teachers/me/availability/rules`. */
export interface RuleInput {
  readonly dayOfWeek: number;
  readonly start: string;
  readonly end: string;
  readonly timeZoneId: string;
  readonly slotMinutes: number | null;
}

export interface ExceptionDraft {
  /** `YYYY-MM-DDTHH:mm` in the browser's zone. */
  readonly startsAt: string;
  readonly endsAt: string;
  readonly reason: string;
}

export interface ExceptionInput {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly reason: string | null;
}

export type RuleProblem =
  | 'days_required' | 'time_required' | 'end_before_start' | 'zone_required' | 'slot_out_of_range'
  | 'slot_longer_than_window' | 'overlap' | 'too_many';

export type ExceptionProblem = 'time_required' | 'end_before_start' | 'reason_too_long';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const Availability = {
  emptyRule(timeZoneId: string): RuleDraft {
    return { days: [], start: '09:00', end: '12:00', timeZoneId, slotMinutes: 60 };
  },

  ruleDraft(rule: WeeklyRule): RuleDraft {
    return { days: [rule.dayOfWeek], start: rule.start, end: rule.end, timeZoneId: rule.timeZoneId, slotMinutes: rule.slotMinutes };
  },

  /** `09:30:00` from the API, or `09:30` from an input, as `09:30`. */
  clock(value: string): string {
    return /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : value;
  },

  minutes(clock: string): number {
    const [hours, minutes] = clock.split(':').map(Number);
    return hours * 60 + minutes;
  },

  sorted(rules: readonly WeeklyRule[]): readonly WeeklyRule[] {
    return [...rules].sort((a, b) => a.dayOfWeek - b.dayOfWeek || Availability.minutes(a.start) - Availability.minutes(b.start));
  },

  /**
   * The checks `TeacherAvailabilityRule` and the replace endpoint make: a real window, a slot
   * of 15 to 240 minutes, no two windows overlapping on the same day, at most 28 windows.
   * `replacing` is the rule being edited, which does not collide with itself.
   */
  ruleProblems(draft: RuleDraft, existing: readonly WeeklyRule[], replacing = ''): readonly RuleProblem[] {
    const problems: RuleProblem[] = [];
    if (!draft.days.length) problems.push('days_required');
    if (!HHMM.test(draft.start) || !HHMM.test(draft.end)) problems.push('time_required');
    else if (Availability.minutes(draft.end) <= Availability.minutes(draft.start)) problems.push('end_before_start');
    if (!draft.timeZoneId.trim()) problems.push('zone_required');
    const slot = draft.slotMinutes;
    if (slot !== null && (!Number.isInteger(slot) || slot < SLOT_RANGE.min || slot > SLOT_RANGE.max)) problems.push('slot_out_of_range');
    else if (slot !== null && !problems.includes('time_required') && !problems.includes('end_before_start')
      && slot > Availability.minutes(draft.end) - Availability.minutes(draft.start)) problems.push('slot_longer_than_window');
    const others = existing.filter(rule => rule.id !== replacing);
    if (!problems.includes('time_required') && !problems.includes('end_before_start') && others.some(rule =>
      draft.days.includes(rule.dayOfWeek)
      && Availability.minutes(rule.start) < Availability.minutes(draft.end)
      && Availability.minutes(draft.start) < Availability.minutes(rule.end)))
      problems.push('overlap');
    if (others.length + draft.days.length > MAX_RULES) problems.push('too_many');
    return problems;
  },

  /** The whole week after adding the draft (or replacing one rule with it), for the replace call. */
  replacement(existing: readonly WeeklyRule[], draft: RuleDraft, replacing = ''): readonly RuleInput[] {
    const kept = existing.filter(rule => rule.id !== replacing).map(Availability.input);
    const added = [...new Set(draft.days)].sort().map(dayOfWeek => ({
      dayOfWeek, start: apiTime(draft.start), end: apiTime(draft.end),
      timeZoneId: draft.timeZoneId.trim(), slotMinutes: draft.slotMinutes
    }));
    return [...kept, ...added];
  },

  input(rule: WeeklyRule): RuleInput {
    return { dayOfWeek: rule.dayOfWeek, start: apiTime(rule.start), end: apiTime(rule.end), timeZoneId: rule.timeZoneId, slotMinutes: rule.slotMinutes };
  },

  emptyException(): ExceptionDraft {
    return { startsAt: '', endsAt: '', reason: '' };
  },

  exceptionProblems(draft: ExceptionDraft): readonly ExceptionProblem[] {
    const problems: ExceptionProblem[] = [];
    const start = Date.parse(draft.startsAt), end = Date.parse(draft.endsAt);
    if (!draft.startsAt || !draft.endsAt || Number.isNaN(start) || Number.isNaN(end)) problems.push('time_required');
    else if (end <= start) problems.push('end_before_start');
    if (draft.reason.length > REASON_MAX) problems.push('reason_too_long');
    return problems;
  },

  /** A `datetime-local` value is the browser's wall clock; sent as the instant it names. */
  exceptionInput(draft: ExceptionDraft): ExceptionInput {
    return {
      startsAt: new Date(draft.startsAt).toISOString(),
      endsAt: new Date(draft.endsAt).toISOString(),
      reason: draft.reason.trim() || null
    };
  },

  sortedExceptions(exceptions: readonly AvailabilityException[]): readonly AvailabilityException[] {
    return [...exceptions].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  }
} as const;

function apiTime(clock: string): string {
  return /^\d{2}:\d{2}$/.test(clock) ? `${clock}:00` : clock;
}

/** The zone the browser runs in, e.g. `Africa/Cairo`. */
export function browserTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

/**
 * The zones Tafseel offers first: the Kingdom, then the Gulf and the places its teachers most often live.
 * Every other zone still follows — UX-06 names them in the reader's language; it does not take any away.
 */
const NEAR_ZONES: readonly string[] = [
  'Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Bahrain', 'Asia/Muscat',
  'Asia/Amman', 'Asia/Beirut', 'Asia/Damascus', 'Asia/Baghdad', 'Africa/Cairo', 'Africa/Khartoum',
  'Asia/Istanbul', 'Europe/London', 'America/New_York'
];

/**
 * Zones to choose from: the near list first, then anything already saved and the device's own, then every
 * other zone the browser knows, so no teacher loses a choice they had.
 */
export function timeZoneChoices(...saved: readonly string[]): readonly string[] {
  let zones: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    zones = intl.supportedValuesOf?.('timeZone') ?? [];
  } catch { zones = []; }
  const near = NEAR_ZONES.filter(zone => zones.length === 0 || zones.includes(zone));
  const all = new Set([...near, ...saved.filter(Boolean), browserTimeZone(), ...zones]);
  return [...all];
}

/**
 * What a zone is called to the person reading it (UX-06).
 *
 * The control used to print the IANA identifier — `Africa/Abidjan` — which is an English string from a
 * database of time zones, not something written for a student or a teacher, and it sat in a list of four
 * hundred of them on a phone in Arabic. `Intl` names the zone in the reader's own language; the offset
 * follows so two zones sharing a name are still distinguishable.
 */
export function timeZoneLabel(zone: string, lang: string): string {
  const locale = lang === 'ar' ? 'ar-SA' : 'en-US';
  try {
    const name = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'long' })
      .formatToParts(new Date())
      .find(part => part.type === 'timeZoneName')?.value;
    const offset = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find(part => part.type === 'timeZoneName')?.value;
    if (!name) return zone;
    return offset ? `${name} (${offset})` : name;
  } catch {
    return zone;
  }
}
