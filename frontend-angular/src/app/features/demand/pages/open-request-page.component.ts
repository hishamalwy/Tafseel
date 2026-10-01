import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { LocaleService } from '@core/i18n/locale.service';
import { timeZoneLabel } from '@features/teacher-setup/models/availability';
import { FilePickerComponent, fileKindText, fileSizeText } from '@shared/components/file-picker.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import {
  Attachment, CatalogOption, Demand, DraftProblem, OPEN_REQUEST_FILE_LIMITS, OPEN_REQUEST_LIMITS, OpenRequestDraft, SavedOpenDraft
} from '../models/demand';
import {
  DraftInvalid, FileRefused, LoadOpenRequestForm, OpenRequestDrafts, OpenRequestForm, PublishOpenRequest
} from '../services/demand.use-cases';

const SAVE_DEBOUNCE_MS = 600;

/**
 * Publishing a request to the open marketplace (J4-01): qualified teachers send offers.
 *
 * Arriving from the landing page's "Upload your file" (`?start=upload`), the first thing on the screen is the
 * uploader: the file is scanned and kept in the student's own draft before any other question is asked (Product
 * Contract §7a). Everything typed afterwards is saved to the same draft, so a refresh, leaving and coming back,
 * or a refused publish never loses a file that was already accepted.
 */
@Component({
  selector: 'tf-open-request-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, WorkspaceShellComponent, FilePickerComponent],
  templateUrl: './open-request-page.component.html',
  styleUrl: '../../../shared/styles/workspace-detail.css'
})
export class OpenRequestPageComponent {
  private readonly load = inject(LoadOpenRequestForm);
  private readonly publish = inject(PublishOpenRequest);
  private readonly drafts = inject(OpenRequestDrafts);
  private readonly router = inject(Router);
  readonly locale = inject(LocaleService);
  readonly limits = OPEN_REQUEST_LIMITS;
  readonly fileLimits = OPEN_REQUEST_FILE_LIMITS;
  readonly fileAccept = OPEN_REQUEST_FILE_LIMITS.extensions.join(',');
  /**
   * The device's time zone, named in the reader's language. Printing the IANA identifier put an English
   * string ("Asia/Riyadh", "UTC") in the middle of an Arabic sentence (UX-06).
   */
  readonly zone = computed(() =>
    timeZoneLabel(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', this.locale.lang()));

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly form = signal<OpenRequestForm | null>(null);
  readonly draft = signal<OpenRequestDraft>(Demand.emptyOpenDraft());
  readonly saved = signal<SavedOpenDraft | null>(null);
  readonly attached = computed<readonly Attachment[]>(() => this.saved()?.attachments ?? []);
  /** 'upload' shows only the file step; 'details' the full form with the files already attached. */
  readonly step = signal<'upload' | 'details'>('details');
  readonly uploading = signal(false);
  readonly fileError = signal('');
  readonly attempted = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly problems = computed(() => this.attempted() ? Demand.openProblems(this.draft(), Date.now()) : {});

  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(Title).setTitle(`${this.t('open_request_title', 'Post an open request')} — Tafseel`);
    if (inject(ActivatedRoute).snapshot.queryParamMap.get('start') === 'upload') this.step.set('upload');
    void this.refresh();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  name(item: CatalogOption): string { return Demand.localName(item, this.locale.isRtl()); }
  size(file: Attachment): string { return fileSizeText(file.size); }
  kind(file: Attachment): string { return fileKindText(file.name); }

  readonly fileHint = computed(() => this.locale.format('open_upload_hint',
    { max: OPEN_REQUEST_FILE_LIMITS.maxBytes / 1_048_576, n: OPEN_REQUEST_FILE_LIMITS.maxFiles },
    'PDF, image, Word, PowerPoint or text · up to {max} MB each · up to {n} files'));

  problem(field: keyof OpenRequestDraft): string {
    const problem: DraftProblem | undefined = this.problems()[field];
    return problem ? this.locale.format(`demand_problem_${problem}`, { max: field === 'title' ? OPEN_REQUEST_LIMITS.title : OPEN_REQUEST_LIMITS.requirements }, problem) : '';
  }

  set(field: keyof OpenRequestDraft, value: unknown): void {
    this.draft.update(d => ({
      ...d,
      [field]: field === 'budgetMin' || field === 'budgetMax' ? (value === '' || value === null ? null : Number(value)) : String(value ?? '')
    }));
    this.scheduleSave();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const [form, saved] = await Promise.all([this.load.execute(), this.drafts.load()]);
      this.form.set(form);
      if (saved) {
        this.saved.set(saved);
        if (!Demand.isBlank(saved.fields)) this.draft.set(saved.fields);
      }
    }
    catch (error) { this.loadError.set(problemMessage(error, (k, f) => this.t(k, f)).text); }
    finally { this.loading.set(false); }
  }

  /** One file at a time, in the order chosen: each is checked, sent, scanned, then shown as attached. */
  async upload(chosen: File[]): Promise<void> {
    if (this.uploading()) return;
    this.uploading.set(true);
    this.fileError.set('');
    const refused: string[] = [];
    try {
      for (const file of chosen) {
        try {
          this.saved.set(await this.drafts.upload(file, this.attached().length));
        } catch (error) {
          refused.push(error instanceof FileRefused ? this.refusal(error) : this.uploadFailure(file, error));
        }
      }
    } finally {
      this.uploading.set(false);
      this.fileError.set(refused.join(' '));
    }
  }

  async remove(file: Attachment): Promise<void> {
    if (this.uploading()) return;
    this.uploading.set(true);
    this.fileError.set('');
    try { this.saved.set(await this.drafts.remove(file.id)); }
    catch (error) { this.fileError.set(problemMessage(error, (k, f) => this.t(k, f)).text); }
    finally { this.uploading.set(false); }
  }

  continueToDetails(): void {
    this.step.set('details');
  }

  async submit(): Promise<void> {
    if (this.busy() || this.uploading()) return;
    this.attempted.set(true);
    this.error.set('');
    if (Object.keys(Demand.openProblems(this.draft(), Date.now())).length) return;
    this.busy.set(true);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    try {
      const created = await this.publish.execute(this.draft(), this.saved()?.id ?? null);
      await this.router.navigate(['/requests', created.id]);
    } catch (error) {
      // The draft and its files stay exactly as they were: nothing is lost by a refused publish.
      if (!(error instanceof DraftInvalid)) this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.busy.set(false);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      if (this.busy()) return;
      this.drafts.save(this.draft())
        .then(saved => this.saved.set(saved))
        .catch(() => { /* A failed autosave is retried by the next change; publishing does not depend on it. */ });
    }, SAVE_DEBOUNCE_MS);
  }

  private refusal(error: FileRefused): string {
    const name = error.file.name;
    switch (error.reason) {
      case 'wrong-type':
        return this.locale.format('open_file_wrong_type', { name }, '{name} is not a file type we accept.');
      case 'too-large':
        return this.locale.format('open_file_too_large', { name, max: OPEN_REQUEST_FILE_LIMITS.maxBytes / 1_048_576 },
          '{name} is empty or larger than {max} MB.');
      case 'too-many':
        return this.locale.format('open_file_too_many', { n: OPEN_REQUEST_FILE_LIMITS.maxFiles }, 'You can attach up to {n} files.');
    }
  }

  private uploadFailure(file: File, error: unknown): string {
    const message = problemMessage(error, (k, f) => this.t(k, f)).text
      || this.t('open_upload_failed', 'The file could not be uploaded. Check your connection and try again.');
    return `${file.name}: ${message}`;
  }
}
