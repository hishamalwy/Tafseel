import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

/**
 * Angular 22 hands the server bootstrap a context; it has to be threaded
 * through or the platform is never created (NG0401).
 */
export default (context: BootstrapContext) =>
  bootstrapApplication(AppComponent, config, context);
