import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandMarkComponent } from '@shared/components/brand-mark.component';

/** The short footer: brand, rights line, three links. Repeated on seven pages. */
@Component({
  selector: 'tf-mini-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BrandMarkComponent],
  template: `
    <footer class="tf-mini-footer" data-pattern="bottom">
      <div class="tf-shell tf-mini-footer__inner">
        <a class="tf-mini-footer__brand" routerLink="/" aria-label="Tafseel">
          <tf-brand-mark tone="auto" [width]="18" [height]="24" [eager]="false" />
        </a>
        <span class="tf-mini-footer__rights">{{ rights() }}</span>
        <nav class="tf-mini-footer__links" aria-label="Tafseel">
          <a routerLink="/about">{{ aboutLabel() }}</a>
          <a routerLink="/teachers">{{ browseLabel() }}</a>
          <a routerLink="/requests/new/open">{{ postLabel() }}</a>
        </nav>
      </div>
    </footer>
  `,
  styles: `:host { display: contents; }`
})
export class MiniFooterComponent {
  readonly rights = input.required<string>();
  readonly aboutLabel = input.required<string>();
  readonly browseLabel = input.required<string>();
  readonly postLabel = input.required<string>();
}
