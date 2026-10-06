import { mergeApplicationConfig, ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { LocaleService } from '@core/i18n/locale.service';
import ar from '../../public/locale/ar.json';
import en from '../../public/locale/en.json';

const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(withRoutes(serverRoutes)), provideAppInitializer(() => {
    const locale = inject(LocaleService);
    locale.seed(locale.lang(), locale.lang() === 'ar' ? ar : en);
  })]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
