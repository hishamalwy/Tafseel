import { Role } from '@core/auth/models/role';

export type DashboardRole = Extract<Role, 'Student' | 'Teacher' | 'QualityReviewer' | 'Admin'>;

export interface DashboardTab {
  readonly key: string;
  readonly labelKey: string;
  readonly fallback: string;
  readonly sources: readonly string[];
}

export interface DashboardArea {
  readonly key: string;
  readonly labelKey: string;
  readonly fallback: string;
  readonly tabs: readonly DashboardTab[];
}

export interface DashboardConfig {
  readonly role: DashboardRole;
  readonly basePath: string;
  readonly titleKey: string;
  readonly title: string;
  readonly areas: readonly DashboardArea[];
}

const tab = (key: string, fallback: string, sources: readonly string[], labelKey = ''): DashboardTab =>
  ({ key, fallback, sources, labelKey: labelKey || `dash_${key}` });
const area = (key: string, fallback: string, tabs: readonly DashboardTab[], labelKey = ''): DashboardArea =>
  ({ key, fallback, tabs, labelKey: labelKey || `dash_${key}` });

export const DASHBOARDS: Readonly<Record<DashboardRole, DashboardConfig>> = {
  Student: {
    role: 'Student', basePath: '/student', titleKey: 'sd_title', title: 'Student dashboard',
    areas: [
      // Home is its own action-first screen (UX-01); the lists behind it stay in My learning.
      area('overview', 'Overview', [tab('overview', 'Overview', [])]),
      area('requests', 'My learning', [tab('requests', 'Requests', ['/learning-requests/mine?pageSize=50']), tab('orders', 'Orders', ['/orders/mine?pageSize=50'])], 'dash_my_learning'),
      area('sessions', 'Sessions', [tab('sessions', 'Sessions', ['/live-sessions/mine?pageSize=50'])]),
      area('messages', 'Messages', [tab('messages', 'Messages', ['/conversations?pageSize=50'])]),
      area('saved', 'Saved teachers', [tab('saved', 'Saved teachers', ['/favorite-teachers'])]),
      area('payments', 'Payments', [tab('payments', 'Payments', ['/orders/mine?pageSize=100', '/live-sessions/mine?pageSize=100'])]),
      area('reviews', 'Reviews & disputes', [tab('reviews', 'Reviews & disputes', ['/disputes/eligible', '/disputes/mine'], 'dash_reviews_disputes')], 'dash_reviews_disputes'),
      area('notifications', 'Notifications', [tab('notifications', 'Notifications', ['/notifications?pageSize=100'])]),
      area('settings', 'Settings', [tab('settings', 'Settings', ['/notification-preferences', '/students/me/learning-preferences', '/languages', '/auth/sessions'])])
    ]
  },
  Teacher: {
    role: 'Teacher', basePath: '/teacher', titleKey: 'td_title', title: 'Teacher workspace',
    areas: [
      // Home is its own action-first screen (UX-02); the lists behind it stay in Work and Earnings.
      area('home', 'Home', [tab('home', 'Home', [])]),
      area('work', 'Work', [tab('requests', 'Requests', ['/learning-requests/assigned?pageSize=50']), tab('orders', 'Orders', ['/orders/assigned?pageSize=50']), tab('sessions', 'Sessions', ['/live-sessions/mine?pageSize=50'])]),
      area('opportunities', 'Opportunities', [tab('opportunities', 'Opportunities', ['/open-marketplace/opportunities?pageSize=50'])]),
      area('messages', 'Messages', [tab('messages', 'Messages', ['/conversations?pageSize=50'])]),
      // Profile, services, availability and publication are their own screens
      // (features/teacher-setup); the router serves them before this generic page.
      area('profile', 'Profile', [tab('details', 'Profile details', [])]),
      area('services', 'Services', [tab('catalog', 'Services & prices', [])]),
      area('availability', 'Availability', [tab('availability', 'Availability', [])]),
      area('publication', 'Publication', [tab('publication', 'Publication', [])]),
      // Videos & showcases are V1.1 (B11-05) and reviews are read on the public profile, so neither is
      // a tab here any more (UX-03). Their routes and APIs are untouched.
      area('qualifications', 'Qualifications', [tab('qualifications', 'Qualifications', ['/teachers/me/qualifications'])]),
      // Earnings is its own screen (FIN-01); the withdrawal request and payout details are FIN-02/FIN-03.
      area('earnings', 'Earnings', [tab('earnings', 'Earnings', [])]),
      area('settings', 'Settings', [tab('settings', 'Settings', ['/notification-preferences'])])
    ]
  },
  QualityReviewer: {
    role: 'QualityReviewer', basePath: '/quality', titleKey: 'qd_title', title: 'Quality workspace',
    areas: [
      // The application queue and review are their own screens (features/quality).
      area('applications', 'Applications', [tab('applications', 'Applications', [])]),
      area('account', 'Account', [tab('settings', 'Settings', ['/notification-preferences', '/notifications?pageSize=20'])])
    ]
  },
  Admin: {
    role: 'Admin', basePath: '/admin', titleKey: 'admin_title', title: 'Admin command centre',
    areas: [
      area('home', 'Home', [tab('home', 'Home', ['/admin/attention'])]),
      area('people', 'People', [tab('users', 'Users', ['/admin/users?page=1&pageSize=20']), tab('teachers', 'Teachers', ['/admin/users?role=Teacher&page=1&pageSize=20']), tab('students', 'Students', ['/admin/users?role=Student&page=1&pageSize=20']), tab('reviewers', 'Reviewers', ['/admin/users?role=Reviewer&page=1&pageSize=20'])]),
      // Catalog & pricing (UX-03): V1 shows the Catalog Services and the subjects behind them. Topics,
      // education levels and qualification-topic editors are B11-12; promotions are DEC-09/B11-08.
      area('marketplace', 'Marketplace', [tab('services', 'Services', ['/admin/catalog/services']), tab('subjects', 'Subjects', ['/admin/catalog/subjects'])]),
      area('operations', 'Operations', [tab('requests', 'Requests', ['/admin/operations/requests?page=1&pageSize=20']), tab('orders', 'Orders', ['/admin/operations/orders?page=1&pageSize=20']), tab('sessions', 'Sessions', ['/admin/operations/sessions?page=1&pageSize=20']), tab('disputes', 'Disputes', ['/admin/disputes?page=1&pageSize=20']), tab('reviews', 'Reviews', ['/admin/reviews?page=1&pageSize=20', '/admin/reviews/summary'])]),
      area('finance', 'Finance', [tab('payments', 'Payments', ['/admin/metrics']), tab('withdrawals', 'Withdrawals', ['/admin/withdrawals?status=0&page=1&pageSize=20']), tab('payoutProfiles', 'Payout profiles', ['/admin/payout-profiles?status=0&page=1&pageSize=20']), tab('reconciliation', 'Reconciliation', ['/admin/finance/reconciliation'])]),
      // Audit (UX-03): the audit log is the whole area in V1; there is no platform-settings screen to show.
      area('system', 'Audit', [tab('audit', 'Audit', ['/admin/audit?page=1&pageSize=20'])])
    ]
  }
};

