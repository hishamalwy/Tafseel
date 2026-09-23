/**
 * The teacher's own profile as `GET /teachers/me` returns it, and the rules the editor
 * checks before saving. The limits are the ones `UpdateTeacherProfile` and
 * `CredentialInput` validate; the server stays the authority and its refusal is shown.
 */

export interface NamedItem {
  readonly id: string;
  readonly name: string;
  readonly nameArabic: string;
  /** Catalog code where the API has one (`ar`, `en`); the client names the item from it (UX-06). */
  readonly code?: string;
}

/** A topic belongs to a subject. */
export interface TopicItem extends NamedItem {
  readonly subjectId: string;
}

export type CredentialKind = 'certifications' | 'experience';

export interface Credential {
  readonly id: string;
  readonly title: string;
  readonly organization: string;
  /** `YYYY-MM-DD`, or empty. */
  readonly from: string;
  readonly to: string;
}

export interface WeeklyRule {
  readonly id: string;
  /** .NET `DayOfWeek`: 0 is Sunday. */
  readonly dayOfWeek: number;
  /** `HH:mm`. */
  readonly start: string;
  readonly end: string;
  readonly timeZoneId: string;
  readonly slotMinutes: number | null;
}

export interface AvailabilityException {
  readonly id: string;
  /** ISO instants with an offset. */
  readonly startsAt: string;
  readonly endsAt: string;
  readonly reason: string;
}

export interface OwnProfile {
  readonly teacherId: string;
  readonly fullName: string;
  readonly headline: string;
  readonly bio: string;
  readonly country: string;
  readonly city: string;
  readonly timeZoneId: string;
  readonly responseTimeMinutes: number | null;
  readonly languages: readonly NamedItem[];
  readonly topics: readonly NamedItem[];
  readonly educationLevels: readonly NamedItem[];
  readonly certifications: readonly Credential[];
  readonly experience: readonly Credential[];
  readonly rules: readonly WeeklyRule[];
  readonly exceptions: readonly AvailabilityException[];
  readonly isProfileComplete: boolean;
  readonly isPubliclyVisible: boolean;
  readonly publicationBlockingReasons: readonly string[];
}

/** The body of `PUT /teachers/me`. */
export interface ProfileInput {
  readonly headline: string;
  readonly bio: string;
  readonly country: string;
  readonly city: string;
  readonly timeZoneId: string;
  readonly responseTimeMinutes: number;
}

export interface ProfileDraft {
  readonly headline: string;
  readonly bio: string;
  readonly country: string;
  readonly city: string;
  readonly timeZoneId: string;
  readonly responseTimeMinutes: number | null;
}

export type ProfileField = keyof ProfileDraft;
export type FieldProblem = 'required' | 'too_long' | 'out_of_range' | 'before_start';

export const PROFILE_LIMITS = {
  headline: 200, bio: 4000, country: 100, city: 150, timeZoneId: 100, responseTimeMinutes: 43_200
} as const;

export const CREDENTIAL_LIMITS = { title: 200, organization: 200 } as const;

export interface CredentialDraft {
  readonly title: string;
  readonly organization: string;
  readonly from: string;
  readonly to: string;
}

export const ProfileForm = {
  draft(profile: OwnProfile | null, fallbackTimeZone: string): ProfileDraft {
    return {
      headline: profile?.headline ?? '', bio: profile?.bio ?? '', country: profile?.country ?? '',
      city: profile?.city ?? '', timeZoneId: profile?.timeZoneId || fallbackTimeZone,
      responseTimeMinutes: profile?.responseTimeMinutes ?? null
    };
  },

  problems(draft: ProfileDraft): Partial<Record<ProfileField, FieldProblem>> {
    const problems: Partial<Record<ProfileField, FieldProblem>> = {};
    for (const field of ['headline', 'bio', 'country', 'city', 'timeZoneId'] as const) {
      const value = draft[field].trim();
      if (!value) problems[field] = 'required';
      else if (value.length > PROFILE_LIMITS[field]) problems[field] = 'too_long';
    }
    const minutes = draft.responseTimeMinutes;
    if (minutes === null || !Number.isInteger(minutes)) problems.responseTimeMinutes = 'required';
    else if (minutes < 0 || minutes > PROFILE_LIMITS.responseTimeMinutes) problems.responseTimeMinutes = 'out_of_range';
    return problems;
  },

  input(draft: ProfileDraft): ProfileInput {
    return {
      headline: draft.headline.trim(), bio: draft.bio.trim(), country: draft.country.trim(),
      city: draft.city.trim(), timeZoneId: draft.timeZoneId.trim(), responseTimeMinutes: draft.responseTimeMinutes ?? 0
    };
  },

  sameIds(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every(id => b.includes(id));
  }
} as const;

export const CredentialForm = {
  empty(): CredentialDraft { return { title: '', organization: '', from: '', to: '' }; },

  problems(draft: CredentialDraft): Partial<Record<keyof CredentialDraft, FieldProblem>> {
    const problems: Partial<Record<keyof CredentialDraft, FieldProblem>> = {};
    for (const field of ['title', 'organization'] as const) {
      const value = draft[field].trim();
      if (!value) problems[field] = 'required';
      else if (value.length > CREDENTIAL_LIMITS[field]) problems[field] = 'too_long';
    }
    if (draft.from && draft.to && draft.to < draft.from) problems.to = 'before_start';
    return problems;
  }
} as const;

/** Arabic name first in Arabic, falling back to whichever name exists. */
export function localName(item: { name: string; nameArabic: string }, rtl: boolean): string {
  return (rtl ? item.nameArabic : '') || item.name || item.nameArabic;
}
