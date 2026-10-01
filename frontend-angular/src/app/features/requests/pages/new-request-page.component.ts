import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { countText } from '@core/i18n/count-text';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { ToastService } from '@shared/services/toast.service';
import { ToastComponent } from '@shared/components/toast.component';
import { PriceComponent } from '@shared/components/price.component';
import { FilePickerComponent } from '@shared/components/file-picker.component';
import { WorkflowHeaderComponent } from '@shared/layouts/workflow-header.component';
import {
  DRAFT_VERSION, FileRejection, PROMPT_LABELS, REQUEST_FILE_LIMITS, RequestDraft, RequestableService, composeDescription,
  preferredDeliveryAt, promptsForService, todayInputValue
} from '../models/learning-request';
import { CreatedRequest } from '../services/request.ports';
import { SkipLinkComponent } from '@shared/layouts/skip-link.component';
import {
  AcceptFiles, AssistWithBrief, OpenRequestWizard, SaveRequestDraft,
  SubmitLearningRequest, WizardContext
} from '../services/request.use-cases';

const STEPS = 4;
const DRAFT_DEBOUNCE_MS = 450;

/**
 * The request wizard — ported from `Tafseel-Request.dc.html`.
 *
 * Four steps: what you need, the detail, timing and budget, then review. The
 * brief the teacher reads is assembled by `composeDescription`, so what the
 * student sees on the review step is exactly what gets sent.
 *
 * A draft is saved as they type and restored on return, which is why every field
 * is a signal and the save is debounced rather than fired per keystroke.
 */
@Component({
  selector: 'tf-new-request-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, WorkflowHeaderComponent, ToastComponent, PriceComponent, SkipLinkComponent, FilePickerComponent],
  templateUrl: './new-request-page.component.html',
  styleUrl: './new-request-page.component.css'
})
export class NewRequestPageComponent {
  private readonly openWizard = inject(OpenRequestWizard);
  private readonly submitRequest = inject(SubmitLearningRequest);
  private readonly saveDraft = inject(SaveRequestDraft);
  private readonly acceptFiles = inject(AcceptFiles);
  private readonly assist = inject(AssistWithBrief);
  private readonly store = inject(SignalSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly toasts = inject(ToastService);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);

  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly missingTeacher = signal(false);
  readonly context = signal<WizardContext | null>(null);
  readonly loadError = signal('');

  readonly step = signal(1);
  readonly serviceId = signal('');
  readonly requestTitle = signal('');
  readonly goal = signal('');
  readonly constraints = signal('');
  readonly topicLabel = signal('');
  readonly explanationStyle = signal('');
  readonly preferredLanguageId = signal('');
  readonly prompts = signal<Record<string, string>>({});
  readonly deliveryDate = signal('');
  readonly flexibleBudget = signal(true);
  readonly budget = signal('');
  readonly agreed = signal(false);
  readonly files = signal<readonly File[]>([]);

  readonly aiBusy = signal(false);
  readonly aiDraft = signal('');
  /**
   * Whether the server says the writing helper can actually run (UX-08). It starts false, so the button
   * is never shown and then taken away — and stays false if the capability cannot be established.
   */
  readonly aiAvailable = signal(false);
  readonly draftStatus = signal('');
  readonly created = signal<CreatedRequest | null>(null);
  readonly fileError = signal('');
  readonly failedFiles = signal<readonly File[]>([]);

  private teacherId = '';
  private draftTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    queueMicrotask(() =>
      this.title.setTitle(this.t('req_breadcrumb', 'New request') + ' — Tafseel'));
    // Asked once; the answer decides whether the helper exists on this page at all. Anything other than
    // a clear yes — including a failure to ask — leaves it hidden.
    void this.assist.isAvailable()
      .then(available => this.aiAvailable.set(available))
      .catch(() => this.aiAvailable.set(false));

    this.teacherId = (this.route.snapshot.queryParamMap.get('teacherId') ?? '').trim();
    if (!this.teacherId) {
      this.missingTeacher.set(true);
      this.loading.set(false);
    } else {
      void this.load();
    }

