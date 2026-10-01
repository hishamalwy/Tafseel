import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { map } from 'rxjs';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { Dashboard } from '@features/dashboards/models/dashboard';
import { CardFormat, DashboardCardView, presentCard } from '@features/dashboards/models/dashboard-card';
import { DashboardGateway } from '@features/dashboards/services/dashboard.gateway';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { CHIPS, Chip, Row, chipFrom, filterItems } from '../models/work-item';

/** The two lists this screen serves; a student sees their own items, a teacher the ones assigned to them. */
const SOURCES = {
  student: ['/learning-requests/mine?page=1&pageSize=50', '/orders/mine?page=1&pageSize=50', '/live-sessions/mine?page=1&pageSize=50'],
  teacher: ['/learning-requests/assigned?page=1&pageSize=50', '/orders/assigned?page=1&pageSize=50', '/live-sessions/mine?page=1&pageSize=50']
} as const;

/**
 * "My requests & orders" for a student and "Work" for a teacher (UX-03) — the same screen, because it
 * answers the same question: everything I have going on, in one place.
 *
 * It replaces three primary destinations that each showed one table, and the duplicates between them
 * (an order appeared under My learning, Payments and Overview). The chips are about what an item needs,
 * not which table it came from, and every card is the `UX-04` product card that opens the item's own screen.
 */
