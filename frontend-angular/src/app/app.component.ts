import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TestModeBannerComponent } from '@shared/layouts/test-mode-banner.component';

@Component({
  selector: 'tf-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, TestModeBannerComponent],
  template: '<tf-test-mode-banner /><router-outlet />'
})
export class AppComponent {}
