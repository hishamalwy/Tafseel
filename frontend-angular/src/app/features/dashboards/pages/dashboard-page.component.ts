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
import { BrandMarkComponent } from '@shared/components/brand-mark.component';
import { LangToggleComponent } from '@shared/components/lang-toggle.component';
import { ThemeToggleComponent } from '@shared/components/theme-toggle.component';
import { ProtectedFileViewerComponent } from '@shared/components/protected-file-viewer.component';
import { AcceptRequestDialogComponent } from '../components/accept-request-dialog.component';

interface SourceResult { readonly source: string; readonly payload: unknown; readonly error?: string }

@Component({
  selector: 'tf-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ToastComponent, BrandMarkComponent, LangToggleComponent, ThemeToggleComponent, ProtectedFileViewerComponent, AcceptRequestDialogComponent],
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
  readonly drawer = signal(false);
  readonly loading = signal(false);
  readonly results = signal<readonly SourceResult[]>([]);
  readonly query = signal('');
  readonly sectionKey = signal(this.route.snapshot.paramMap.get('section') ?? '');
  readonly tabKey = signal(this.route.snapshot.queryParamMap.get('tab') ?? '');
  readonly profileName = signal(this.sessionStore.current()?.fullName ?? '');
  readonly profileNameEnglish = signal(this.sessionStore.current()?.fullNameEnglish ?? '');
  /** The item a link named (`?orderId=`, `?sessionId=` …); its card is highlighted and focused. */
  readonly focusId = signal(Dashboard.focusId(this.route.snapshot.queryParamMap));

  readonly area = computed(() => Dashboard.area(this.config, this.sectionKey()));
  readonly tab = computed(() => Dashboard.tab(this.area(), this.tabKey()));
  readonly rows = computed<readonly Record<string, unknown>[]>(() => {
    const q = this.query().trim().toLocaleLowerCase();
    const rows: Record<string, unknown>[] = this.results().flatMap(result =>
      Dashboard.rows(result.payload).map(row => ({ ...row, _source: result.source })));
    return q ? rows.filter(row => JSON.stringify(row).toLocaleLowerCase().includes(q)) : rows;
  });
  readonly errors = computed(() => this.results().filter(x => x.error));
  readonly heading = computed(() => this.t(this.tab().labelKey, this.tab().fallback));

  constructor() {
    combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(([params, query]) => {
      this.sectionKey.set(params.get('section') ?? '');
      this.tabKey.set(query.get('tab') ?? '');
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
  text(value: unknown): string { return value == null || value === '' ? '—' : String(value); }
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
    this.drawer.set(false);
    await this.router.navigate([this.config.basePath, area.key], { queryParams: tab.key === area.key ? null : { tab: tab.key } });
  }

  async chooseTab(tab: DashboardTab): Promise<void> {
    await this.router.navigate([], { relativeTo: this.route, queryParams: { tab: tab.key }, queryParamsHandling: 'merge' });
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.results.set(await this.gateway.load(this.tab().sources));
    this.loading.set(false);
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
          preferredDeliveryAt: row['preferredDeliveryAt'] ? String(row['preferredDeliveryAt']) : null
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
   * A translated `err_<code>` wins when the vocabulary has one; otherwise the
   * server's own sentence is shown, because an accurate English reason beats a
   * localised non-answer. The generic line stays for failures that carry
   * neither — a dropped connection, say.
   */
  private fail(error: unknown): void {
    const problem = error instanceof HttpErrorResponse
      ? (error.error ?? {}) as ProblemDetailsDto
      : {};
    const translated = problem.code ? this.locale.t(`err_${problem.code}`, '') : '';
    this.toasts.show(
      translated
      || problem.detail
      || problem.title
      || this.t('unexpected_error', 'Something went wrong.'));
  }
}
