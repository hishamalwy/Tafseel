import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { LocaleService } from '@core/i18n/locale.service';
import { timeZoneLabel } from '@shared/utils/time-zones';

/** A native select with a local search; filtering never changes the saved IANA value. */
@Component({
  selector: 'tf-time-zone-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (choices().length > 12) {
      <label class="tf-sr-only" [for]="fieldId() + '-search'">{{ locale.t('craft_zone_search', 'Search for a city or time zone') }}</label>
      <input type="search" autocomplete="off" [id]="fieldId() + '-search'" [name]="fieldId() + '-search'"
        [placeholder]="locale.t('craft_zone_search', 'Search for a city or time zone')" [value]="search()"
        (input)="search.set($any($event.target).value)" [disabled]="disabled()" />
    }
    <select [id]="fieldId()" [name]="name() || fieldId()" [value]="value()" [disabled]="disabled()"
      [attr.aria-invalid]="invalid() || null" [attr.aria-describedby]="describedBy() || null"
      (change)="valueChange.emit($any($event.target).value)">
      @for (choice of visible(); track choice.zone) { <option [value]="choice.zone" [selected]="choice.zone === value()">{{ choice.label }}</option> }
    </select>
    @if (search() && !matches().length) { <span class="tf-field-help" role="status">{{ locale.t('craft_zone_no_results', 'No matching zones. Your current selection is kept.') }}</span> }
  `,
  styles: ':host{display:grid;gap:var(--space-2,8px);min-inline-size:0}'
})
export class TimeZoneSelectComponent {
  readonly locale = inject(LocaleService);
  readonly fieldId = input.required<string>();
  readonly name = input('');
  readonly value = input.required<string>();
  readonly choices = input.required<readonly string[]>();
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly describedBy = input('');
  readonly valueChange = output<string>();
  readonly search = signal('');
  readonly options = computed(() => [...new Set([this.value(), ...this.choices()].filter(Boolean))].map(zone => ({ zone, label: timeZoneLabel(zone, this.locale.lang()) })));
  readonly matches = computed(() => {
    const needle = this.search().trim().toLocaleLowerCase(this.locale.lang());
    return this.options().filter(option => `${option.zone.replaceAll('_', ' ')} ${option.label}`.toLocaleLowerCase(this.locale.lang()).includes(needle));
  });
  readonly visible = computed(() => {
    const current = this.options().find(option => option.zone === this.value());
    return current && !this.matches().includes(current) ? [current, ...this.matches()] : this.matches();
  });
}
