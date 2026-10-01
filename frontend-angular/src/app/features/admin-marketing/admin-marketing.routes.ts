import { Routes } from '@angular/router';
import { ADMIN_MARKETING_GATEWAY } from './services/admin-marketing.ports';
import { HttpAdminMarketingGateway } from './services/http-admin-marketing.gateway';
import { AdminMarketing } from './services/admin-marketing.use-cases';

export const ADMIN_MARKETING_ROUTES: Routes = [{
  path: '',
  providers: [HttpAdminMarketingGateway,
    { provide: ADMIN_MARKETING_GATEWAY, useExisting: HttpAdminMarketingGateway }, AdminMarketing],
  loadComponent: () => import('./pages/admin-marketing-page.component').then(m => m.AdminMarketingPageComponent)
}];
