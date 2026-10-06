import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, Injector, ViewChild, afterNextRender, computed, inject, signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { combineLatest } from 'rxjs';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { ProblemDetailsDto } from '@core/http/api.dto';
import { DashboardGateway } from '../services/dashboard.gateway';
import {
  DASHBOARDS, Dashboard, DashboardArea, DashboardConfig, DashboardRole, DashboardTab, NotificationAction
} from '../models/dashboard';
import { LocaleService } from '@core/i18n/locale.service';
import { FormatService } from '@core/i18n/format.service';
import { ProtectedFile } from '@core/http/protected-file.service';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import { ToastComponent } from '@shared/components/toast.component';
import { ProtectedFileViewerComponent } from '@shared/components/protected-file-viewer.component';
import { AcceptRequestDialogComponent } from '../components/accept-request-dialog.component';
import { CardFormat, DashboardCardView, presentCard } from '../models/dashboard-card';
import { presentAdminOperation } from '../models/admin-operation-card';
import { presentAdminCard } from '../models/admin-card';
import { AdminRowActionsComponent } from '../components/admin-row-actions.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { IconComponent } from '@shared/components/icon.component';

interface SourceResult { readonly source: string; readonly payload: unknown; readonly error?: string }

@Component({
  selector: 'tf-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ToastComponent, ProtectedFileViewerComponent, AcceptRequestDialogComponent, WorkspaceShellComponent, AdminRowActionsComponent, IconComponent],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.css'
})
export class DashboardPageComponent {
  @ViewChild(ProtectedFileViewerComponent) private readonly viewer?: ProtectedFileViewerComponent;
  @ViewChild(AcceptRequestDialogComponent) private readonly acceptDialog?: AcceptRequestDialogComponent;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gateway = inject(DashboardGateway);
  private readonly titleService = inject(Title);
  readonly sessionStore = inject(SESSION_STORE);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly files = inject(ProtectedFile);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  readonly Dashboard = Dashboard;

  readonly role = this.route.snapshot.data['role'] as DashboardRole;
  readonly config: DashboardConfig = DASHBOARDS[this.role];
  readonly loading = signal(false);
  readonly results = signal<readonly SourceResult[]>([]);
  readonly query = signal('');
  readonly page = signal(1);
  readonly submittedSearch = signal('');
  readonly filter = signal('');
  readonly hasListFilters = computed(() => !!this.submittedSearch().trim() || !!this.filter());
  async clearListFilters(): Promise<void> {
    this.query.set('');
    await this.router.navigate([], { relativeTo: this.route,
      queryParams: { search: null, filter: null, page: null }, queryParamsHandling: 'merge' });
  }
  readonly filters = computed(() => this.role === 'Admin' ? Dashboard.operationFilters(this.tab().sources[0]) : []);
  private reloadId = 0;
  readonly sectionKey = signal(this.route.snapshot.paramMap.get('section') ?? '');
  readonly tabKey = signal(this.route.snapshot.queryParamMap.get('tab') ?? '');
  readonly profileName = signal(this.sessionStore.current()?.fullName ?? '');
  readonly profileNameEnglish = signal(this.sessionStore.current()?.fullNameEnglish ?? '');
  /** The item a link named (`?orderId=`, `?sessionId=` …); its card is highlighted and focused. */
  readonly focusId = signal(Dashboard.focusId(this.route.snapshot.queryParamMap));

