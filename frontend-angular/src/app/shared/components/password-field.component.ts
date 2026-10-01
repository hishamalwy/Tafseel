import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal } from '@angular/core';
import { LocaleService } from '@core/i18n/locale.service';
import { IconComponent } from './icon.component';

/**
 * A password input with its own reveal toggle.
 *
 * The auth page carried this markup four times — two on register, two on reset —
 * each with the full pair of eye SVGs inlined and its own `showPassword` flag.
 * The reveal state belongs to the field, so it lives here.
 */
@Component({
  selector: 'tf-password-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="tf-field">
      <label [attr.for]="fieldId()">{{ label() }}</label>
      <div class="tf-password-wrap">
        <input [id]="fieldId()" [type]="revealed() ? 'text' : 'password'" dir="ltr"
               [attr.autocomplete]="autocomplete()" [attr.placeholder]="placeholder()"
               [class.tf-field--invalid]="invalid()" [attr.aria-invalid]="invalid()"
               [attr.aria-describedby]="message() ? fieldId() + '-msg' : null"
               [value]="value()"
               (input)="value.set($any($event.target).value)"
               (focus)="focused.emit()" (blur)="blurred.emit()" />
        <button type="button" class="tf-password-toggle" (click)="toggle()"
                [attr.aria-pressed]="revealed()" [attr.aria-label]="toggleLabel()">
          <tf-icon [name]="revealed() ? 'eye-off' : 'eye'" />
        </button>
      </div>
      @if (message(); as text) {
        <span class="tf-field-help" [class.tf-field-error]="invalid()"
              [id]="fieldId() + '-msg'" [attr.role]="invalid() ? 'alert' : null">{{ text }}</span>
      }
    </div>
  `,
  styles: `
    :host { display: contents; }
    .tf-field--invalid { border-color: var(--error); background: var(--error-soft); }
    .tf-field-error { color: var(--error); font-weight: 600; }
    /* The shared sheet removes the outline and only recolours the icon, which is not a visible
       focus indicator; this restores the same 3px ring every other control uses. */
    .tf-password-toggle:focus-visible {
      box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 30%, transparent);
      border-radius: var(--r-sm);
    }
  `
})
export class PasswordFieldComponent {
  private readonly locale = inject(LocaleService);

  readonly fieldId = input.required<string>();
  readonly label = input.required<string>();
  readonly value = model('');
  readonly autocomplete = input<string>('current-password');
  readonly placeholder = input<string | null>(null);
  readonly invalid = input(false);
  readonly message = input<string>('');
  readonly focused = output<void>();
  readonly blurred = output<void>();

  /**
   * Optional shared reveal: password and confirm-password toggled together in
   * the original, so a caller can pass one signal to both fields.
   */
  readonly revealedState = input<ReturnType<typeof signal<boolean>> | null>(null);
  private readonly ownRevealed = signal(false);

  readonly revealed = computed(() => this.revealedState()?.() ?? this.ownRevealed());

  readonly toggleLabel = computed(() =>
    this.locale.lang() === 'ar'
      ? (this.revealed() ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور')
      : (this.revealed() ? 'Hide password' : 'Show password'));

  toggle(): void {
    const shared = this.revealedState();
    if (shared) shared.set(!shared());
    else this.ownRevealed.set(!this.ownRevealed());
  }
}
