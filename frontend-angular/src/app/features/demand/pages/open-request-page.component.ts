import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { CatalogOption, Demand, DraftProblem, OPEN_REQUEST_LIMITS, OpenRequestDraft } from '../models/demand';
import { DraftInvalid, LoadOpenRequestForm, OpenRequestForm, PublishOpenRequest } from '../services/demand.use-cases';

/** Publishing a request to the open marketplace (J4-01): qualified teachers send offers. */
@Component({
  selector: 'tf-open-request-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, WorkspaceShellComponent],
  templateUrl: './open-request-page.component.html',
  styleUrl: '../../../shared/styles/workspace-detail.css'
})
export class OpenRequestPageComponent {
  private readonly load = inject(LoadOpenRequestForm);
  private readonly publish = inject(PublishOpenRequest);
  private readonly router = inject(Router);
  readonly locale = inject(LocaleService);
  readonly limits = OPEN_REQUEST_LIMITS;
  readonly zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly form = signal<OpenRequestForm | null>(null);
  readonly draft = signal<OpenRequestDraft>(Demand.emptyOpenDraft());
  readonly attempted = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly problems = computed(() => this.attempted() ? Demand.openProblems(this.draft(), Date.now()) : {});

  constructor() {
    inject(Title).setTitle(`${this.t('open_request_title', 'Post an open request')} — Tafseel`);
    void this.refresh();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  name(item: CatalogOption): string { return Demand.localName(item, this.locale.isRtl()); }

  problem(field: keyof OpenRequestDraft): string {
    const problem: DraftProblem | undefined = this.problems()[field];
    return problem ? this.locale.format(`demand_problem_${problem}`, { max: field === 'title' ? OPEN_REQUEST_LIMITS.title : OPEN_REQUEST_LIMITS.requirements }, problem) : '';
  }

  set(field: keyof OpenRequestDraft, value: unknown): void {
    this.draft.update(d => ({
      ...d,
      [field]: field === 'budgetMin' || field === 'budgetMax' ? (value === '' || value === null ? null : Number(value)) : String(value ?? '')
    }));
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try { this.form.set(await this.load.execute()); }
    catch (error) { this.loadError.set(problemMessage(error, (k, f) => this.t(k, f)).text); }
    finally { this.loading.set(false); }
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.attempted.set(true);
    this.error.set('');
    if (Object.keys(Demand.openProblems(this.draft(), Date.now())).length) return;
    this.busy.set(true);
    try {
      const created = await this.publish.execute(this.draft());
      await this.router.navigate(['/requests', created.id]);
    } catch (error) {
      if (!(error instanceof DraftInvalid)) this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.busy.set(false);
    }
  }
}