  readonly area = computed(() => Dashboard.area(this.config, this.sectionKey()));
  readonly tab = computed(() => Dashboard.tab(this.area(), this.tabKey()));
  readonly adminSummary = computed(() => this.role === 'Admin' && this.tab().key === 'home');
  readonly summary = computed<Record<string, unknown>>(() => {
    const payload = this.results()[0]?.payload;
    return Dashboard.record(payload) ? payload : {};
  });
  readonly attentionItems = computed(() => {
    const source = this.summary();
    const items = [
      ['teacherApplications', 'admin_attention_applications', 'Teacher applications awaiting review'],
      ['openDisputes', 'admin_attention_disputes', 'Open disputes'],
      ['openSupportCases', 'admin_attention_support', 'Help and abuse reports waiting'],
      ['silentSessions', 'admin_attention_silent_sessions', 'Live sessions awaiting your outcome'],
      ['overdueOrders', 'admin_attention_overdue_orders', 'Orders past their agreed delivery'],
      ['pendingWithdrawals', 'admin_attention_withdrawals', 'Withdrawals awaiting a decision'],
      ['pendingPayoutProfiles', 'admin_attention_payout_profiles', 'Payout profiles awaiting verification'],
      ['suspendedWithActiveCommerce', 'admin_attention_suspended_commerce', 'Suspended accounts with live transactions'],
      ['stuckPayments', 'admin_attention_stuck_payments', 'Payments stuck at capture'],
      ['reconciliationAnomalies', 'admin_attention_reconciliation', 'Reconciliation anomalies']
    ] as const;
    // Each count opens the list where it is resolved; a number the admin cannot follow is only a worry.
    const where: Readonly<Record<string, { path: string; query?: Record<string, string> }>> = {
      teacherApplications: { path: '/quality/applications' },
      openDisputes: { path: '/admin/operations', query: { tab: 'disputes', filter: 'unresolved' } },
      openSupportCases: { path: '/admin/help' },
      silentSessions: { path: '/admin/operations', query: { tab: 'sessions', filter: 'admin-review' } },
      overdueOrders: { path: '/admin/operations', query: { tab: 'orders', filter: 'overdue' } },
      // Money queues open the Finance workspace, which Admin reaches as owner access.
      pendingWithdrawals: { path: '/finance/withdrawals' },
      pendingPayoutProfiles: { path: '/finance/payout-profiles' },
      stuckPayments: { path: '/finance/payments', query: { status: 'stuck' } },
      reconciliationAnomalies: { path: '/finance/reconciliation' },
      suspendedWithActiveCommerce: { path: '/admin/people' }
    };
    return items.map(([key, labelKey, fallback]) => ({
      key, labelKey, fallback, count: Number(source[key] ?? 0),
      path: where[key]?.path ?? '/admin/home', query: where[key]?.query ?? null
    })).filter(item => item.count > 0);
  });
  readonly summaryMetrics = computed(() => {
    const source = this.tab().key === 'home'
      ? this.summary()['platform'] : this.summary();
    const data = Dashboard.record(source) ? source : {};
    const fields = this.tab().key === 'home'
      ? [['totalUsers', 'admin_stat_users', 'Total users'], ['activeStudents', 'admin_stat_students', 'Active students'], ['activeTeachers', 'admin_stat_teachers', 'Active teachers']]
      : [['totalUsers', 'admin_stat_users', 'Total users'], ['activeStudents', 'admin_stat_students', 'Active students'], ['activeTeachers', 'admin_stat_teachers', 'Active teachers'], ['pendingApplications', 'admin_stat_applications', 'Pending applications'], ['totalOrders', 'admin_stat_orders', 'Total orders'], ['confirmedPayments', 'admin_stat_payments', 'Confirmed payments'], ['platformRevenue', 'admin_stat_revenue', 'Platform revenue'], ['openDisputes', 'admin_attention_disputes', 'Open disputes'], ['pendingWithdrawals', 'admin_attention_withdrawals', 'Pending withdrawals']];
    return fields.map(([key, labelKey, fallback]) => ({ key, labelKey, fallback,
      value: typeof data[key] === 'number' ? (key === 'confirmedPayments' || key === 'platformRevenue'
        ? this.fmt.money(data[key] as number, 'SAR') : this.fmt.number(data[key] as number)) : '—' }));
  });
  readonly rows = computed<readonly Record<string, unknown>[]>(() => {
    const q = this.query().trim().toLocaleLowerCase();
    const rows: Record<string, unknown>[] = this.results().flatMap(result =>
      Dashboard.rows(result.payload).map(row => ({ ...row, _source: result.source })));
    return q && !this.serverSearch() ? rows.filter(row => JSON.stringify(row).toLocaleLowerCase().includes(q)) : rows;
  });
  readonly serverSearch = computed(() => this.role === 'Admin' &&
    ['/admin/users', '/admin/operations/', '/admin/audit', '/admin/reviews', '/admin/disputes'].some(path => this.tab().sources[0]?.startsWith(path)));
  readonly pagination = computed(() => {
    if (this.tab().sources.length > 1 && this.tab().key !== 'reviews') return null;
    const payload = this.results().map(result => result.payload).find(value =>
      !!value && typeof value === 'object' && 'page' in value && 'totalCount' in value);
    if (!payload || typeof payload !== 'object') return null;
    const data = payload as { page: number; pageSize: number; totalCount: number };
    return { page: data.page, pages: Math.max(1, Math.ceil(data.totalCount / Math.max(1, data.pageSize))), total: data.totalCount };
  });
  /**
   * Students and teachers see product cards (UX-04): statuses in words, a few labelled facts, one
   * link, and no search box or refresh button. Admin and Quality keep the operational list.
   */
  readonly productCards = this.role === 'Student' || this.role === 'Teacher';
  /** Each row with its product card; rows a student or teacher should not see are left out. */
  readonly cards = computed<readonly { row: Record<string, unknown>; card: DashboardCardView | null }[]>(() => {
    const fmt: CardFormat = {
      lang: this.locale.lang(),
      t: (key, fallback) => this.t(key, fallback),
      format: (key, values, fallback) => this.locale.format(key, values, fallback),
      money: (value, currency) => this.fmt.money(value, typeof currency === 'string' ? currency : undefined),
      date: value => (typeof value === 'string' || typeof value === 'number' ? this.fmt.date(value) : ''),
      relative: value => (typeof value === 'string' || typeof value === 'number' ? this.fmt.relative(value) : '')
    };
    if (!this.productCards) return (this.adminSummary() ? [] : this.rows()).map(row => ({ row,
      card: this.role === 'Admin' ? (presentAdminOperation(row, fmt, Date.now()) ?? presentAdminCard(row, fmt)) : null }));
    const context = {
      viewer: this.role === 'Teacher' ? 'teacher' as const : 'student' as const,
      viewerId: this.sessionStore.current()?.userId ?? '',
      now: Date.now(),
      fmt
    };
    return this.rows().flatMap(row => {
      const card = presentCard(row, context);
      return card ? [{ row, card }] : [];
    });
  });
  readonly errors = computed(() => this.results().filter(x => x.error));
  readonly heading = computed(() => this.t(this.tab().labelKey, this.tab().fallback));

