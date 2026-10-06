import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface PasswordRuleView {
  readonly label: string;
  readonly satisfied: boolean;
}

/**
 * The live checklist under a new-password field.
 *
 * The legacy version built a `badgeStyle` string in JavaScript and re-rendered
 * the whole inline style on every keystroke. The only thing that actually changes
 * per rule is whether it is met, so that is the only thing bound here.
 */
@Component({
  selector: 'tf-password-rules',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tf-pw-rules">
      <span class="tf-pw-rules__heading">{{ heading() }}</span>
      @for (rule of rules(); track rule.label) {
        <div class="tf-pw-rule" [class.tf-pw-rule--met]="rule.satisfied">
          <span class="tf-pw-rule__badge" aria-hidden="true">@if (rule.satisfied) { <svg viewBox="0 0 24 24" width="12" height="12"><path d="m5 12.5 4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg> }</span>
          <span>{{ rule.label }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: contents; }
    .tf-pw-rules {
      display: grid; gap: 6px; padding: 12px 14px;
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: var(--r-sm);
    }
    .tf-pw-rules__heading {
      font-size: var(--type-caption-size); font-weight: 700; color: var(--text-2);
      text-transform: uppercase; letter-spacing: .03em; margin-block-end: 2px;
    }
    .tf-pw-rule {
      display: flex; align-items: center; gap: 8px;
      font-size: var(--type-meta-size); font-weight: 600; color: var(--text-2);
    }
    .tf-pw-rule--met { color: var(--success); }
    .tf-pw-rule__badge {
      display: inline-flex; align-items: center; justify-content: center;
      inline-size: 16px; block-size: 16px; border-radius: 50%;
      font-size: var(--type-caption-size); line-height: 1; flex: none;
      background: var(--surface); color: var(--muted); border: 1px solid var(--border);
      transition: background-color var(--t), color var(--t), border-color var(--t);
    }
    .tf-pw-rule--met .tf-pw-rule__badge {
      background: var(--success-soft); color: var(--success); border-color: transparent;
    }
    @media (prefers-reduced-motion: reduce) { .tf-pw-rule__badge { transition: none; } }
  `
})
export class PasswordRulesComponent {
  readonly rules = input.required<readonly PasswordRuleView[]>();
  readonly heading = input.required<string>();
}
