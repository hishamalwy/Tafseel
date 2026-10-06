import { Directive, input } from '@angular/core';

/** Keeps the label and icon lane stable through a caller's real async state. */
@Directive({
  selector: 'button[tfActionFeedback]',
  host: {
    'class': 'tf-feedback-button',
    '[attr.data-feedback]': 'tfActionFeedback()',
    '[attr.aria-busy]': "tfActionFeedback() === 'busy' ? 'true' : null"
  }
})
export class ActionFeedbackDirective {
  readonly tfActionFeedback = input<'idle' | 'busy' | 'success'>('idle');
}