  constructor() {
    combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(([params, query]) => {
      this.sectionKey.set(params.get('section') ?? '');
      this.tabKey.set(query.get('tab') ?? '');
      this.page.set(Math.max(1, Number(query.get('page')) || 1));
      this.submittedSearch.set(query.get('search') ?? '');
      this.query.set(query.get('search') ?? '');
      this.filter.set(query.get('filter') ?? '');
      this.focusId.set(Dashboard.focusId(query));
      void this.openFromRoute();
    });
  }

  /**
   * The card's definition list used to print the raw property name as its term,
   * so an Arabic reader got `createdAt` and `totalCount` in a right-to-left
   * card. The label is a translated string now; the key stays the property name
   * because that is what the row is indexed by.
   */
  readonly FIELDS = [
    { key: 'amount', labelKey: 'field_amount', fallback: 'Amount' },
    { key: 'currency', labelKey: 'field_currency', fallback: 'Currency' },
    { key: 'createdAt', labelKey: 'field_created_at', fallback: 'Created' },
    { key: 'updatedAt', labelKey: 'field_updated_at', fallback: 'Updated' },
    { key: 'scheduledAt', labelKey: 'field_scheduled_at', fallback: 'Scheduled' },
    { key: 'deadline', labelKey: 'field_deadline', fallback: 'Deadline' },
    { key: 'totalCount', labelKey: 'field_total_count', fallback: 'Total' },
    { key: 'count', labelKey: 'field_count', fallback: 'Count' }
  ] as const;

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  /** An account's roles, for the People cards: who someone is on Tafseel, next to their name. */
  rolesOf(row: Record<string, unknown>): readonly string[] {
    const roles = row['roles'];
    return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [];
  }
  text(value: unknown): string { return value == null || value === '' ? '—' : String(value); }
  fieldText(key: string, value: unknown): string {
    if (['createdAt', 'updatedAt', 'scheduledAt', 'deadline'].includes(key) && typeof value === 'string')
      return this.fmt.date(value) || this.text(value);
    if (['totalCount', 'count'].includes(key) && typeof value === 'number')
      return this.fmt.number(value);
    return this.text(value);
  }
  areaLabel(area: DashboardArea): string { return this.t(area.labelKey, area.fallback); }
  tabLabel(tab: DashboardTab): string { return this.t(tab.labelKey, tab.fallback); }
  filesOf(row: Record<string, unknown>, key: 'deliveries' | 'attachments'): readonly Record<string, unknown>[] {
    const value = row[key];
    return Array.isArray(value) ? value.filter(Dashboard.record) : [];
  }
  fileName(file: Record<string, unknown>): string {
    return String(file['originalName'] || file['fileName'] || this.t('common_file', 'File'));
  }
  isFocused(row: Record<string, unknown>): boolean {
    return !!this.focusId() && String(row['id'] ?? '') === this.focusId();
  }

