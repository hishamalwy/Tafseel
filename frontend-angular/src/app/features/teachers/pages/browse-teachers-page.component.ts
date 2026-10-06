import { TeacherStylesComponent } from '@shared/components/lazy-feature-styles.component';
import { TeacherTransitionDirective } from '@shared/directives/teacher-transition.directive';
import { UiStateComponent } from '@shared/components/ui-state.component';
import { SkeletonComponent } from '@shared/components/skeleton.component';
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { countText } from '@core/i18n/count-text';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { ToastService } from '@shared/services/toast.service';
import { ToastComponent } from '@shared/components/toast.component';
import { PriceComponent } from '@shared/components/price.component';
import { PublicHeaderComponent } from '@shared/layouts/public-header.component';
import { SkipLinkComponent } from '@shared/layouts/skip-link.component';
import { Teacher, TeacherService } from '../models/teacher';
import { CatalogItem, Catalogs, TeacherQuery } from '../services/teacher.ports';
import {
  CompareTeachers, LoadCatalogs, SearchTeachers, TEACHERS_PAGE_SIZE, ToggleFavouriteTeacher
} from '../services/teacher.use-cases';
import { FAVOURITES_GATEWAY } from '../services/teacher.ports';
import { firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { containModalFocus } from '@shared/utils/modal-focus';

/**
 * Browse teachers — ported from `Tafseel-Browse-Teachers.dc.html`.
 *
 * Every filter lives in the URL. The legacy page kept them in component state
 * and pushed a query string with `history.replaceState`, which meant a filtered
 * list could not be shared, bookmarked, or reached with the back button. Reading
 * them from the route instead makes the URL the single source of truth, and the
 * back button work for free.
 */
@Component({
  selector: 'tf-browse-teachers-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TeacherStylesComponent, TeacherTransitionDirective, UiStateComponent, SkeletonComponent, FormsModule, RouterLink, PublicHeaderComponent, SkipLinkComponent, ToastComponent, PriceComponent],
  templateUrl: './browse-teachers-page.component.html',
  styleUrl: './browse-teachers-page.component.css'
})
export class BrowseTeachersPageComponent {
  private readonly search = inject(SearchTeachers);
  private readonly loadCatalogs = inject(LoadCatalogs);
  private readonly compareTeachers = inject(CompareTeachers);
  private readonly toggleFavourite = inject(ToggleFavouriteTeacher);
  private readonly favourites = inject(FAVOURITES_GATEWAY);
  private readonly store = inject(SignalSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly toasts = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly compareDialog = viewChild<ElementRef<HTMLElement>>('compareDialog');
  private releaseComparisonFocus: (() => void) | undefined;
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly teachers = signal<readonly Teacher[]>([]);
  readonly page = signal(1);
  readonly totalCount = signal(0);
  readonly totalPages = signal(1);

  readonly catalogs = signal<Catalogs>({
    subjects: [], topics: [], services: [], educationLevels: [], languages: []
  });

  readonly favouriteIds = signal<readonly string[]>([]);
  readonly favouriteBusy = signal('');
  readonly compareIds = signal<readonly string[]>([]);
  readonly compareLimit = CompareTeachers.MAX;
  readonly comparison = signal<readonly Teacher[] | null>(null);
  readonly filtersOpen = signal(false);
  private filterTrigger: HTMLElement | null = null;

  // Draft filter state; committed to the URL on apply.
  readonly draft = signal<TeacherQuery>({});

  readonly isStudent = computed(() => this.store.roles().includes('Student'));

  constructor() {
    this.destroyRef.onDestroy(() => this.releaseComparisonFocus?.());
    queueMicrotask(() =>
      this.title.setTitle(this.t('browse_title', 'Find your teacher') + ' — Tafseel'));

    void this.init();
  }

  t(key: string, fallback = ''): string {
    return this.locale.t(key, fallback);
  }

  private deliveryLabel(service: TeacherService): string {
    const wording = Teacher.deliveryWording(service);
    switch (wording.kind) {
      // Search results do not carry the allowed lengths; say what the service is rather than nothing.
      case 'duration': return wording.minutes.length
        ? this.locale.format('tp_session_minutes', { minutes: wording.minutes.join(' / ') }, '{minutes} min session')
        : this.t('browse_live_video_call', 'One-to-one video call');
      case 'hours': return countText((k, f) => this.locale.t(k, f), this.locale.lang(), 'count_hours', wording.value, '1 hour', '{n} hours');
      case 'days': return countText((k, f) => this.locale.t(k, f), this.locale.lang(), 'count_days', wording.value, '1 day', '{n} days');
      default: return '';
    }
  }

  // ---- derived ----
  readonly query = signal<TeacherQuery>(this.fromUrl());
  private loadSequence = 0;

  readonly cards = computed(() => this.teachers().map(teacher => {
    const name = this.fmt.userName(teacher);
    const from = Teacher.fromPrice(teacher);
    const ar = this.locale.lang() === 'ar';
    // The card's strip and facts name the service the price belongs to, so the
    // reader knows what the amount buys before opening the profile.
    // Browse sends no services, only the subject names and a starting price, so
    // the strip names the subject there and the service when one is known.
    const service = teacher.services.find(x => x.price === from?.amount) ?? teacher.services[0];
    const serviceName = service
      ? (ar ? (service.serviceNameArabic || service.serviceNameEnglish)
            : (service.serviceNameEnglish || service.serviceNameArabic))
      : '';
    return {
      id: teacher.id,
      name,
      serviceName,
      primaryService: service ?? null,
      isLive: service ? Teacher.isLiveService(service) : false,
      subject: teacher.subjects[0] ?? '',
      subjectsLabel: teacher.subjects.join(ar ? '، ' : ', '),
      responseTimeMinutes: teacher.responseTimeMinutes,
      country: teacher.country,
      languagesLabel: teacher.languages.join(ar ? '، ' : ', '),
      deliveryDays: service?.deliveryDays ?? null,
      // Same words as the profile: a live session has a length, not a delivery ("Delivery 1 days").
      deliveryLabel: service ? this.deliveryLabel(service) : '',
      completedOrders: teacher.completedOrders,
      avatar: this.fmt.avatarUrl(teacher.id, teacher.hasAvatar, null, 'teacher'),
      headline: this.locale.lang() === 'ar'
        ? (teacher.headline || teacher.headlineEnglish)
        : (teacher.headlineEnglish || teacher.headline),
      rating: teacher.rating,
      ratingLabel: teacher.rating
        ? this.fmt.number(teacher.rating, { maximumFractionDigits: 1 })
        : this.t('tp_no_reviews', 'No reviews yet'),
      reviewCount: teacher.reviewCount,
      fromAmount: from?.amount ?? null,
      fromCurrency: from?.currency ?? 'SAR',
      isQualified: Teacher.hasBadge(teacher, 'qualified_on_tafseel'),
      isFavourite: this.favouriteIds().includes(teacher.id),
      isCompared: this.compareIds().includes(teacher.id)
    };
  }));

  readonly resultsLabel = computed(() => {
    const total = this.totalCount();
    return `${this.fmt.number(total)} ${this.t('browse_results', 'teachers match your filters')}`;
  });

  /** The count on the "more filters" button, so it reads as active at a glance. */
  readonly activeFilterCount = computed(() => {
    const q = this.query();
    return [q.educationLevelId, q.maxPrice, q.minRating, q.verifiedOnly, q.topicId,
            q.availableOn, q.languageIds?.length ? true : undefined]
      .filter(value => value !== undefined && value !== null && value !== '').length;
  });

  readonly canGoBack = computed(() => !this.loading() && this.page() > 1);
  readonly canGoForward = computed(() => !this.loading() && this.page() < this.totalPages());
  readonly compareFull = computed(() => this.compareIds().length >= CompareTeachers.MAX);

  catalogLabel(item: CatalogItem): string {
    return this.locale.lang() === 'ar'
      ? (item.nameArabic || item.nameEnglish)
      : (item.nameEnglish || item.nameArabic);
  }

  // ---- loading ----
  private async init(): Promise<void> {
    // Catalogs and the first page are independent; neither should wait.
    void this.loadCatalogs.execute().then(catalogs => this.catalogs.set(catalogs));
    void this.loadFavourites();
    // URL changes are the source of truth, including the first load and Back.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const query = this.fromUrl();
      this.query.set(query);
      this.draft.set(query);
      void this.load();
    });
  }

  async load(): Promise<void> {
    const sequence = ++this.loadSequence;
    this.loading.set(true);
    this.error.set(false);
    try {
      const result = await this.search.execute(this.query());
      if (sequence !== this.loadSequence) return;
      this.teachers.set(result.items);
      this.page.set(result.page);
      this.totalCount.set(result.totalCount);
      this.totalPages.set(result.totalPages);
    } catch {
      if (sequence !== this.loadSequence) return;
      this.teachers.set([]);
      this.error.set(true);
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }

  private async loadFavourites(): Promise<void> {
    if (!this.isStudent()) return;
    try {
      this.favouriteIds.set(await firstValueFrom(this.favourites.mine()));
    } catch {
      this.favouriteIds.set([]);
    }
  }

  // ---- filters ----
  toggleFilters(event: Event): void {
    if (this.filtersOpen()) { this.closeFilters(); return; }
    this.filterTrigger = event.currentTarget as HTMLElement;
    this.filtersOpen.set(true);
    afterNextRender(() => this.document.getElementById('browse-filter-close')?.focus(), { injector: this.injector });
  }

  closeFilters(): void {
    if (!this.filtersOpen()) return;
    this.filtersOpen.set(false);
    this.filterTrigger?.focus();
  }

  patchDraft(patch: Partial<TeacherQuery>): void {
    this.draft.update(current => ({ ...current, ...patch }));
  }

  /** Applying resets to page 1: page 7 of the old filter means nothing here. */
  applyFilters(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.toUrl({ ...this.draft(), page: 1 })
    });
    this.closeFilters();
  }

  clearFilters(): void {
    this.draft.set({});
    this.closeFilters();
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  goToPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.toUrl({ ...this.query(), page }),
      queryParamsHandling: null
    });
  }

  // ---- favourites and comparison ----
  async favourite(teacherId: string): Promise<void> {
    if (!this.isStudent() || this.favouriteBusy()) return;
    const wasFavourite = this.favouriteIds().includes(teacherId);

    this.favouriteBusy.set(teacherId);
    try {
      const now = await this.toggleFavourite.execute(teacherId, wasFavourite);
      this.favouriteIds.update(ids =>
        now ? [...ids, teacherId] : ids.filter(id => id !== teacherId));
    } catch {
      this.toasts.show(this.t('tp_favourite_failed', 'Could not update.'));
    } finally {
      this.favouriteBusy.set('');
    }
  }

  toggleCompare(teacherId: string): void {
    const current = this.compareIds();
    if (current.includes(teacherId)) {
      this.compareIds.set(current.filter(id => id !== teacherId));
      return;
    }
    if (current.length >= CompareTeachers.MAX) {
      this.toasts.show(this.t('browse_compare_full', 'You can compare up to three teachers.'));
      return;
    }
    this.compareIds.set([...current, teacherId]);
  }

  async openComparison(): Promise<void> {
    if (this.compareIds().length < 2) {
      this.toasts.show(this.t('browse_compare_min', 'Pick at least two teachers to compare.'));
      return;
    }
    try {
      this.comparison.set(await this.compareTeachers.execute(this.compareIds()));
      afterNextRender(() => {
        if (this.comparison() && this.compareDialog())
          this.releaseComparisonFocus = containModalFocus(this.compareDialog()!.nativeElement, this.document, () => this.closeComparison());
      }, { injector: this.injector });
    } catch {
      this.toasts.show(this.t('browse_compare_failed', 'Could not compare.'));
    }
  }

  closeComparison(): void {
    this.releaseComparisonFocus?.();
    this.releaseComparisonFocus = undefined;
    this.comparison.set(null);
  }

  // ---- URL <-> query ----
  private fromUrl(): TeacherQuery {
    const q = this.route.snapshot.queryParamMap;
    const num = (key: string) => {
      const raw = q.get(key);
      const value = Number(raw);
      return raw !== null && Number.isFinite(value) ? value : undefined;
    };
    return {
      q: q.get('q') ?? undefined,
      subjectId: q.get('subjectId') ?? undefined,
      topicId: q.get('topicId') ?? undefined,
      serviceId: q.get('serviceId') ?? undefined,
      educationLevelId: q.get('educationLevelId') ?? undefined,
      availableOn: q.get('availableOn') ?? undefined,
      minRating: num('minRating'),
      maxPrice: num('maxPrice'),
      languageIds: q.getAll('languageIds'),
      verifiedOnly: q.get('verifiedOnly') === 'true' ? true : undefined,
      sort: q.get('sort') ?? undefined,
      page: num('page') ?? 1,
      pageSize: TEACHERS_PAGE_SIZE
    };
  }

  /** Only non-empty values reach the URL, so a cleared filter leaves no trace. */
  private toUrl(query: TeacherQuery): Record<string, string | string[]> {
    const params: Record<string, string | string[]> = {};
    const put = (key: string, value: unknown) => {
      if (value === undefined || value === null || value === '' || value === false) return;
      params[key] = String(value);
    };
    put('q', query.q);
    put('subjectId', query.subjectId);
    put('topicId', query.topicId);
    put('serviceId', query.serviceId);
    put('educationLevelId', query.educationLevelId);
    put('availableOn', query.availableOn);
    put('minRating', query.minRating);
    put('maxPrice', query.maxPrice);
    put('verifiedOnly', query.verifiedOnly);
    put('sort', query.sort);
    if (query.page && query.page > 1) params['page'] = String(query.page);
    if (query.languageIds?.length) params['languageIds'] = [...query.languageIds];
    return params;
  }
}