/**
 * Where a notification's `link` goes. Only a path on this site is followed: an absolute or
 * protocol-relative address, a backslash trick or an API path is dropped, so a notification can
 * never send the reader somewhere else. A path is routed inside the reader's current locale (a
 * `/ar/` or `/en/` prefix in a stored link is ignored). Links stored before the move to this app
 * point at `/app/*.dc.html`; those stay plain hrefs relative to the locale base so the server's
 * redirect table can answer them.
 */
export type NotificationAction =
  | { readonly kind: 'route'; readonly path: string; readonly query: Readonly<Record<string, string>> }
  | { readonly kind: 'legacy'; readonly href: string };

/**
 * Admin enable/disable, per tab (J13-02). The tab key is a UI name; the server has its own
 * catalog type slugs (`education-levels`, `qualification-topics`), and every toggle is PATCH.
 * A tab can list rows from more than one source (topics shows subjects too), so a toggle is
 * offered only on rows that came from the tab's own list.
 */
export interface ActiveToggle {
  /** The GET source whose rows this toggle applies to. */
  readonly listSource: string;
  /** The PATCH endpoint, relative to /api/v1. */
  endpoint(id: string): string;
}

const catalogToggle = (type: string): ActiveToggle => ({
  listSource: `/admin/catalog/${type}`,
  endpoint: id => `/admin/catalog/${type}/${encodeURIComponent(id)}/active`
});

