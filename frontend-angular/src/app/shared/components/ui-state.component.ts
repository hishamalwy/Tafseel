import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent, IconName } from './icon.component';

/** Presentation only: the caller supplies the server-grounded message and real actions. */
@Component({
  selector: 'tf-ui-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './ui-state.component.css',
  imports: [IconComponent],
  host: { 'class': 'tf-ui-state-host' },
  template: `
    <section animate.enter="tf-motion-enter" class="tf-ui-state" [attr.data-state]="state()" [attr.data-variant]="variant()"
             [class.tf-ui-state--compact]="compact()" [attr.role]="state() === 'error' ? 'alert' : 'status'"
             [attr.aria-live]="state() === 'error' ? 'assertive' : 'polite'" aria-atomic="true">
      <span class="tf-ui-state__symbol" aria-hidden="true"><tf-icon [name]="symbol()" [size]="24" iconRole="status" /></span>
      <div class="tf-ui-state__copy">
        <p class="tf-ui-state__title">{{ title() }}</p>
        @if (body()) { <p class="tf-ui-state__body">{{ body() }}</p> }
        <div class="tf-ui-state__actions"><ng-content /></div>
      </div>
    </section>
  `
})
export class UiStateComponent {
  readonly state = input<'empty' | 'success' | 'error' | 'waiting' | 'updating'>('empty');
  readonly variant = input<'first-use' | 'filtered' | 'caught-up' | 'confirmation'>('first-use');
  readonly title = input.required<string>();
  readonly body = input('');
  readonly icon = input<IconName | null>(null);
  readonly compact = input(false);
  readonly symbol = computed<IconName>(() => this.icon() ?? (this.state() === 'success' || this.variant() === 'caught-up'
    ? 'check' : this.state() === 'error' ? 'flag' : this.state() === 'waiting' ? 'clock'
      : this.variant() === 'filtered' ? 'search' : 'file-plus'));
}
