import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'eye' | 'eye-off' | 'student' | 'teacher'
  // Navigation and dashboards: one outline family, 24px grid, round joins, the caller's stroke.
  | 'home' | 'search' | 'file-plus' | 'inbox' | 'message' | 'briefcase' | 'megaphone' | 'wallet'
  | 'sliders' | 'clipboard-check' | 'user' | 'flag' | 'users' | 'grid' | 'activity' | 'coins'
  | 'history' | 'calendar' | 'clock' | 'arrow-right' | 'check' | 'upload' | 'star' | 'bell';

/**
 * Tafseel's icon set: inline SVG in a single outline family (24px grid, round caps and joins), so an icon in
 * the sidebar, a card and a button read as one hand. Stroke and size come from the caller; colour is
 * `currentColor`. Arrows that point along the reading direction mirror in RTL through `.tf-icon-dir`.
 */
@Component({
  selector: 'tf-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 24 24'" [attr.width]="size()" [attr.height]="size()"
         [attr.class]="name() === 'arrow-right' ? 'tf-icon-dir' : null"
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
        @case ('home') {
          <path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>
        }
        @case ('search') { <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/> }
        @case ('file-plus') {
          <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z"/><path d="M14 3v5h5"/><path d="M12 11v6M9 14h6"/>
        }
        @case ('inbox') {
          <path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6Z"/>
        }
        @case ('message') { <path d="M21 14a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/> }
        @case ('briefcase') {
          <rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>
        }
        @case ('megaphone') { <path d="M3 11v2a1 1 0 0 0 1 1h3l7 5V5L7 10H4a1 1 0 0 0-1 1Z"/><path d="M18 8.5a5 5 0 0 1 0 7"/> }
        @case ('wallet') {
          <path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6"/><path d="M17 14h.01"/>
        }
        @case ('sliders') {
          <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>
        }
        @case ('clipboard-check') {
          <rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="m9 13 2 2 4-4"/>
        }
        @case ('user') { <circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/> }
        @case ('flag') { <path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/> }
        @case ('users') {
          <circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>
        }
        @case ('grid') {
          <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
          <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
        }
        @case ('activity') { <path d="M3 12h4l3-8 4 16 3-8h4"/> }
        @case ('coins') {
          <ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M15 11.5c3.4.3 6 1.5 6 3 0 1.7-2.7 3-6 3-1.4 0-2.7-.2-3.7-.6"/><path d="M21 14.5v4c0 1.7-2.7 3-6 3s-6-1.3-6-3v-3"/>
        }
        @case ('history') { <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/> }
        @case ('calendar') { <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/> }
        @case ('clock') { <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/> }
        @case ('arrow-right') { <path d="M5 12h14"/><path d="m13 6 6 6-6 6"/> }
        @case ('check') { <path d="m5 12 5 5 9-10"/> }
        @case ('upload') { <path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/> }
        @case ('star') { <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/> }
        @case ('bell') { <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/> }
      }
    </svg>
  `,
  styles: `:host { display: contents; }`
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  readonly strokeWidth = input(1.8);
}
