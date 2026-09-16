import { Routes } from '@angular/router';
import { HttpEarningsGateway } from './services/http-earnings.gateway';
import { EARNINGS_GATEWAY } from './services/earnings.ports';
import { LoadEarnings } from './services/earnings.use-cases';

/**
 * The teacher's earnings screen (FIN-01). The parent route requires the Teacher role; the API
 * authorizes every call to the signed-in teacher's own balances regardless.
 */
export const EARNINGS_ROUTES: Routes = [{
  path: '',
  providers: [
    HttpEarningsGateway,
    { provide: EARNINGS_GATEWAY, useExisting: HttpEarningsGateway },
    LoadEarnings
  ],
  loadComponent: () => import('./pages/teacher-earnings-page.component').then(m => m.TeacherEarningsPageComponent)
}];
