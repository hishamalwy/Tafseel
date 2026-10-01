import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandMarkComponent } from '@shared/components/brand-mark.component';
import { LangToggleComponent } from '@shared/components/lang-toggle.component';
import { ThemeToggleComponent } from '@shared/components/theme-toggle.component';

/**
 * The split shell the authentication screens share: form column on one side,
 * the ink brand panel on the other.
 *
 * `Tafseel-Auth.dc.html` and `Tafseel-Confirm-Email.dc.html` each carried a full
 * copy of it, including the toolbar, both toggles and the aside with its mark and
 * two lines of promise. The extra class the confirm page put on each element is
 * kept as an input so its own stylesheet rules still apply.
 */
@Component({
  selector: 'tf-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BrandMarkComponent, LangToggleComponent, ThemeToggleComponent],
  template: `
    <div class="tf-auth-layout" [class]="layoutClass()" data-stack="auth">
      <main [id]="mainId()" class="tf-auth-main" [class]="mainClass()">
        <div class="tf-auth-toolbar">
          <a class="tf-auth-brand" [class]="brandClass()" routerLink="/" [attr.aria-label]="homeLabel()">
            <tf-brand-mark />
          </a>
          <div class="tf-auth-tools" [class]="toolsClass()">
            <tf-lang-toggle />
            <tf-theme-toggle />
          </div>
        </div>

        <ng-content />
      </main>

      <aside class="tf-auth-aside tf-ink-band" data-hide-sm="1"
             data-pattern="bottom" data-pattern-tone="lime" data-pattern-scale="lg">
        <div>
          <img class="tf-auth-mark-light" decoding="async" data-tafseel-mark
               src="assets/brand/tafseel-mark.svg" alt="Tafseel" width="68" height="92" />
          <img class="tf-auth-mark-dark" decoding="async" data-tafseel-mark data-tafseel-mark-force="dark"
               src="assets/brand/tafseel-mark-dark.svg" alt="Tafseel" width="68" height="92" />
          <h2 dir="rtl" lang="ar" translate="no">درسك على مقاسك.</h2>
          <p class="tf-mursala" lang="en" dir="ltr">Education, tailored to you.</p>
        </div>
      </aside>
    </div>
  `,
  styles: `:host { display: block; min-block-size: 100dvh; }`
})
export class AuthShellComponent {
  readonly mainId = input<string | null>(null);
  readonly homeLabel = input('Tafseel home');
  /** Extra classes the confirm-email variant adds on top of the shared ones. */
  readonly layoutClass = input('');
  readonly mainClass = input('');
  readonly brandClass = input('');
  readonly toolsClass = input('');
}