  isNotification(row: Record<string, unknown>): boolean {
    return String(row['_source'] ?? '').startsWith('/notifications');
  }

  /** The action a notification card offers, or null when it has no link this app may follow. */
  notificationAction(row: Record<string, unknown>): NotificationAction | null {
    return this.isNotification(row) ? Dashboard.notificationAction(row['link']) : null;
  }

  /**
   * Opening a notification marks it read on the way out. The request is not awaited: the link
   * is followed at once, and a failed mark only leaves the notification unread.
   */
  markRead(row: Record<string, unknown>): void {
    if (row['readAt']) return;
    const id = encodeURIComponent(String(row['id'] ?? ''));
    if (id) this.gateway.post(`/notifications/read?id=${id}`).catch(() => undefined);
  }

  async navigate(area: DashboardArea, tab = area.tabs[0]): Promise<void> {
    await this.router.navigate([this.config.basePath, area.key], { queryParams: tab.key === area.key ? null : { tab: tab.key } });
  }

  async chooseTab(tab: DashboardTab): Promise<void> {
    await this.router.navigate([], { relativeTo: this.route, queryParams: { tab: tab.key, page: null, search: null }, queryParamsHandling: 'merge' });
  }

  async reload(): Promise<void> {
    const id = ++this.reloadId;
    this.loading.set(true);
    const sources = this.tab().sources.map(source => {
      if (this.tab().sources.length > 1 && this.tab().key !== 'reviews') return source;
      return Dashboard.pageSource(source, this.page(), this.serverSearch() ? this.submittedSearch() : '',
        this.filters().some(f => f[0] === this.filter()) ? this.filter() : '');
    });
    const results = await this.gateway.load(sources);
    if (id !== this.reloadId) return;
    this.results.set(results);
    this.loading.set(false);
  }

  async goPage(page: number): Promise<void> {
    if (page < 1 || page > (this.pagination()?.pages ?? 1)) return;
    await this.router.navigate([], { relativeTo: this.route, queryParams: { page: page === 1 ? null : page }, queryParamsHandling: 'merge' });
  }

  async chooseFilter(value: string): Promise<void> {
    await this.router.navigate([], { relativeTo: this.route, queryParams: { filter: value || null, page: null }, queryParamsHandling: 'merge' });
  }

  async searchAll(): Promise<void> {
    await this.router.navigate([], { relativeTo: this.route, queryParams: { search: this.query().trim() || null, page: null }, queryParamsHandling: 'merge' });
  }

  async markAllRead(): Promise<void> {
    try { await this.gateway.post('/notifications/read'); await this.reload(); this.toasts.show(this.t('notifications_marked_read', 'Notifications marked as read.')); }
    catch (error) { this.fail(error); }
  }

