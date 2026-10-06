import { SkeletonComponent } from '@shared/components/skeleton.component';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { injectListContext, pageFromQuery } from '@shared/utils/list-context';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import {
  APPLICATION_STATUS, QueueFilter, QueueKind, QueueScope, QueueSort, Review, ReviewApplication
} from '../models/application-review';
import { LoadReviewQueue, ReviewQueue } from '../services/quality-review.use-cases';

const PAGE_SIZE = 20;

@Component({
  selector: 'tf-application-queue-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SkeletonComponent, FormsModule, RouterLink, WorkspaceShellComponent],
  templateUrl: './application-queue-page.component.html',
  styles: `
    .tf-queue-filters { align-items: end; margin-block: 18px; }
    .tf-queue-filters .tf-field { min-width: min(100%, 180px); }
    .tf-queue-pages { justify-content: center; margin-top: 16px; }
  `
})
export class ApplicationQueuePageComponent {
  private readonly load = inject(LoadReviewQueue);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  readonly Review = Review;
  readonly statuses = Object.values(APPLICATION_STATUS);

  readonly scope = signal<QueueScope>('Actionable');
  readonly kind = signal<QueueKind>('All');
  readonly status = signal<number | null>(null);
  readonly sort = signal<QueueSort>('OldestFirst');
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly queue = signal<ReviewQueue | null>(null);
  readonly items = computed(() => this.queue()?.page?.items ?? []);
  readonly pages = computed(() => Math.max(1, Math.ceil((this.queue()?.page?.totalCount ?? 0) / PAGE_SIZE)));
  private request = 0;
  private readonly context = injectListContext(params => {
    this.scope.set(params.get('scope') === 'All' ? 'All' : 'Actionable');
    this.kind.set(params.get('kind') === 'Initial' ? 'Initial' : params.get('kind') === 'Additional' ? 'Additional' : 'All');
    const status = params.get('status');
    this.status.set(status !== null && this.statuses.includes(Number(status) as never) ? Number(status) : null);
    this.sort.set(params.get('sort') === 'NewestFirst' ? 'NewestFirst' : 'OldestFirst');
    this.page.set(pageFromQuery(params.get('page')));
  }, () => { void this.fetchQueue(); });

  constructor() {
    inject(Title).setTitle(`${this.t('quality_queue_title', 'Teacher applications')} — Tafseel`);
    // A link stored before the queue had its own screen named the application in the query.
    const selectedId = this.route.snapshot.queryParamMap.get('selectedId');
    if (selectedId) void this.router.navigate(['/quality/applications', selectedId], { replaceUrl: true });
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  subject(item: ReviewApplication): string { return Review.subjectName(item, this.locale.isRtl()); }
  date(value: string): string { return value ? this.fmt.date(value, { dateStyle: 'medium' }) : '—'; }

  filter(): QueueFilter {
    return { scope: this.scope(), kind: this.kind(), status: this.status(), sort: this.sort(), page: this.page(), pageSize: PAGE_SIZE };
  }

  change(apply: () => void): void {
    apply();
    this.page.set(1);
    void this.reload();
  }

  go(page: number): void {
    if (page < 1 || page > this.pages() || page === this.page()) return;
    this.page.set(page);
    void this.reload();
  }

  async reload(): Promise<void> {
    this.context.commit(this.contextParams());
  }

  contextParams(focus: string | null = null): Record<string, string | number | null> {
    return { scope: this.scope() === 'Actionable' ? null : this.scope(), kind: this.kind() === 'All' ? null : this.kind(),
      status: this.status(), sort: this.sort() === 'OldestFirst' ? null : this.sort(), page: this.page() === 1 ? null : this.page(), focus };
  }

  private async fetchQueue(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    const queue = await this.load.execute(this.filter());
    if (request !== this.request) return;
    this.queue.set(queue);
    this.loading.set(false);
    this.context.restoreFocus('quality-row-');
  }
}
