import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { PolicyId, POLICY_ORDER } from '@features/policies/models/policy';
import { StaticPolicyRepository } from '@features/policies/services/static-policy.repository';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkflowHeaderComponent } from '@shared/layouts/workflow-header.component';
import { SkipLinkComponent } from '@shared/layouts/skip-link.component';

/**
 * The policy documents — ported from `Tafseel-Policies.dc.html`.
 *
 * One deliberate change: the legacy page kept the selected document in component
 * state and pushed `?policy=` with `history.replaceState`, so a reload landed on
 * Terms whatever the URL said and the back button did nothing. Here the id is the
 * route parameter and the component reads it, which is also what makes each
 * document independently prerenderable and separately indexable.
 */
@Component({
  selector: 'tf-policies-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SkipLinkComponent, WorkflowHeaderComponent],
  templateUrl: './policies-page.component.html'
})
export class PoliciesPageComponent {
  private readonly repository = inject(StaticPolicyRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  readonly locale = inject(LocaleService);

  private readonly requested = toSignal(
    this.route.paramMap.pipe(map(p => p.get('policy'))),
    { initialValue: this.route.snapshot.paramMap.get('policy') }
  );

  readonly activeId = computed<PolicyId>(() => {
    const asked = this.requested();
    return POLICY_ORDER.includes(asked as PolicyId) ? (asked as PolicyId) : 'terms';
  });

  readonly chrome = computed(() => this.repository.chrome(this.locale.lang()));
  readonly policies = computed(() => this.repository.all(this.locale.lang()));
  readonly active = computed(() =>
    this.repository.byId(this.activeId(), this.locale.lang()) ?? this.policies()[0]!);

  readonly nav = computed(() =>
    this.policies().map(p => ({ id: p.id, label: p.title, current: p.id === this.activeId() })));


  constructor() {
    // Keeps the tab title in step with both the document and the language, the
    // job `syncTitle()` did on every update in the original.
    const sync = computed(() => `${this.active().title} — Tafseel`);
    queueMicrotask(() => this.title.setTitle(sync()));
  }

  select(id: PolicyId): void {
    void this.router.navigate(['/policies', id]);
  }
}
