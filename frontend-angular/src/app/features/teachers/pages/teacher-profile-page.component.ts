import { TeacherStylesComponent } from '@shared/components/lazy-feature-styles.component';
import { TeacherTransition } from '@shared/directives/teacher-transition.directive';
import { SkeletonComponent } from '@shared/components/skeleton.component';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import {
  LoadTeacherProfile, TeacherProfileView, ToggleFavouriteTeacher
} from '../services/teacher.use-cases';

/**
 * A teacher's public profile — ported from `Tafseel-Teacher-Profile.dc.html`.
 *
 * The teacher id moved from `?id=` / `?teacherId=` into the path, so each
 * profile has one canonical, linkable, indexable URL.
 */
@Component({
  selector: 'tf-teacher-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TeacherStylesComponent, SkeletonComponent, RouterLink, PublicHeaderComponent, SkipLinkComponent, ToastComponent, PriceComponent],
  templateUrl: './teacher-profile-page.component.html',
  styleUrl: './teacher-profile-page.component.css'
})
export class TeacherProfilePageComponent {
  private readonly loadProfile = inject(LoadTeacherProfile);
  private readonly toggleFavourite = inject(ToggleFavouriteTeacher);
  private readonly store = inject(SignalSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly toasts = inject(ToastService);
  readonly transition = inject(TeacherTransition);
  readonly loadingAvatar = this.transition.avatarSrc();
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);

  readonly status = signal<'loading' | 'ready' | 'unavailable'>('loading');
  readonly view = signal<TeacherProfileView | null>(null);
  readonly selectedServiceId = signal('');
  readonly selectedSampleId = signal('');
  readonly favouriteBusy = signal(false);

  private readonly teacherId = this.route.snapshot.paramMap.get('teacherId') ?? '';
  /** What a report from this profile is about (help and abuse intake). */
  readonly reportAbout = `teacher:${this.teacherId}`;

  constructor() {
    void this.load();
  }

  t(key: string, fallback = ''): string {
    return this.locale.t(key, fallback);
  }

  readonly teacher = computed(() => this.view()?.teacher ?? null);
  readonly isStudent = computed(() => this.store.roles().includes('Student'));

  readonly name = computed(() => {
    const teacher = this.teacher();
    return teacher ? this.fmt.userName(teacher) : '';
  });

  readonly avatar = computed(() => {
    const teacher = this.teacher();
    return this.fmt.avatarUrl(teacher?.id, !!teacher?.hasAvatar, null, 'teacher');
  });

  /** Headline and bio each have a localized and an English field. */
  readonly headline = computed(() => this.localized('headline', 'headlineEnglish'));
  readonly bio = computed(() => this.localized('bio', 'bioEnglish'));

  readonly ratingLabel = computed(() => {
    const teacher = this.teacher();
    if (!teacher?.rating) return this.t('tp_no_reviews', 'No reviews yet');
    return `${this.fmt.number(teacher.rating, { maximumFractionDigits: 1 })} · ${teacher.reviewCount}`;
  });

  readonly services = computed(() => (this.teacher()?.services ?? []).map(service => ({
    ...service,
    name: this.serviceName(service),
    selected: service.id === this.selectedServiceId(),
    deliveryLabel: this.deliveryLabel(service),
    revisionsLabel: Number(service.revisionAllowance) > 0
      ? `${service.revisionAllowance} ${this.t('tp_free_revisions', 'free revisions')}`
      : this.t('tp_no_revisions', 'No revisions'),
    isLive: Teacher.isScheduled(service)
  })));

  private deliveryLabel(service: TeacherService): string {
    const wording = Teacher.deliveryWording(service);
    switch (wording.kind) {
      case 'duration': return wording.minutes.length
        ? this.locale.format('tp_session_minutes', { minutes: wording.minutes.join(' / ') }, '{minutes} min session')
        : this.t('tp_live_session', 'Live session');
      case 'hours': return countText((k, f) => this.locale.t(k, f), this.locale.lang(), 'count_hours', wording.value, '1 hour', '{n} hours');
      case 'days': return countText((k, f) => this.locale.t(k, f), this.locale.lang(), 'count_days', wording.value, '1 day', '{n} days');
      default: return this.t('tp_flexible', 'Flexible');
    }
  }