/**
 * Only the tabs V1 actually shows (UX-03). Topics, education levels, qualification topics, promotions and
 * coupons are not offered in navigation, so nothing here can toggle them; their endpoints are untouched and
 * return with `B11-12` and `DEC-09`/`B11-08`.
 */
export const ADMIN_ACTIVE_TOGGLES: Readonly<Record<string, ActiveToggle>> = {
  services: catalogToggle('services'),
  subjects: catalogToggle('subjects')
};

/** Query parameters a link may carry to name the item the destination should open on. */
export const FOCUS_PARAMS = ['orderId', 'sessionId', 'requestId', 'conversationId', 'reviewId', 'selectedId'] as const;

export const Dashboard = {
  record,
  notificationAction(link: unknown): NotificationAction | null {
    if (typeof link !== 'string') return null;
    const raw = link.trim();
    // eslint-disable-next-line no-control-regex
    if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f]/.test(raw)) return null;
    const base = 'https://link.invalid';
    let url: URL;
    try { url = new URL(raw, base); } catch { return null; }
    if (url.origin !== base) return null;
    const path = url.pathname.replace(/^\/(ar|en)(?=\/|$)/i, '') || '/';
    if (/^\/(api|hubs|health)(\/|$)/i.test(path)) return null;
    if (/^\/app\//i.test(path)) return { kind: 'legacy', href: path.slice(1) + url.search };
    return { kind: 'route', path, query: Object.fromEntries(url.searchParams) };
  },
  /** The PATCH endpoint that enables or disables this row, or null when the row has none. */
  activeToggle(tabKey: string, row: Record<string, unknown>): string | null {
    const toggle = ADMIN_ACTIVE_TOGGLES[tabKey];
    const source = String(row['_source'] ?? '').split('?')[0];
    const id = String(row['id'] ?? '');
    return toggle && id && source === toggle.listSource ? toggle.endpoint(id) : null;
  },
  /**
   * The screen for one row, by the list it came from: an order, a live session, a request, an
   * open-marketplace opportunity or a conversation each have their own page.
   */
  detailLink(row: Record<string, unknown>): readonly string[] | null {
    const source = String(row['_source'] ?? '').split('?')[0];
    const id = String(row['id'] ?? '');
    if (!id) return null;
    if (source === '/orders/mine' || source === '/orders/assigned') return ['/orders', id];
    if (source === '/live-sessions/mine') return ['/live-sessions', id];
    if (source === '/learning-requests/mine' || source === '/learning-requests/assigned') return ['/requests', id];
    if (source === '/open-marketplace/opportunities') return ['/teacher/opportunities', id];
    if (source === '/conversations') return ['/conversations', id];
    return null;
  },
  focusId(query: { get(name: string): string | null }): string {
    for (const name of FOCUS_PARAMS) { const value = query.get(name); if (value) return value; }
    return '';
  },
  area(config: DashboardConfig, key: string): DashboardArea {
    return config.areas.find(x => x.key.toLowerCase() === key.toLowerCase()) ?? config.areas[0];
  },
  tab(area: DashboardArea, key: string): DashboardTab {
    return area.tabs.find(x => x.key.toLowerCase() === key.toLowerCase()) ?? area.tabs[0];
  },
  rows(payload: unknown): readonly Record<string, unknown>[] {
    if (Array.isArray(payload)) return payload.filter(record) as Record<string, unknown>[];
    if (!record(payload)) return [];
    for (const key of ['items', 'results', 'data']) if (Array.isArray(payload[key])) return payload[key].filter(record) as Record<string, unknown>[];
    return [payload];
  },
  title(row: Record<string, unknown>): string {
    return String(row['title'] || row['name'] || row['fullName'] || row['subjectName'] || row['email'] || row['code'] || row['id'] || '—');
  },
  detail(row: Record<string, unknown>): string {
    return ['statusName', 'teacherName', 'studentName', 'city', 'description', 'detail', 'reason', 'body']
      .map(k => row[k]).filter(v => typeof v === 'string' && v).slice(0, 3).join(' · ');
  }
} as const;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
