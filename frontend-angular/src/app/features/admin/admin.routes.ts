import { Provider } from '@angular/core';
import { Routes } from '@angular/router';
import { ADMIN_CATALOG_GATEWAY } from './services/admin-catalog.ports';
import { HttpAdminCatalogGateway } from './services/http-admin-catalog.gateway';
import { LoadCatalog, ManageCatalog } from './services/admin-catalog.use-cases';

/**
 * The Admin catalog (J13-01..03): services and their price policy, subjects, qualification topics,
 * specialist topics, education levels and teaching languages. The parent route requires the Admin role;
 * the API authorizes every call with Subjects.Manage / Topics.Manage regardless.
 */
const providers: Provider[] = [
  HttpAdminCatalogGateway,
  { provide: ADMIN_CATALOG_GATEWAY, useExisting: HttpAdminCatalogGateway },
  LoadCatalog,
  ManageCatalog
];

export const CATALOG_ROUTES: Routes = [{
  path: '',
  providers,
  loadComponent: () => import('./pages/admin-catalog-page.component').then(m => m.AdminCatalogPageComponent)
}];