  readonly selectedService = computed(() =>
    this.services().find(s => s.selected) ?? this.services()[0] ?? null);

  readonly reviews = computed(() => (this.view()?.reviews ?? []).map(review => ({
    ...review,
    // The public review API does not disclose who wrote it; only a completed, paid order can leave one.
    author: this.locale.lang() === 'ar'
      ? (review.studentDisplayName || review.studentDisplayNameEnglish || this.t('tp_verified_student', 'Verified student'))
      : (review.studentDisplayNameEnglish || review.studentDisplayName || this.t('tp_verified_student', 'Verified student')),
    when: this.fmt.dateOnly(review.createdAt)
  })));

  readonly availabilityLabel = computed(() => {
    const view = this.view();
    if (!view || view.availabilityFailed) return '';
    // A teacher without live sessions has no schedule; "no open slots" would mislead.
    if (!view.availability || view.availability.state === 'no_schedule_configured') return '';
    const next = view.availability.nextAvailableAt;
    return next
      ? `${this.t('tp_next_available', 'Next available')} ${this.fmt.date(next)}`
      : this.t('tp_no_slots', 'No open slots right now');
  });

  readonly isQualified = computed(() =>
    Teacher.hasBadge(this.teacher(), 'qualified_on_tafseel'));

  readonly selectedSample = computed(() => {
    const samples = this.teacher()?.samples ?? [];
    return samples.find(s => s.id === this.selectedSampleId()) ?? samples[0] ?? null;
  });

  serviceDescription(service: { descriptionArabic: string; descriptionEnglish: string }): string {
    return this.locale.lang() === 'ar'
      ? (service.descriptionArabic || service.descriptionEnglish)
      : (service.descriptionEnglish || service.descriptionArabic);
  }

