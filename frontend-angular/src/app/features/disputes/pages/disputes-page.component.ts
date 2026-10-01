import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { Dispute, DisputeResolution, EligiblePurchase } from '@features/disputes/models/dispute';
import {
  DISPUTE_PAGE_SIZE, ListDisputes, ListEligiblePurchases, OpenDispute, OpenEvidence,
  PostCaseMessage, ResolveDispute, StartDisputeReview, UploadEvidence
} from '@features/disputes/services/dispute.use-cases';
import { DISPUTE_COPY } from '@features/disputes/content/disputes.content';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { FilePickerComponent } from '@shared/components/file-picker.component';
import { WorkflowHeaderComponent } from '@shared/layouts/workflow-header.component';
import { SkipLinkComponent } from '@shared/layouts/skip-link.component';

/**
 * The Dispute Center — ported from `Tafseel-Disputes.dc.html`.
 *
 * Two changes to how state is addressed, both because the original used
 * `history.replaceState` and so could not be linked or reloaded:
 *  - the selected case and the page are query parameters the component reads,
 *    so a case survives a refresh and can be pasted to a colleague;
 *  - `?orderId=` / `?liveSessionId=` still preselect a purchase, as before.
 *
 * Everything that decides an outcome — eligibility, concurrency versions,
 * idempotency keys, upload limits — lives in the domain and use cases. This
 * class only decides what is on screen.
 */