  async rowAction(row: Record<string, unknown>, action: string): Promise<void> {
    const id = encodeURIComponent(String(row['id'] ?? '')), version = String(row['version'] ?? '');
    if (!id) return;
    try {
      if (action === 'accept') {
        // Acceptance sets the order's terms, so it is a form (J3-07); the dialog reports back.
        await this.acceptDialog?.open({
          id: String(row['id']), version, title: Dashboard.title(row),
          teacherServiceId: String(row['teacherServiceId'] ?? ''),
          preferredDeliveryAt: row['preferredDeliveryAt'] ? String(row['preferredDeliveryAt']) : null,
          listedPrice: typeof row['listedPriceAtRequest'] === 'number' ? row['listedPriceAtRequest'] as number : null
        });
        return;
      }
      if (action === 'decline') {
        const reason = await this.dialogs.prompt({ message: this.t('common_reason', 'Reason') });
        if (!reason) return;
        await this.gateway.post(`/learning-requests/${id}/decline`, { reason }, version);
      }
      if (action === 'suspend') {
        const suspended = !row['isSuspended'];
        if (!await this.dialogs.confirm({ body: this.t('admin_confirm_user_state', 'Change this user status?') })) return;
        await this.gateway.put(`/admin/users/${id}/suspension`, { suspended });
      }
      await this.reload(); this.toasts.show(this.t('common_saved', 'Saved.'));
    } catch (error) { this.fail(error); }
  }

  activeToggle(row: Record<string, unknown>): string | null {
    return this.role === 'Admin' ? Dashboard.activeToggle(this.tab().key, row) : null;
  }

  /** Only a request still waiting for the teacher can be accepted (LearningRequest.Accept). */
  canAccept(row: Record<string, unknown>): boolean {
    return row['status'] === 0 && !!row['teacherServiceId'];
  }

  /** Only a request waiting for the teacher or for clarification can be declined. */
  canDecline(row: Record<string, unknown>): boolean {
    return row['status'] === 0 || row['status'] === 1;
  }

  async onAccepted(): Promise<void> {
    await this.reload();
    this.toasts.show(this.t('accept_done', 'Accepted. The order is waiting for the student’s payment.'));
  }

  async toggleActive(row: Record<string, unknown>): Promise<void> {
    const endpoint = this.activeToggle(row);
    if (!endpoint) return;
    try { await this.gateway.patch(endpoint, { isActive: !row['isActive'] }); await this.reload(); }
    catch (error) { this.fail(error); }
  }

  previewDelivery(file: Record<string, unknown>): void {
    this.preview(`/api/v1/orders/deliveries/${encodeURIComponent(String(file['id']))}/content`, file);
  }

  previewSessionFile(file: Record<string, unknown>): void {
    this.preview(`/api/v1/live-sessions/attachments/${encodeURIComponent(String(file['id']))}/content`, file);
  }

  async exportData(): Promise<void> {
    try { await this.files.open('/api/v1/auth/privacy/export', { download: true, fileName: 'tafseel-account-data.json' }); }
    catch (error) { this.fail(error); }
  }

  async saveProfile(): Promise<void> {
    try {
      await this.gateway.put('/auth/profile', {
        fullName: this.profileName().trim(), fullNameEnglish: this.profileNameEnglish().trim()
      });
      this.toasts.show(this.t('common_saved', 'Saved.'));
    } catch (error) { this.fail(error); }
  }

  private async openFromRoute(): Promise<void> {
    const selected = this.tab();
    this.titleService.setTitle(`${this.t(selected.labelKey, selected.fallback)} — Tafseel`);
    await this.reload();
    this.revealFocused();
  }

  private revealFocused(): void {
    const id = this.focusId();
    if (!id || !this.rows().some(row => this.isFocused(row))) return;
    afterNextRender(() => {
      const card = this.document.getElementById(`dashboard-item-${id}`);
      card?.scrollIntoView({ block: 'center' });
      card?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  private preview(path: string, file: Record<string, unknown>): void {
    void this.viewer?.open(path, this.fileName(file), String(file['contentType'] ?? ''));
  }

  /**
   * The API answers a refused action with a reason — "Payment confirmation is
   * required before work starts." — and this used to replace all of it with
   * "Something went wrong.", which tells the teacher nothing about what to do.
   *
   * A translated `err_<code>` wins when the vocabulary has one. An Arabic page
   * must not fall back to an untranslated server sentence; an unknown code gets
   * the generic localised message until its translation is added.
   */
  private fail(error: unknown): void {
    const problem = error instanceof HttpErrorResponse
      ? (error.error ?? {}) as ProblemDetailsDto
      : {};
    const translated = problem.code ? this.locale.t(`err_${problem.code}`, '') : '';
    this.toasts.show(
      translated
      || (this.locale.lang() === 'en' ? problem.detail || problem.title : '')
      || this.t('unexpected_error', 'Something went wrong.'));
  }
}
