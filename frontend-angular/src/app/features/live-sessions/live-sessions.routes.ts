import { Routes } from '@angular/router';
import { LiveSessionGateway } from './services/live-session.gateway';

/** A live session for its participants (J8-02, J8-05, J8-06). The API authorizes every call. */
export const LIVE_SESSION_ROUTES: Routes = [{
  path: '',
  providers: [LiveSessionGateway],
  loadComponent: () => import('./pages/live-session-page.component').then(m => m.LiveSessionPageComponent)
}];
