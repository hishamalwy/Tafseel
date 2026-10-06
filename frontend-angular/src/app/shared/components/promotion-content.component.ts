import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** The same campaign content in the public dialog and the local editor preview. */
@Component({
  selector: 'tf-promotion-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ':host{display:contents}',
  template: `
    @switch (lead()) {
      @case ('figure') { <p class="tf-promo-lead tf-promo-lead--figure"><span class="tf-promo-lead-figure">{{ figure() }}</span><span class="tf-promo-lead-note">{{ figureNote() }}</span></p> }
      @case ('date') { <div class="tf-promo-lead"><div class="tf-promo-date"><span class="tf-promo-date-day">{{ dateDay() }}</span><span class="tf-promo-date-month">{{ dateMonth() }}</span></div></div> }
      @default { <div class="tf-promo-lead tf-promo-lead--mark" aria-hidden="true"><img data-tafseel-mark data-tafseel-mark-force="dark" src="assets/brand/tafseel-mark-dark.svg" alt="" width="48" height="65" /></div> }
    }
    <div class="tf-promo-wizard-copy">
      <h2 class="tf-promo-title" [id]="titleId()">{{ title() }}</h2>
      @if (body()) { <p class="tf-promo-body">{{ body() }}</p> }
      @if (code()) {
        <div class="tf-promo-field"><span class="tf-promo-field-label">{{ codeLabel() }}</span>
          @if (interactive()) { <button type="button" class="tf-promo-code" data-testid="promo-code" (click)="copyRequested.emit()"><span class="tf-promo-code-value">{{ code() }}</span><span class="tf-promo-code-copy">{{ copyLabel() }}</span></button> }
          @else { <span class="tf-promo-code"><span class="tf-promo-code-value">{{ code() }}</span></span> }
        </div>
      }
      @if (units(); as countdown) {
        <div class="tf-promo-field"><span class="tf-promo-field-label">{{ countdownLabel() }}</span><div class="tf-promo-countdown" role="timer" [attr.aria-label]="countdownLabel()">
          @for (unit of countdown; track unit.label) { <span class="tf-promo-countdown-unit"><span class="tf-promo-countdown-value">{{ unit.value }}</span><span class="tf-promo-countdown-label">{{ unit.label }}</span></span> }
        </div></div>
      }
    </div>
  `
})
export class PromotionContentComponent {
  readonly title = input.required<string>();
  readonly body = input('');
  readonly titleId = input('promo-wizard-title');
  readonly lead = input<'figure' | 'date' | 'mark'>('mark');
  readonly figure = input('');
  readonly figureNote = input('');
  readonly dateDay = input('');
  readonly dateMonth = input('');
  readonly code = input('');
  readonly codeLabel = input('');
  readonly copyLabel = input('');
  readonly interactive = input(true);
  readonly units = input<readonly { value: string; label: string }[] | null>(null);
  readonly countdownLabel = input('');
  readonly copyRequested = output<void>();
}