@Component({
  selector: 'tf-disputes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, WorkflowHeaderComponent, SkipLinkComponent, FilePickerComponent],
  templateUrl: './disputes-page.component.html',
  styleUrl: './disputes-page.component.css'
})
export class DisputesPageComponent {
  private readonly listDisputes = inject(ListDisputes);
  private readonly listEligible = inject(ListEligiblePurchases);
  private readonly openDispute = inject(OpenDispute);
  private readonly postMessage = inject(PostCaseMessage);
  private readonly uploadEvidence = inject(UploadEvidence);
  private readonly openEvidence = inject(OpenEvidence);
  private readonly startReview = inject(StartDisputeReview);
  private readonly resolveDispute = inject(ResolveDispute);
  private readonly store = inject(SignalSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  readonly locale = inject(LocaleService);
  private readonly fmt = inject(FormatService);

  readonly c = computed(() => DISPUTE_COPY[this.locale.lang()]);

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');

  readonly items = signal<readonly Dispute[]>([]);
  readonly eligible = signal<readonly EligiblePurchase[]>([]);
  readonly selected = signal<Dispute | null>(null);
  readonly page = signal(1);
  readonly total = signal(0);

  readonly targetKey = signal('');
  readonly createReason = signal('');
  readonly createError = signal('');
  readonly messageBody = signal('');
  readonly resolution = signal<DisputeResolution>('refund-student');
  readonly rationale = signal('');
  private resolveKey = '';

  readonly isAdmin = computed(() => this.store.roles().includes('Admin'));
  private readonly userId = computed(() => this.store.value()?.userId ?? '');

  constructor() {
    queueMicrotask(() => this.title.setTitle(`${this.c().center} — Tafseel`));

    const q = this.route.snapshot.queryParamMap;
    const order = q.get('orderId');
    const session = q.get('liveSessionId');
    if (order) this.targetKey.set(`order:${order}`);
    else if (session) this.targetKey.set(`session:${session}`);

    void this.load(q.get('selectedId') ?? '', Math.max(1, Number(q.get('page') ?? 1) || 1));
  }

  // ---- derived view state ----
  readonly dashboardRoute = computed(() => {
    const roles = this.store.roles();
    if (roles.includes('Admin')) return '/admin';
    if (roles.includes('Teacher')) return '/teacher';
    return '/student';
  });

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / DISPUTE_PAGE_SIZE)));
  readonly hasPagination = computed(() => this.total() > DISPUTE_PAGE_SIZE);
  readonly canGoBack = computed(() => !this.loading() && this.page() > 1);
  readonly canGoForward = computed(() => !this.loading() && this.page() < this.pageCount());
  readonly pageLabel = computed(() => this.locale.lang() === 'ar'
    ? `صفحة ${this.page()} من ${this.pageCount()}`
    : `Page ${this.page()} of ${this.pageCount()}`);

  readonly canOpenCase = computed(() =>
    !this.isAdmin() && !this.loading() && this.eligible().length > 0);
  readonly noEligible = computed(() =>
    !this.isAdmin() && !this.loading() && this.eligible().length === 0);

  readonly caseRows = computed(() => this.items().map(d => ({
    id: d.id,
    target: this.subjectLabel(d),
    reason: d.reason,
    status: this.statusLabel(d),
    statusTone: this.statusTone(d),
    date: this.dateTime(d.createdAt),
    current: this.selected()?.id === d.id
  })));

  readonly eligibleOptions = computed(() => this.eligible().map(p => ({
    value: `${p.type}:${p.id}`,
    label: this.eligibleLabel(p)
  })));

  readonly reviewing = signal(false);
  readonly received = signal(false);
  readonly chosenLabel = computed(() => this.eligibleOptions().find(o => o.value === this.targetKey())?.label ?? '');

  readonly selectedEligibility = computed(() => {
    const chosen = this.eligible().find(p => `${p.type}:${p.id}` === this.targetKey());
    return chosen ? `${this.c().until} ${this.dateTime(chosen.eligibleUntil)}` : '';
  });

  readonly detail = computed(() => {
    const d = this.selected();
    if (!d) return null;
    const decision = d.decisions[0] ?? null;
    return {
      target: this.subjectLabel(d),
      purchase: this.purchaseLink(d),
      reason: d.reason,
      status: this.statusLabel(d),
      statusTone: this.statusTone(d),
      // Whose action: the date is Tafseel's own promise (a first response while open, a decision once in review).
      actionDue: d.actionDueAt
        ? this.locale.format(d.status === 'open' ? 'dispute_due_open' : 'dispute_due_review', { date: this.dateTime(d.actionDueAt) },
            d.status === 'open' ? 'Tafseel will respond by {date}.' : 'Tafseel’s decision is expected by {date}.')
        : '',
      next: this.isAdmin() ? '' : this.nextStep(d),
      overdue: Dispute.isOverdue(d),
      messages: d.messages.map(m => ({
        sender: this.senderLabel(m.senderId, d),
        body: m.body,
        date: this.dateTime(m.createdAt),
        mine: m.senderId === this.userId()
      })),
      timeline: d.history.map(h => ({
        label: (this.locale.lang() === 'ar' ? 'تغيرت الحالة إلى ' : 'Status changed to ')
          + this.c().statuses[['open', 'under-review', 'resolved'].indexOf(h.nextStatus)],
        date: this.dateTime(h.createdAt)
      })),
      evidence: d.evidence,
      canParticipate: Dispute.acceptsMessagesFrom(d, this.isAdmin()),
      canUploadEvidence: !this.isAdmin(),
      showResolvedHint: !this.isAdmin() && d.status === 'resolved',
      adminActions: this.isAdmin() && d.status !== 'resolved',
      canStartReview: d.status === 'open',
      canResolve: d.status === 'under-review',
      decision: decision?.rationale ?? ''
    };
  });

  /** What the person is waiting for, so an open report never reads as silence. */
  private nextStep(d: Dispute): string {
    if (d.status === 'resolved') return this.locale.t('dispute_next_resolved', 'Tafseel has decided. The decision and its reason are below; any refund or payment follows it automatically.');
    if (d.status === 'under-review') return this.locale.t('dispute_next_review', 'Tafseel’s team is reviewing the messages and files. You do not need to do anything unless they ask you here.');
    const mine = !d.openedById || d.openedById === this.userId();
    return mine
      ? this.locale.t('dispute_next_open_mine', 'Tafseel has your report and the other person has been told. Add any files that help. You do not need to do anything else; we will e-mail you when there is news.')
      : this.locale.t('dispute_next_open_other', 'The other person reported a problem with this purchase. Reply here and add any files that show your side. Tafseel’s team will decide.');
  }

  readonly messageFieldLabel = computed(() => this.isAdmin()
    ? this.locale.t('dispute_reviewer_question', 'Ask the student and the teacher (both read it and can reply)')
    : this.c().addMessage);

  // ---- actions ----
  async load(selectId = this.selected()?.id ?? '', page = this.page()): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const admin = this.isAdmin();

    try {
      // The eligible list is a nicety; a failure there must not hide the cases.
      const [pageResult, eligibleResult] = await Promise.allSettled([
        this.listDisputes.execute(admin, page),
        this.listEligible.execute(admin)
      ]);
      if (pageResult.status === 'rejected') throw pageResult.reason;

      const result = pageResult.value;
      const eligible = eligibleResult.status === 'fulfilled' ? eligibleResult.value : [];
      this.items.set(result.items);
      this.eligible.set(eligible);
      this.page.set(result.page);
      this.total.set(result.totalCount);

      // Keep a preselected purchase only while it is still eligible.
      const key = this.targetKey();
      if (key && !eligible.some(p => `${p.type}:${p.id}` === key)) this.targetKey.set('');
      if (!this.targetKey() && eligible.length) {
        this.targetKey.set(`${eligible[0]!.type}:${eligible[0]!.id}`);
      }

      let chosen = selectId ? result.items.find(d => d.id === selectId) ?? null : null;
      // A case can be linked to from another page and not be on this one.
      if (selectId && !chosen) chosen = await this.listDisputes.byId(admin, selectId);
      this.selected.set(chosen ?? result.items[0] ?? null);

      this.messageBody.set('');
      if (eligibleResult.status === 'rejected') {
        this.error.set(this.describe(eligibleResult.reason));
      }
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.loading.set(false);
      this.busy.set(false);
    }
  }

  async create(event: Event): Promise<void> {
    event.preventDefault();
    const [type, id] = this.targetKey().split(':');
    if (!type || !id || !this.createReason().trim()) {
      this.createError.set(this.c().missing);
      this.reviewing.set(false);
      return;
    }
    // UX-87: the first press reads the report back; only the second one sends it.
    if (!this.reviewing()) {
      this.createError.set('');
      this.reviewing.set(true);
      return;
    }

    this.busy.set(true);
    this.createError.set('');
    try {
      const created = await this.openDispute.execute({
        reason: this.createReason(),
        target: { type: type as 'order' | 'session', id }
      });
      this.createReason.set('');
      this.targetKey.set('');
      this.reviewing.set(false);
      this.received.set(true);
      await this.select(created.id, 1);
    } catch (e) {
      this.createError.set(this.describe(e));
      this.busy.set(false);
    }
  }

  async send(event: Event): Promise<void> {
    event.preventDefault();
    const d = this.selected();
    if (!d || !this.messageBody().trim()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.postMessage.execute(d, this.messageBody(), this.isAdmin());
      await this.load(d.id);
    } catch (e) {
      this.error.set(this.describe(e));
      this.busy.set(false);
    }
  }

  async attach(files: readonly File[]): Promise<void> {
    const file = files[0];
    const d = this.selected();
    if (!file || !d) return;

    this.busy.set(true);
    this.error.set('');
    try {
      await this.uploadEvidence.execute(d, file);
      await this.load(d.id);
    } catch (e) {
      this.error.set(
        (e as Error)?.message === 'unacceptable-evidence'
          ? this.locale.format('dispute_file_refused', { hint: this.c().fileHint }, 'That file cannot be added. {hint}')
          : this.describe(e));
      this.busy.set(false);
    }
  }

  async download(evidenceId: string, fileName: string): Promise<void> {
    try {
      await this.openEvidence.execute(evidenceId, fileName);
    } catch (e) {
      this.error.set(this.describe(e));
    }
  }

  async beginReview(): Promise<void> {
    const d = this.selected();
    if (!d) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.startReview.execute(d);
      await this.load(d.id);
    } catch (e) {
      this.error.set(this.describe(e));
      this.busy.set(false);
    }
  }

  async resolve(event: Event): Promise<void> {
    event.preventDefault();
    const d = this.selected();
    if (!d || !this.rationale().trim()) return;

    // Minted once and kept: a retry after a lost response reuses the same key so
    // the money moves at most once.
    this.resolveKey ||= this.resolveDispute.mintKey(d);
    this.busy.set(true);
    this.error.set('');
    try {
      await this.resolveDispute.execute(d, this.resolution(), this.rationale(), this.resolveKey);
      this.rationale.set('');
      this.resolveKey = '';
      await this.load(d.id);
    } catch (e) {
      this.error.set(this.describe(e));
      this.busy.set(false);
    }
  }

  async select(id: string, page = this.page()): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { selectedId: id, page },
      queryParamsHandling: 'merge'
    });
    const known = this.items().find(d => d.id === id);
    if (known) this.selected.set(known);
    else await this.load(id, page);
    this.error.set('');
  }

  async goToPage(page: number): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page, selectedId: null },
      queryParamsHandling: 'merge'
    });
    await this.load('', page);
  }

  onResolutionChange(value: string): void {
    this.resolution.set(value as DisputeResolution);
  }

  // ---- labels ----
  private subjectLabel(d: Dispute): string {
    const kind = d.orderId ? this.c().order : this.c().session;
    // Operations staff work cases by reference. A student or teacher is never shown an id: it named their
    // case «طلب · 3bdd12ab», the inside of the database in place of a name (UX-06). The row already carries
    // the date the case was opened, and the case links to the purchase itself.
    return this.isAdmin() ? `${kind} · ${Dispute.subjectId(d).slice(0, 8)}` : kind;
  }

  /** Where the purchase a case is about can be opened, for its own student or teacher. */
  private purchaseLink(d: Dispute): { path: readonly string[]; label: string } | null {
    if (this.isAdmin()) return null;
    if (d.orderId) return { path: ['/orders', d.orderId], label: this.c().viewOrder };
    if (d.liveSessionBookingId) return { path: ['/live-sessions', d.liveSessionBookingId], label: this.c().viewSession };
    return null;
  }

  private statusLabel(d: Dispute): string {
    return this.c().statuses[['open', 'under-review', 'resolved'].indexOf(d.status)] ?? '';
  }

  /** UX-04: open waits on the parties (warning), review is Tafseel's (info), resolved is history (neutral). */
  private statusTone(d: Dispute): 'warn' | 'info' | 'neutral' {
    if (d.status === 'resolved') return 'neutral';
    if (d.status === 'under-review') return 'info';
    return 'warn';
  }

  /** The reviewer reads who wrote by role; a party reads "you", "the other person" or Tafseel's reviewer. */
  private senderLabel(senderId: string, d: Dispute): string {
    if (senderId === this.userId()) return this.c().you;
    if (this.isAdmin()) {
      if (senderId === d.studentId) return this.locale.t('dispute_sender_student', 'Student');
      if (senderId === d.teacherId) return this.locale.t('dispute_sender_teacher', 'Teacher');
      return this.locale.t('dispute_sender_reviewer', 'Tafseel reviewer');
    }
    if (senderId === d.studentId || senderId === d.teacherId) return this.c().other;
    return this.locale.t('dispute_sender_reviewer', 'Tafseel reviewer');
  }

  private eligibleLabel(p: EligiblePurchase): string {
    const ar = this.locale.lang() === 'ar';
    const title = ar ? (p.titleArabic || p.title) : (p.title || p.titleArabic);
    // Through the house formatter: Latin digits and the official riyal mark (UX-06).
    const money = this.fmt.money(p.amount, p.currency || 'SAR');
    const other = p.otherPartyName
      ? ` · ${this.c().with} ${ar ? p.otherPartyName : (p.otherPartyNameEnglish || p.otherPartyName)}`
      : '';
    return `${title} · ${money}${other}`;
  }

  private dateTime(value: string): string {
    if (!value) return '';
    return new Intl.DateTimeFormat(this.locale.lang() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', {
      dateStyle: 'medium', timeStyle: 'short'
    }).format(new Date(value));
  }

  private describe(_error: unknown): string {
    return this.locale.t('request_failed', 'Request failed.');
  }
}
