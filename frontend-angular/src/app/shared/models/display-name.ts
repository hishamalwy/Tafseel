/**
 * Person and party naming, ported from `Tafseel.userName` / `partyName` /
 * `partyDisplayName`.
 *
 * The rule the legacy code encodes, and the reason it exists: **never show a raw
 * user id**. List DTOs carry a localized name and an English name; the interface
 * language picks which, and a missing pair falls back to a translated
 * "unavailable" rather than a GUID leaking into the UI.
 */

export type PartyRole = 'student' | 'teacher';

/** The two name fields every party-bearing DTO carries, per role. */
export interface PartyNameFields {
  readonly studentDisplayName?: string | null;
  readonly studentDisplayNameEnglish?: string | null;
  readonly teacherDisplayName?: string | null;
  readonly teacherDisplayNameEnglish?: string | null;
}

export interface UserNameFields {
  readonly fullName?: string | null;
  readonly name?: string | null;
  readonly fullNameEnglish?: string | null;
}

export const DisplayName = {
  /**
   * Pick between the localized and English spellings.
   * Arabic prefers the primary field; English prefers the English one and falls
   * back to the primary, because an Arabic-only name is still better than none.
   */
  pick(primary: string | null | undefined, english: string | null | undefined, isArabic: boolean): string {
    const localized = (primary ?? '').trim();
    const latin = (english ?? '').trim();
    if (isArabic) return localized || latin;
    return latin || localized;
  },

  ofUser(user: UserNameFields | null | undefined, isArabic: boolean, unavailable: string): string {
    if (!user) return '';
    return DisplayName.pick(user.fullName ?? user.name, user.fullNameEnglish, isArabic) || unavailable;
  },

  ofParty(
    dto: PartyNameFields | null | undefined, role: PartyRole,
    isArabic: boolean, unavailable: string
  ): string {
    if (!dto) return unavailable;
    const primary = role === 'student' ? dto.studentDisplayName : dto.teacherDisplayName;
    const english = role === 'student' ? dto.studentDisplayNameEnglish : dto.teacherDisplayNameEnglish;
    return DisplayName.pick(primary, english, isArabic) || unavailable;
  }
} as const;
