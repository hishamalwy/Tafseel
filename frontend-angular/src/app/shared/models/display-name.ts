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

/**
 * A deterministic monogram avatar.
 *
 * Ported from `initialsAvatarDataUri`. The point of the hash is that one person
 * gets the same two letters on the same colour every time, on every device —
 * the alternative the legacy code replaced was one generic book icon repeated
 * on every teacher card.
 */
const PALETTE = [
  '#5036D8', '#1F6FB4', '#2E8B74', '#7A3E9D',
  '#B4571F', '#9D2E5C', '#2E6B84', '#6B6B2E'
] as const;

export function initialsAvatar(label: string, seed?: string): string {
  const words = String(label ?? '').trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2)
    .map(word => Array.from(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase() || '?';

  const key = String(seed ?? label ?? '');
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const color = PALETTE[hash % PALETTE.length]!;

  const safe = initials.replace(/[&<>"']/g, '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="${safe}">` +
    `<rect width="256" height="256" fill="${color}"/>` +
    `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" fill="#fff" ` +
    `font-family="system-ui,sans-serif" font-size="112" font-weight="700">${safe}</text></svg>`;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
