import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig, PLATFORM_ID, inject, provideAppInitializer,
  provideBrowserGlobalErrorListeners, provideZonelessChangeDetection
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withPreloading } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { InteractionMotion } from '@core/a11y/interaction-motion.service';
import { RestoreSession } from '@core/auth/services/restore-session.use-case';
import { authRetryInterceptor, authTokenInterceptor } from '@core/http/interceptors';
import { LocaleService } from '@core/i18n/locale.service';
import { ThemeService } from '@core/theme/theme.service';
import { PublicNavigationPreloading } from '@core/navigation/public-navigation-preloading';
import { trailingSlashUrlSerializer } from '@core/http/trailing-slash-url-serializer';
import { appProviders } from './app.providers';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Signals drive every component here, so there is nothing for zone.js to do.
    provideZonelessChangeDetection(),

    provideRouter(
      routes,
      withComponentInputBinding(),
      withPreloading(PublicNavigationPreloading),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })
    ),
    trailingSlashUrlSerializer,

    provideHttpClient(withInterceptors([authTokenInterceptor, authRetryInterceptor])),

    ...appProviders,

    // Resolve theme, language and session before the first route activates, so
    // guards never guess and the app does not flash a logged-out shell.
    provideAppInitializer(() => {
      // Every inject() here runs while the injection context is still open;
      // resolving them before the promise is what keeps that true.
      const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
      inject(ThemeService);
      inject(InteractionMotion);
      const locale = inject(LocaleService);
      const restore = inject(RestoreSession);

      // On the server there is no refresh cookie to exchange and no reason to
      // block a prerender on the API answering. Both are browser concerns.
      if (!isBrowser) return Promise.resolve();

      return Promise.all([
        locale.load(locale.lang()),
        // A missing session is a normal outcome, so this settles either way
        // rather than failing the bootstrap.
        firstValueFrom(restore.execute()).catch(() => null)
      ]);
    })
  ]
};
