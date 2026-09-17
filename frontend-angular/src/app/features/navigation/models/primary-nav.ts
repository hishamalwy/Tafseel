/**
 * The V1 primary navigation (UX-03, `docs/tickets/v1/UX-03.md`).
 *
 * A destination exists here because it is a goal the person already has — not because an endpoint or an
 * entity exists. Gate 2 fixed the counts: Student 5, Teacher 6, Quality 2, Admin 6, and `primary-nav.spec.ts`
 * fails if a later change exceeds them. Everything else is reached from the place it belongs: notifications
 * from the bell, settings from the account menu, reviews and disputes from the item they are about.
 *
 * Nothing here decides access. Every route keeps its guard and every API its policy; navigation only decides
 * what is worth showing.
 */
import { DashboardRole } from '@features/dashboards/models/dashboard';

export interface NavChild {
  readonly key: string;
  readonly labelKey: string;
  readonly fallback: string;
  readonly path: string;
}

export interface NavDestination {
  readonly key: string;
  readonly labelKey: string;
  readonly fallback: string;
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  /** Sub-navigation shown inside the destination, not in the primary list. */
  readonly children?: readonly NavChild[];
  /**
   * Route prefixes that keep this destination highlighted. Matching is explicit: an order opened from a
   * notification belongs to the list it came from, and a URL prefix alone would put `/requests/new` under
   * "My requests & orders".
   */
  readonly matches: readonly string[];
}

const dest = (
  key: string, fallback: string, path: string, matches: readonly string[],
  extra: { labelKey?: string; query?: Readonly<Record<string, string>>; children?: readonly NavChild[] } = {}
): NavDestination => ({
  key, fallback, path, matches: [path, ...matches],
  labelKey: extra.labelKey ?? `nav_${key}`,
  ...(extra.query ? { query: extra.query } : {}),
  ...(extra.children ? { children: extra.children } : {})
});

const child = (key: string, fallback: string, path: string): NavChild =>
  ({ key, fallback, path, labelKey: `nav_${key}` });

/** The five sub-pages of "My teaching setup"; the group stays highlighted on each. */
export const TEACHER_SETUP: readonly NavChild[] = [
  child('profile', 'Profile', '/teacher/profile'),
  child('services', 'My services', '/teacher/services'),
  child('availability', 'Availability', '/teacher/availability'),
  child('qualifications', 'Qualifications', '/teacher/qualifications'),
  child('publication', 'Profile visibility', '/teacher/publication')
];

export const PRIMARY_NAV: Readonly<Record<DashboardRole, readonly NavDestination[]>> = {
  Student: [
    dest('home', 'Home', '/student/overview', [], { labelKey: 'nav_role_home' }),
    dest('find_teacher', 'Find a teacher', '/teachers', ['/teachers/']),
    dest('post_request', 'Post a request', '/requests/new', [], { labelKey: 'nav_new_request' }),
    // One place for requests, orders and live sessions; each item opens its own screen, where payment,
    // reviews and disputes live.
    dest('my_requests', 'My requests & orders', '/student/requests',
      ['/requests/', '/orders/', '/live-sessions/', '/checkout', '/disputes']),
    dest('messages', 'Messages', '/messages', ['/conversations/'])
  ],
  Teacher: [
    dest('home', 'Home', '/teacher/home', [], { labelKey: 'nav_role_home' }),
    dest('work', 'Work', '/teacher/work', ['/requests/', '/orders/', '/live-sessions/', '/disputes']),
    dest('open_requests', 'Open requests', '/teacher/opportunities', ['/teacher/opportunities/']),
    dest('messages', 'Messages', '/messages', ['/conversations/']),
    dest('earnings', 'Earnings', '/teacher/earnings', []),
    dest('setup', 'My teaching setup', '/teacher/profile',
      TEACHER_SETUP.map(item => item.path), { children: TEACHER_SETUP })
  ],
  QualityReviewer: [
    dest('applications', 'Applications', '/quality/applications', ['/quality/applications/']),
    dest('account', 'Account', '/quality/account', [])
  ],
  Admin: [
    dest('attention', 'Attention', '/admin/home', ['/admin/attention']),
    dest('people', 'People', '/admin/people', []),
    dest('catalog', 'Catalog & pricing', '/admin/marketplace', []),
    dest('operations', 'Operations', '/admin/operations', ['/requests/', '/orders/', '/live-sessions/', '/disputes']),
    dest('finance', 'Finance', '/admin/finance', []),
    dest('audit', 'Audit', '/admin/system', [])
  ]
};

/** Gate 2's limits. The spec enforces them so navigation cannot grow back by accident. */
export const NAV_LIMITS: Readonly<Record<DashboardRole, number>> =
  { Student: 5, Teacher: 6, QualityReviewer: 2, Admin: 6 };

const clean = (url: string): string => {
  const path = (url.split('?')[0] ?? '').split('#')[0] ?? '';
  const withoutLocale = path.replace(/^\/(ar|en)(?=\/|$)/i, '');
  const trimmed = withoutLocale.replace(/\/+$/, '');
  return trimmed || '/';
};

/**
 * Which primary destination a URL belongs to, or '' when none does (a public page, or a screen no
 * destination owns). The longest matching prefix wins, so `/requests/new` is "Post a request" while
 * `/requests/{id}` is "My requests & orders".
 */
export function activeKey(role: DashboardRole, url: string): string {
  const path = clean(url);
  let best = '';
  let length = 0;
  for (const destination of PRIMARY_NAV[role]) {
    for (const prefix of destination.matches) {
      const match = prefix.endsWith('/')
        ? path.startsWith(prefix) && path.length > prefix.length
        : path === prefix || path.startsWith(`${prefix}/`);
      if (match && prefix.length > length) {
        best = destination.key;
        length = prefix.length;
      }
    }
  }
  return best;
}

/** The sub-page of "My teaching setup" a URL is on, for its own sub-navigation. */
export function activeChild(role: DashboardRole, url: string): string {
  const path = clean(url);
  const destination = PRIMARY_NAV[role].find(item => item.key === activeKey(role, url));
  return destination?.children?.find(item => path === item.path || path.startsWith(`${item.path}/`))?.key ?? '';
}
