import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

/**
 * Label, control, and the one message slot beneath it.
 *
 * The legacy pages repeated this trio for every input and hand-wrote the invalid
 * styling as an inline `style="border-color:var(--error);…"` at each site. Here
 * the invalid state is a class the stylesheet already knows, and the error is
 * announced once, in one place.
 */
@Component({
  selector: 'tf-text-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tf-field">
      <label [attr.for]="fieldId()">{{ label() }}</label>
      <input [id]="fieldId()" [name]="name() || fieldId()" [required]="required()" [disabled]="disabled()" [readOnly]="readOnly()" [type]="type()" [attr.inputmode]="inputMode()"
             [attr.autocomplete]="autocomplete()" [attr.placeholder]="placeholder()"
             [attr.maxlength]="maxLength()" [attr.dir]="direction()"
             [attr.spellcheck]="type() === 'email' ? 'false' : null"
             [class.tf-field--invalid]="invalid()"
             [attr.aria-invalid]="invalid()"
             [attr.aria-describedby]="message() ? fieldId() + '-msg' : null"
             [value]="value()"
             (input)="value.set($any($event.target).value)"
             (blur)="blurred.emit()" />
      @if (message(); as text) {
        <span class="tf-field-help" [class.tf-field-error]="invalid()"
              [id]="fieldId() + '-msg'" [attr.role]="invalid() ? 'alert' : null">{{ text }}</span>
      }
    </div>
  `,
  styles: `
    :host { display: contents; }
    /* The legacy markup set these inline at every call site; they belong to the
       field, and only apply when the field says it is invalid. */
    .tf-field--invalid { border-color: var(--error); background: var(--error-soft); }
    .tf-field-error { color: var(--error); font-weight: 600; }
  `
})
export class TextFieldComponent {
  readonly fieldId = input.required<string>();
  readonly label = input.required<string>();
  readonly value = model('');
  readonly name = input('');
  readonly required = input(false);
  readonly disabled = input(false);
  readonly readOnly = input(false);
  readonly type = input<'text' | 'email' | 'password'>('text');
  readonly autocomplete = input<string | null>(null);
  readonly placeholder = input<string | null>(null);
  readonly inputMode = input<string | null>(null);
  readonly maxLength = input<number | null>(null);
  readonly dir = input<string | null>(null);
  /** An address is Latin left-to-right text; in an RTL field its "@" and "." jump ends as it is typed. */
  readonly direction = computed(() => this.dir() ?? (this.type() === 'email' ? 'ltr' : null));
  readonly invalid = input(false);
  /** Error when `invalid`, hint otherwise — one slot, so they cannot both show. */
  readonly message = input<string>('');
  readonly blurred = output<void>();
}