@Component({
  selector: 'tf-work-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, WorkspaceShellComponent],
  templateUrl: './work-list-page.component.html',
  styles: `
    .tf-work { display: grid; gap: 16px; max-width: 860px; }
    .tf-work h1 { margin: 0; font-size: var(--type-page-title-size); line-height: var(--type-page-title-line); letter-spacing: var(--type-page-title-tracking); font-weight: var(--weight-heavy); }
    /* The filter is one segmented control, not a row of pills; the list is one surface with a row per item. */
    .tf-work-chips { display: flex; gap: 2px; justify-self: start; max-inline-size: 100%; overflow-x: auto; padding: 3px;
      border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface-2); scrollbar-width: none; }
    .tf-work-chips::-webkit-scrollbar { display: none; }
    .tf-work-chip { flex: 0 0 auto; min-height: 40px; padding: 6px 16px; border: 0; border-radius: calc(var(--r-md) - 3px);
      background: transparent; color: var(--text-2); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap;
      transition: background-color var(--motion-fast) ease, color var(--motion-fast) ease; }
    .tf-work-chip:hover { color: var(--text); }
    .tf-work-chip[aria-pressed='true'] { background: var(--surface); color: var(--text); font-weight: 700;
      box-shadow: 0 1px 2px color-mix(in oklab, var(--text) 10%, transparent), 0 0 0 1px var(--border); }
    .tf-work-list { display: grid; gap: 0; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); overflow: hidden; }
    .tf-work-card { display: grid; gap: 6px; padding: 16px 20px; border: 0; border-radius: 0; background: transparent; border-block-start: 1px solid var(--border);
      transition: background-color var(--motion-fast) ease; }
    .tf-work-card:first-of-type { border-block-start: 0; }
    .tf-work-list:not([data-state]) .tf-work-card:hover { background: color-mix(in oklab, var(--surface-2) 60%, transparent); }
    @media (prefers-reduced-motion: reduce) { .tf-work-chip, .tf-work-card { transition: none; } }
    .tf-work-card h2 { margin: 0; font-size: 16px; font-weight: 700; line-height: 1.4; }
    .tf-work-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .tf-work-card p { margin: 0; font-size: 13px; color: var(--text-2); }
    .tf-work-card dl { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0; font-size: 13px; }
    .tf-work-card dl div { display: flex; gap: 6px; }
    .tf-work-card dt { color: var(--text-2); }
    .tf-work-card dd { margin: 0; font-variant-numeric: tabular-nums; }
    .tf-work-open { justify-self: start; min-height: 44px; display: inline-flex; align-items: center;
      font-size: 13px; font-weight: 700; }
    .tf-work-empty { margin: 0; padding: 20px 0; color: var(--text-2); }
    .tf-work-empty a { font-weight: 700; }
  `
})
export class WorkListPageComponent {
  private readonly gateway = inject(DashboardGateway);
  private readonly session = inject(SESSION_STORE);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);

  readonly viewer = this.route.snapshot.data['viewer'] as 'student' | 'teacher';
  readonly role = this.viewer === 'student' ? 'Student' as const : 'Teacher' as const;
  readonly section = this.viewer === 'student' ? 'requests' : 'work';

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly partial = signal(false);
  private readonly rows = signal<readonly Row[]>([]);
  private readonly now = signal(Date.now());

  /** The chip in the address, so a link can open "Needs action" directly (`?view=action`). */
  readonly chip = toSignal(this.route.queryParamMap.pipe(map(params => chipFrom(params.get('view')))),
    { initialValue: chipFrom(this.route.snapshot.queryParamMap.get('view')) });
  readonly chips = CHIPS;

  readonly items = computed(() => filterItems(this.rows(), this.chip(), this.viewer, this.now())
    .map(row => ({
      row,
      card: presentCard(row, {
        fmt: this.format(), viewer: this.viewer, viewerId: this.session.current()?.userId ?? '', now: this.now()
      }),
      link: Dashboard.detailLink(row)
    })));

  constructor() {
    inject(Title).setTitle(`${this.title()} — Tafseel`);
    void this.load();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }

  title(): string {
    return this.viewer === 'student'
      ? this.t('work_student_title', 'My requests & orders')
      : this.t('work_teacher_title', 'Work');
  }

  chipLabel(chip: Chip): string {
    const copy: Record<Chip, [string, string]> = {
      all: ['work_all', 'All'], action: ['work_action', 'Needs action'],
      active: ['work_active', 'In progress'], finished: ['work_finished', 'Finished']
    };
    return this.t(copy[chip][0], copy[chip][1]);
  }

  emptyText(): string {
    const copy: Record<Chip, [string, string]> = {
      all: ['work_empty_all', 'Nothing here yet.'], action: ['work_empty_action', 'Nothing needs action right now.'],
      active: ['work_empty_active', 'Nothing is in progress.'], finished: ['work_empty_finished', 'Nothing has finished yet.']
    };
    return this.t(copy[this.chip()][0], copy[this.chip()][1]);
  }

  /** The way to start something, from the role's own home. */
  startLink(): { path: string; label: string } {
    return this.viewer === 'student'
      ? { path: '/requests/new', label: this.t('work_student_start', 'Post a request') }
      : { path: '/teacher/opportunities', label: this.t('work_teacher_start', 'Open requests') };
  }

  choose(chip: Chip): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: chip === 'all' ? { view: null } : { view: chip },
      queryParamsHandling: 'merge'
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const results = await this.gateway.load(SOURCES[this.viewer]);
      const rows = results.flatMap(result => result.error ? [] : Dashboard.rows(result.payload)
        .map(row => ({ ...row, _source: result.source })));
      const failed = results.filter(result => !!result.error).length;
      // Every source failing is a failure; one failing is said out loud rather than shown as "nothing".
      this.error.set(failed === results.length);
      this.partial.set(failed > 0 && failed < results.length);
      this.rows.set(rows);
      this.now.set(Date.now());
    } catch {
      this.error.set(true);
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private format(): CardFormat {
    return {
      lang: this.locale.lang(),
      t: (key, fallback) => this.t(key, fallback),
      format: (key, values, fallback) => this.locale.format(key, values, fallback),
      money: (value, currency) => this.fmt.money(value, typeof currency === 'string' ? currency : undefined),
      date: value => (typeof value === 'string' || typeof value === 'number' ? this.fmt.date(value) : ''),
      relative: value => (typeof value === 'string' || typeof value === 'number' ? this.fmt.relative(value) : '')
    };
  }

  view(item: { card: DashboardCardView | null }): DashboardCardView | null { return item.card; }
}
