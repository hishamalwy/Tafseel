import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { LocaleService } from '@core/i18n/locale.service';

/** The shapes describe real page anatomy; no invented data or simulated progress. */
@Component({
  selector: 'tf-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './skeleton.component.css',
  template: `
    <div class="tf-loading-shape" data-state="loading" [attr.data-kind]="kind()" role="status" aria-live="polite" aria-busy="true">
      <span class="tf-sr-only">{{ label() || locale.t('common_loading', 'Loading…') }}</span>
      <div aria-hidden="true" class="tf-loading-shape__content">
        @if (kind() === 'profile') {
          <div class="tf-loading-shape__identity">
            @if (avatarSrc()) {
              <img class="tf-loading-shape__avatar" [src]="avatarSrc()" [style.view-transition-name]="avatarTransitionName()" alt="" width="80" height="80" />
            } @else { <i class="tf-skeleton tf-loading-shape__avatar"></i> }
            <div><i class="tf-skeleton tf-loading-shape__title"></i><i class="tf-skeleton tf-loading-shape__line"></i><i class="tf-skeleton tf-loading-shape__short"></i></div>
          </div>
          <div class="tf-loading-shape__summary"><i class="tf-skeleton tf-loading-shape__line"></i><i class="tf-skeleton tf-loading-shape__short"></i></div>
        }
        @if (kind() === 'form') {
          <div class="tf-loading-shape__form">
            @for (row of rows; track row) { <div class="tf-loading-shape__lines"><i class="tf-skeleton tf-loading-shape__short"></i><i class="tf-skeleton tf-loading-shape__control"></i></div> }
            <i class="tf-skeleton tf-loading-shape__action"></i>
          </div>
        } @else { @for (row of rows; track row) {
          <div class="tf-loading-shape__row">
            @if (kind() === 'teachers') { <i class="tf-skeleton tf-loading-shape__avatar"></i> }
            <div class="tf-loading-shape__lines"><i class="tf-skeleton tf-loading-shape__title"></i><i class="tf-skeleton tf-loading-shape__line"></i><i class="tf-skeleton tf-loading-shape__short"></i></div>
            <i class="tf-skeleton tf-loading-shape__action"></i>
          </div>
        } }
      </div>
    </div>
  `
})
export class SkeletonComponent {
  readonly locale = inject(LocaleService);
  readonly kind = input<'profile' | 'teachers' | 'work' | 'slots' | 'detail' | 'balances' | 'queue' | 'table' | 'form'>('work');
  readonly label = input('');
  readonly avatarSrc = input('');
  readonly avatarTransitionName = input('none');
  readonly rows = [0, 1, 2];
}