  /** Minutes and seconds, as the tag over the video showed them. */
  sampleDuration(sample: { durationSeconds: number | null }): string {
    const total = Number(sample.durationSeconds);
    if (!Number.isFinite(total) || total <= 0) return '';
    const minutes = Math.floor(total / 60);
    const seconds = Math.round(total % 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  /** A qualification sample is the trusted one; a showcase is teacher-supplied. */
  sampleTitle(sample: { trustCode: string; title: string }): string {
    if (sample.trustCode === 'intro') return this.t('tp_intro_video', 'Introduction video');
    return sample.title || this.t('tp_samples', 'Teaching samples');
  }

  sampleTrustLabel(sample: { trustCode: string }): string {
    const code = (sample.trustCode || '').toLowerCase();
    if (!code || code === 'intro') return '';
    return code.includes('qualification')
      ? this.t('tp_sample_qualification', 'Qualification sample')
      : this.t('tp_sample_showcase', 'Teacher showcase');
  }

  readonly subjectSummary = computed(() =>
    (this.teacher()?.subjects ?? []).join(this.locale.lang() === 'ar' ? '، ' : ', '));

  /** The five-bar breakdown beside the score, counted from the loaded reviews. */
  readonly ratingBreakdown = computed(() => {
    const reviews = this.reviews();
    return [5, 4, 3, 2, 1].map(score => {
      const count = reviews.filter(r => Math.round(r.rating) === score).length;
      return {
        label: String(score),
        score: count,
        widthStyle: `width:${reviews.length ? (count / reviews.length) * 100 : 0}%`
      };
    });
  });

  readonly reviewsSummary = computed(() => {
    const total = this.reviews().length;
    return `${this.fmt.number(total)} ${this.t('tp_reviews', 'reviews')}`;
  });

  /** Copies the profile URL; the legacy page's share control did the same. */
  async share(): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.href);
      this.toasts.show(this.t('tp_link_copied', 'Profile link copied.'));
    } catch {
      this.toasts.show(this.t('tp_share_failed', 'Could not copy the link.'));
    }
  }

  readonly languageSummary = computed(() =>
    (this.teacher()?.languages ?? []).join(this.locale.lang() === 'ar' ? '، ' : ', '));

  /** The bio reads as prose, so blank lines stay paragraph breaks. */
  readonly bioParagraphs = computed(() =>
    this.bio().split(/\n{2,}/).map(part => part.trim()).filter(Boolean));

  readonly samplePosition = computed(() => {
    const samples = this.teacher()?.samples ?? [];
    const index = samples.findIndex(x => x.id === this.selectedSample()?.id);
    return samples.length ? `${index + 1} / ${samples.length}` : '';
  });

  /** Named for the viewer, so a captured frame carries who was watching. */
  readonly mediaWatermark = computed(() =>
    this.store.current()?.email || this.store.current()?.fullName || 'Tafseel');

  /** Five icons, filled up to the score - the shape the stars row is built from. */
  stars(rating: number): readonly string[] {
    return Array.from({ length: 5 }, (_, i) =>
      i < Math.round(rating) ? 'is-on' : 'is-off');
  }

  private step(delta: number): void {
    const samples = this.teacher()?.samples ?? [];
    if (samples.length < 2) return;
    const current = samples.findIndex(x => x.id === this.selectedSample()?.id);
    const next = (current + delta + samples.length) % samples.length;
    this.selectedSampleId.set(samples[next].id);
  }

  previousSample(): void { this.step(-1); }
  nextSample(): void { this.step(1); }

  /** Where the request and booking buttons lead, carrying the chosen service. */
  readonly requestLink = computed(() => ({
    path: '/requests/new',
    query: { teacherId: this.teacherId, teacherServiceId: this.selectedService()?.id ?? '' }
  }));

  readonly bookLink = computed(() => ({
    path: '/sessions/book',
    query: { teacherId: this.teacherId, teacherServiceId: this.selectedService()?.id ?? '' }
  }));

  async load(): Promise<void> {
    if (!this.teacherId) {
      this.status.set('unavailable');
      return;
    }
    this.status.set('loading');
    try {
      const q = this.route.snapshot.queryParamMap;
      const view = await this.loadProfile.execute(this.teacherId, this.isStudent(), {
        subjectId: q.get('subjectId'),
        serviceId: q.get('serviceId'),
        teacherServiceId: q.get('teacherServiceId')
      });
      this.view.set(view);
      this.selectedServiceId.set(view.preferredService?.id ?? '');
      this.selectedSampleId.set(view.teacher.samples[0]?.id ?? '');
      this.status.set('ready');
      queueMicrotask(() => this.title.setTitle(`${this.fmt.userName(view.teacher)} — Tafseel`));
    } catch {
      this.status.set('unavailable');
    }
  }

  selectService(serviceId: string): void {
    this.selectedServiceId.set(serviceId);
  }

  selectSample(sampleId: string): void {
    this.selectedSampleId.set(sampleId);
  }

  async favourite(): Promise<void> {
    const view = this.view();
    if (!view || this.favouriteBusy() || !this.isStudent()) return;

    this.favouriteBusy.set(true);
    try {
      const next = await this.toggleFavourite.execute(this.teacherId, view.isFavourite);
      this.view.set({ ...view, isFavourite: next });
      this.toasts.show(next
        ? this.t('tp_favourited', 'Saved to your teachers.')
        : this.t('tp_unfavourited', 'Removed from your teachers.'));
    } catch {
      this.toasts.show(this.t('tp_favourite_failed', 'Could not update.'));
    } finally {
      this.favouriteBusy.set(false);
    }
  }

  private serviceName(service: TeacherService): string {
    return this.locale.lang() === 'ar'
      ? (service.serviceNameArabic || service.serviceNameEnglish)
      : (service.serviceNameEnglish || service.serviceNameArabic);
  }

  private localized(arabicField: keyof Teacher, englishField: keyof Teacher): string {
    const teacher = this.teacher();
    if (!teacher) return '';
    const arabic = String(teacher[arabicField] ?? '');
    const english = String(teacher[englishField] ?? '');
    return this.locale.lang() === 'ar' ? (arabic || english) : (english || arabic);
  }
}