    // Persist as the brief changes, debounced so typing is not a write per key.
    effect(() => {
      const snapshot = this.draftSnapshot();
      // Once sent, the request is no longer a draft: a save still waiting would bring it back as the next
      // request's starting point (found in the Round 3 UAT: the second request opened at "Review" with the first).
      if (this.loading() || !this.teacherId || this.created() || this.submitting()) return;
      if (this.draftTimer) clearTimeout(this.draftTimer);
      this.draftTimer = setTimeout(() => {
        if (this.created() || this.submitting()) return;
        this.saveDraft.execute(this.studentId(), this.teacherId, snapshot);
        this.draftStatus.set(this.t('req_draft_saved', 'Draft saved'));
      }, DRAFT_DEBOUNCE_MS);
    });
  }

  t(key: string, fallback = ''): string {
    return this.locale.t(key, fallback);
  }

  private studentId(): string {
    return this.store.value()?.userId ?? '';
  }

  // ---- derived ----
  readonly services = computed(() => this.context()?.services ?? []);
  readonly service = computed<RequestableService | null>(() =>
    this.services().find(s => s.id === this.serviceId()) ?? this.services()[0] ?? null);

  readonly promptKeys = computed(() =>
    promptsForService(this.service()?.serviceCatalogCode));

  /**
   * The question beside a brief field, in the reader's language.
   *
   * These used to fall back to the prompt's own key, so a student saw `whatYouTried` — an English
   * identifier — as the label of an Arabic form (UX-06). `PROMPT_LABELS` carries English wording for every
   * key the wizard can ask, and a spec holds the locale tables to the same list, so the key itself is no
   * longer something a person can be shown.
   */
  promptLabel(key: string): string {
    return this.t('req_prompt_' + key, PROMPT_LABELS[key] ?? '');
  }

  promptValue(key: string): string {
    return this.prompts()[key] || '';
  }

  readonly serviceName = computed(() => {
    const service = this.service();
    if (!service) return '';
    return this.locale.lang() === 'ar'
      ? (service.serviceNameArabic || service.serviceNameEnglish)
      : (service.serviceNameEnglish || service.serviceNameArabic);
  });

  /** The teacher's name in the reader's language, as the profile they came from showed it. */
  readonly teacherName = computed(() => {
    const ctx = this.context();
    if (!ctx) return '';
    return this.locale.lang() === 'ar'
      ? (ctx.teacherName || ctx.teacherNameEnglish || '')
      : (ctx.teacherNameEnglish || ctx.teacherName || '');
  });

  /**
   * Why "Next" cannot be pressed yet. A disabled button on its own says nothing to someone who skipped the
   * labels; this names the one thing still missing on the step they are on.
   */
  readonly missingHint = computed(() => {
    if (this.canAdvance()) return '';
    switch (this.step()) {
      case 1: return this.t('req_missing_title', 'Add a short title to continue.');
      case 2: return this.t('req_missing_goal', 'Write what you want to achieve to continue.');
      case 3: return this.deliveryAt() === null
        ? this.t('req_missing_date', 'Choose the day you need it by to continue.')
        : this.t('req_missing_budget', 'Enter your budget, or tick “Flexible”, to continue.');
      default: return this.t('req_missing_terms', 'Tick the box to agree to the Terms, then send your request.');
    }
  });

  days(n: number): string {
    return countText((k, f) => this.locale.t(k, f), this.locale.lang(), 'count_days', n, '1 day', '{n} days');
  }

  readonly stepLabel = computed(() =>
    `${this.t('req_step', 'Step')} ${this.step()} / ${STEPS}`);

  /** What the teacher will read; shown verbatim on the review step. */
  readonly description = computed(() => composeDescription({
    goal: this.goal(),
    prompts: this.prompts(),
    promptOrder: this.promptKeys(),
    topicLabel: this.topicLabel(),
    explanationStyle: this.explanationStyle(),
    preferredTeachingLanguageLabel: this.preferredLanguageId(),
    constraints: this.constraints()
  }, {
    goal: this.t('req_label_goal', 'Goal'),
    serviceDetails: this.t('req_label_details', 'Service details'),
    topic: this.t('req_label_topic', 'Topic'),
    explanationPreference: this.t('req_label_style', 'Explanation preference'),
    preferredTeachingLanguage: this.t('req_label_language', 'Preferred teaching language'),
    additionalNotes: this.t('req_label_notes', 'Additional notes'),
    prompt: Object.fromEntries(
      this.promptKeys().map(key => [key, this.promptLabel(key)])),
    style: {
      step_by_step: this.t('req_style_step_by_step', 'Step by step'),
      concise: this.t('req_style_concise', 'Concise'),
      visual: this.t('req_style_visual', 'Visual'),
      worked_examples: this.t('req_style_worked_examples', 'Worked examples')
    }
  }));

  readonly canAdvance = computed(() => {
    switch (this.step()) {
      case 1: return this.service() !== null && this.requestTitle().trim().length > 0;
      case 2: return this.goal().trim().length > 0;
      case 3: return this.deliveryAt() !== null && (this.flexibleBudget() || this.service()?.price != null || Number(this.budget()) > 0);
      default: return this.agreed();
    }
  });

  /** The chosen day as the instant the API needs, or null while it is missing or past. */
  readonly deliveryAt = computed(() => preferredDeliveryAt(this.deliveryDate()));
  readonly minDeliveryDate = todayInputValue();

  readonly canSubmit = computed(() =>
    !this.submitting() && this.agreed()
    && this.deliveryAt() !== null
    && (this.flexibleBudget() || this.service()?.price != null || Number(this.budget()) > 0)
    && this.service() !== null
    && this.requestTitle().trim().length > 0
    && this.goal().trim().length > 0);

  // ---- loading ----
  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const context = await this.openWizard.execute(this.teacherId, this.studentId());
      this.context.set(context);

      if (context.services.length) this.serviceId.set(context.services[0]!.id);
      if (context.preferences) {
        this.explanationStyle.set(context.preferences.explanationStyle ?? '');
        this.preferredLanguageId.set(context.preferences.preferredTeachingLanguageId ?? '');
      }
      if (context.draft) this.restore(context.draft);
    } catch {
      this.loadError.set(this.t('req_load_failed', 'Could not open the request form.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Files cannot be restored, only their names, so the student is told. */
  private restore(draft: RequestDraft): void {
    this.serviceId.set(draft.serviceId || this.serviceId());
    this.step.set(Math.min(Math.max(draft.step, 1), STEPS));
    this.requestTitle.set(draft.title);
    this.goal.set(draft.goal);
    this.constraints.set(draft.constraints);
    this.topicLabel.set(draft.topicLabel);
    this.explanationStyle.set(draft.explanationStyle);
    this.preferredLanguageId.set(draft.preferredTeachingLanguageId);
    this.prompts.set({ ...draft.prompts });
    this.deliveryDate.set(draft.deliveryDate);
    this.flexibleBudget.set(draft.flexibleBudget);
    this.budget.set(draft.budget);
    this.agreed.set(draft.agreed);

    if (draft.fileNames.length) {
      this.toasts.show(this.t('req_files_not_restored', 'Re-attach your files before submitting.'));
    }
  }

  private draftSnapshot(): RequestDraft {
    return {
      wizardVersion: DRAFT_VERSION,
      serviceId: this.serviceId(),
      step: this.step(),
      title: this.requestTitle(),
      goal: this.goal(),
      constraints: this.constraints(),
      topicLabel: this.topicLabel(),
      explanationStyle: this.explanationStyle(),
      preferredTeachingLanguageId: this.preferredLanguageId(),
      prompts: this.prompts(),
      deliveryDate: this.deliveryDate(),
      flexibleBudget: this.flexibleBudget(),
      budget: this.budget(),
      fileNames: this.files().map(f => f.name),
      agreed: this.agreed()
    };
  }

  // ---- interaction ----
  setPrompt(key: string, value: string): void {
    this.prompts.update(current => ({ ...current, [key]: value }));
  }

  next(): void {
    if (this.canAdvance() && this.step() < STEPS) this.step.set(this.step() + 1);
  }

  back(): void {
    if (this.step() > 1) this.step.set(this.step() - 1);
  }

  readonly fileLimits = REQUEST_FILE_LIMITS;
  readonly fileAccept = ['.pdf', '.jpg', '.jpeg', '.png', '.txt', '.docx', '.pptx', ...REQUEST_FILE_LIMITS.acceptedTypes].join(',');

  addFiles(incoming: readonly File[]): void {
    const { accepted, rejected } = this.acceptFiles.execute(incoming, this.files());
    if (accepted.length) this.files.update(current => [...current, ...accepted]);
    // UX-21: a refused file is explained under the picker and stays there, not in a toast that disappears.
    this.fileError.set(rejected.map(({ file, reason }) => this.rejection(file.name, reason)).join(' '));
  }

  /** Why a file was not added, in words: the reason codes are not copy, and used to reach the toast as-is. */
  private rejection(name: string, reason: FileRejection): string {
    switch (reason) {
      case 'too-large':
        return this.locale.format('req_file_rejected_large', { name, max: REQUEST_FILE_LIMITS.maxBytes / 1_048_576 }, '{name} is larger than {max} MB.');
      case 'wrong-type':
        return this.locale.format('req_file_type_invalid', { name }, '{name} is not an allowed file type.');
      case 'too-many':
        return this.locale.format('req_file_limit', { n: REQUEST_FILE_LIMITS.maxFiles }, 'You can attach up to {n} files.');
    }
  }

  removeFile(index: number): void {
    this.files.update(current => current.filter((_, i) => i !== index));
    this.fileError.set('');
  }

  async askAssistant(): Promise<void> {
    const seed = [this.requestTitle(), this.goal()].filter(Boolean).join(' — ');
    if (!seed.trim()) {
      this.toasts.show(this.t('req_ai_needs_seed', 'Add a title or a goal first.'));
      return;
    }
    if (seed.trim().length < 3) {
      this.toasts.show(this.t('req_ai_needs_seed', 'Add a title or a goal first.'));
      return;
    }
    this.aiBusy.set(true);
    try {
      const answer = await this.assist.execute(seed);
      if (answer.suggestion) this.aiDraft.set(answer.suggestion);
      else this.toasts.show(answer.message || this.t('req_ai_failed', 'The assistant is unavailable right now.'));
    } catch {
      this.toasts.show(this.t('req_ai_failed', 'The assistant is unavailable right now.'));
    } finally {
      this.aiBusy.set(false);
    }
  }

  useAiDraft(): void {
    if (this.aiDraft()) this.goal.set(this.aiDraft());
    this.aiDraft.set('');
  }

  discardAiDraft(): void {
    this.aiDraft.set('');
  }

  async submit(): Promise<void> {
    const service = this.service();
    const deliveryAt = this.deliveryAt();
    if (!service || !deliveryAt || !this.canSubmit()) return;

    this.submitting.set(true);
    if (this.draftTimer) clearTimeout(this.draftTimer);
    try {
      const outcome = await this.submitRequest.execute({
        teacherId: this.teacherId,
        teacherServiceId: service.id,
        title: this.requestTitle().trim(),
        description: this.description(),
        preferredDeliveryAt: deliveryAt,
        budget: this.flexibleBudget() || service.price != null ? null : Number(this.budget()) || null
      }, this.files(), this.studentId());

      this.created.set(outcome.request);
      this.failedFiles.set(outcome.failedFiles);
      if (outcome.failedFiles.length) {
        this.toasts.show(this.t('req_some_files_failed', 'Your request was sent, but some files did not upload.'));
      }
    } catch {
      this.toasts.show(this.t('req_failed', 'Could not send the request.'));
    } finally {
      this.submitting.set(false);
    }
  }

  async retryFiles(): Promise<void> {
    const created = this.created();
    if (!created || !this.failedFiles().length) return;
    this.submitting.set(true);
    try {
      this.failedFiles.set(await this.submitRequest.retryAttachments(created, this.failedFiles()));
      if (!this.failedFiles().length) {
        this.toasts.show(this.t('req_files_uploaded', 'All files uploaded.'));
      }
    } finally {
      this.submitting.set(false);
    }
  }

  async goToRequests(): Promise<void> {
    const created = this.created();
    await this.router.navigate(created ? ['/requests', created.id] : ['/student/requests']);
  }
}
