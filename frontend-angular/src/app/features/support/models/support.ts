/**
 * Help and abuse reports outside paid purchases. A problem with something paid for is a dispute (money rules);
 * everything here is a case with a reference, an owner and a written outcome.
 */
import { Role, primaryRole } from '@core/auth/models/role';
import { DashboardRole } from '@features/dashboards/models/dashboard';

export type SupportCategory = 0 | 1 | 2 | 3 | 4;
export type SupportStatus = 0 | 1 | 2;

export interface SupportCaseSummary {
  readonly id: string;
  readonly reference: string;
  readonly category: SupportCategory;
  readonly status: SupportStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly ownerName: string | null;
  readonly reporterName: string | null;
  readonly fromSignedOutReporter: boolean;
  readonly summary: string;
}

export interface SupportCase {
  readonly id: string;
  readonly reference: string;
  readonly category: SupportCategory;
  readonly status: SupportStatus;
  readonly description: string;
  readonly relatedReference: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly outcome: string | null;
  readonly resolvedAt: string | null;
  readonly owned: boolean;
  readonly ownerName: string | null;
  readonly reporterName: string | null;
  readonly reporterEmail: string | null;
  readonly contactEmail: string | null;
  readonly contactName: string | null;
  readonly messages: readonly { id: string; fromStaff: boolean; mine: boolean; authorName: string | null; body: string; createdAt: string }[];
  readonly attachments: readonly { id: string; fileName: string; contentType: string; size: number; createdAt: string }[];
  readonly version: string;
}

export interface CategoryCopy { readonly value: SupportCategory; readonly key: string; readonly titleKey: string; readonly title: string;
  readonly hintKey: string; readonly hint: string }

/** Account access first: it is the one a signed-out person can also report. */
export const SUPPORT_CATEGORIES: readonly CategoryCopy[] = [
  { value: 1, key: 'harassment', titleKey: 'help_cat_harassment', title: 'Harassment or abuse',
    hintKey: 'help_cat_harassment_hint', hint: 'Someone was abusive, threatening or kept contacting you after you asked them to stop.' },
  { value: 2, key: 'unsafe', titleKey: 'help_cat_unsafe', title: 'Unsafe or inappropriate content',
    hintKey: 'help_cat_unsafe_hint', hint: 'A profile, message, file or video that is offensive, misleading or not safe.' },
  { value: 3, key: 'session', titleKey: 'help_cat_session', title: 'Conduct in a live session',
    hintKey: 'help_cat_session_hint', hint: 'Behaviour during a live session. For money back on a session, open a dispute instead.' },
  { value: 0, key: 'account', titleKey: 'help_cat_account', title: 'My account',
    hintKey: 'help_cat_account_hint', hint: 'Signing in, your e-mail, your roles, or something you cannot change yourself.' },
  { value: 4, key: 'platform', titleKey: 'help_cat_platform', title: 'Something is not working',
    hintKey: 'help_cat_platform_hint', hint: 'A page, button or notification that does not work as it should.' }
];

export const SupportWords = {
  status(status: number): { labelKey: string; fallback: string; tone: string } {
    switch (status) {
      case 0: return { labelKey: 'help_status_open', fallback: 'Received', tone: 'warning' };
      case 1: return { labelKey: 'help_status_in_progress', fallback: 'Being handled', tone: 'info' };
      default: return { labelKey: 'help_status_resolved', fallback: 'Resolved', tone: 'success' };
    }
  },
  category(category: number): { labelKey: string; fallback: string } {
    const found = SUPPORT_CATEGORIES.find(c => c.value === category);
    return found ? { labelKey: found.titleKey, fallback: found.title } : { labelKey: 'help_cat_platform', fallback: 'Something is not working' };
  },
  categoryFromKey(key: string | null): SupportCategory | null {
    return SUPPORT_CATEGORIES.find(c => c.key === key)?.value ?? null;
  }
} as const;

/** Help belongs to whoever is signed in; it opens inside the workspace of their main role. */
export function helpShellRole(roles: readonly Role[] | undefined): DashboardRole {
  return (primaryRole(roles ?? []) ?? 'Student') as DashboardRole;
}
