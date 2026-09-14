import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName = 'eye' | 'eye-off' | 'student' | 'teacher';

/**
 * The handful of inline SVGs the legacy templates repeated verbatim — the eye
 * pair alone appeared six times in the auth page. Stroke and size come from the
 * caller so one definition serves every use.
 */
@Component({
  selector: 'tf-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 24 24'" [attr.width]="size()" [attr.height]="size()"
         fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth()"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      @switch (name()) {
        @case ('eye') {
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>
        }
        @case ('eye-off') {
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-6.5 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94"/>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19"/>
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/>
        }
        @case ('student') {
          <path d="M22 10 12 5 2 10l10 5 10-5Z"/>
          <path d="M6 12v5c0 .7 2.7 2 6 2s6-1.3 6-2v-5"/><path d="M22 10v6"/>
        }
        @case ('teacher') {
          <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        }
      }
    </svg>
  `,
  styles: `:host { display: contents; }`
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  readonly strokeWidth = input(1.75);
}
