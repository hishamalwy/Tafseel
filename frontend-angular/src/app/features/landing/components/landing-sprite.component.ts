import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The landing page's icon sprite: one hidden <symbol> per glyph, referenced by
 * `<use href="#tf-i-...">` wherever the page needs it.
 *
 * It is a sprite rather than a component per icon because the flow steps bind an
 * inert `href` reference instead of a raw path `d` — a template placeholder
 * inside `d` is rejected by the SVG parser before it ever reaches the DOM.
 */
@Component({
  selector: 'tf-landing-sprite',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">
    <symbol id="tf-i-upload" viewBox="0 0 24 24"><path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></symbol>
    <symbol id="tf-i-compare" viewBox="0 0 24 24"><path d="M4 19V9m5 10V5m5 14v-7m5 7V7" /></symbol>
    <symbol id="tf-i-tune" viewBox="0 0 24 24"><path d="M4 7h9m5 0h2M4 17h5m4 0h7M15 4.5v5M9 14.5v5" /></symbol>
    <symbol id="tf-i-play" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Zm7-3 5 3-5 3V9Z" /></symbol>
    <symbol id="tf-i-shield" viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Zm-3.5 9 2.2 2.2 4.8-5" /></symbol>
    <symbol id="tf-i-clock" viewBox="0 0 24 24"><path d="M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" /></symbol>
    <symbol id="tf-i-bolt" viewBox="0 0 24 24"><path d="m13 3-8 10h6l-1 8 8-10h-6l1-8Z" /></symbol>
    <symbol id="tf-i-megaphone" viewBox="0 0 24 24"><path d="M4 10v4a1 1 0 0 0 1 1h3l6 4V5L8 9H5a1 1 0 0 0-1 1Zm13-1a4 4 0 0 1 0 6" /></symbol>
    <symbol id="tf-i-star" viewBox="0 0 24 24"><path d="m12 4 2.4 5 5.6.7-4 3.9.9 5.4-4.9-2.6-4.9 2.6.9-5.4-4-3.9 5.6-.7L12 4Z" /></symbol>
    <symbol id="tf-i-calendar" viewBox="0 0 24 24"><path d="M4 9h16M8 4v3m8-3v3M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" /></symbol>
    <symbol id="tf-i-teacher-check" viewBox="0 0 24 24"><path d="M10 8a3.2 3.2 0 1 0 0-.01M4.6 20a5.6 5.6 0 0 1 10.8 0M16 12.5l1.7 1.7 3.3-3.6" /></symbol>
    <symbol id="tf-i-students" viewBox="0 0 24 24"><path d="M9 8a3 3 0 1 0 0-.01M3.5 20a5.5 5.5 0 0 1 11 0M16.5 7.2a3 3 0 0 1 0 5.6M17.5 20a5.6 5.6 0 0 0-2.2-4.4" /></symbol>
    <symbol id="tf-i-teacher-cap" viewBox="0 0 24 24"><path d="M12 5 2.5 9.5 12 14l9.5-4.5L12 5Zm-5.5 6.6V16c0 1.4 2.5 2.8 5.5 2.8s5.5-1.4 5.5-2.8v-4.4M21.5 9.5v5" /></symbol>
    <symbol id="tf-i-arrow" viewBox="0 0 24 24"><path d="M5 12h13m-6-6 6 6-6 6" /></symbol>
    <symbol id="tf-i-check" viewBox="0 0 24 24"><path d="m5 12.5 4.6 4.6L19 7.5" /></symbol>
    <symbol id="tf-i-tag" viewBox="0 0 24 24"><path d="M3 12V5.5A1.5 1.5 0 0 1 4.5 4H11l9 9-7 7-9-9Zm4.5-4.5h.01" /></symbol>
    </svg>
  `,
  styles: `:host { display: contents; }`
})
export class LandingSpriteComponent {}
