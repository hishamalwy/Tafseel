import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService } from '@core/i18n/locale.service';
import { OnboardingState } from '../models/readiness';
import { LoadSetupProgress } from '../services/teacher-setup.use-cases';

export type SetupStep = 'profile' | 'services' | 'availability' | 'publication';

/**
 * The four steps between approval and being found by students, shown on each of those screens
 * until the profile is published.
 *
 * Approval used to drop a teacher straight onto the profile form under "Marketplace setup", with
 * nothing saying they had been approved or how many screens were still ahead of them; the full
 * checklist lived only on the Publication page, which is the last place a new teacher looks.
 * The done marks are the server's own flags; this component decides nothing.
 */
@Component({
  selector: 'tf-setup-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (visible() && state(); as s) {
      <section class="tf-setup-progress" data-testid="setup-progress" [attr.aria-label]="t('setup_progress_aria', 'Steps before students can find you')">
        <p class="tf-setup-progress__lead">
          <strong>{{ t('setup_progress_approved', 'Your application is approved.') }}</strong>
          {{ t('setup_progress_lead', 'Four steps before students can find you:') }}
        </p>
        <ol class="tf-setup-progress__steps">
          @for (step of steps(); track step.key; let index = $index) {
            <li [attr.data-done]="step.done" [attr.aria-current]="step.key === current() ? 'step' : null">
              <a [routerLink]="step.link">
                <span class="tf-setup-progress__mark" aria-hidden="true">{{ step.done ? '✓' : index + 1 }}</span>
                <span>{{ t(step.labelKey, step.fallback) }}
                  @if (step.done) { <span class="tf-sr-only">{{ t('setup_progress_done', '(done)') }}</span> }
                </span>
              </a>
            </li>
          }
        </ol>
      </section>
    }
  `,
  styles: `
    .tf-setup-progress { margin-block-end: 20px; padding: 16px 18px; border: 1px solid color-mix(in oklab, var(--primary) 30%, var(--border));
      border-radius: var(--r-lg); background: color-mix(in oklab, var(--primary-soft) 45%, var(--surface)); }
    .tf-setup-progress__lead { margin: 0 0 12px; font-size: 15px; line-height: 1.6; }
    .tf-setup-progress__steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
    .tf-setup-progress__steps a { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 8px 12px;
      border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); color: var(--text);
      font-size: 14px; font-weight: 700; text-decoration: none; }
    .tf-setup-progress__steps li[aria-current='step'] a { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
    .tf-setup-progress__steps li[data-done='true'] a { color: var(--text-2); }
    .tf-setup-progress__mark { display: grid; place-items: center; flex: none; inline-size: 26px; block-size: 26px; border-radius: 50%;
      background: var(--primary-soft); color: var(--primary); font-size: 13px; font-weight: 800; }
    li[data-done='true'] .tf-setup-progress__mark { background: var(--success-soft); color: var(--success); }
    @media (max-width: 760px) { .tf-setup-progress__steps { grid-template-columns: minmax(0, 1fr); } }
  `
})
export class SetupProgressComponent {
  private readonly load = inject(LoadSetupProgress);
  private readonly locale = inject(LocaleService);

  readonly current = input.required<SetupStep>();
  readonly state = signal<OnboardingState | null>(null);

  /** Only between approval and publication; a published teacher or one still applying does not need it. */
  readonly visible = computed(() => {
    const s = this.state();
    return !!s && s.approvedSubjectIds.length > 0 && !s.isPublished;
  });

  readonly steps = computed(() => {
    const s = this.state();
    if (!s) return [];
    return [
      { key: 'profile', done: s.profileComplete, link: '/teacher/profile',
        labelKey: 'setup_progress_profile', fallback: 'Write your profile' },
      { key: 'services', done: !s.blockingReasons.includes('active_service_required') && !s.blockingReasons.includes('eligible_active_service_required'),
        link: '/teacher/services', labelKey: 'setup_progress_services', fallback: 'Add a service and price' },
      { key: 'availability', done: s.hasAvailability, link: '/teacher/availability',
        labelKey: 'setup_progress_availability', fallback: 'Weekly times (live sessions only)' },
      { key: 'publication', done: s.isPublished, link: '/teacher/publication',
        labelKey: 'setup_progress_publication', fallback: 'Publish your profile' }
    ];
  });

  constructor() {
    void this.load.execute().then(state => this.state.set(state), () => this.state.set(null));
  }

  t(key: string, fallback: string): string { return this.locale.t(key, fallback); }
}
