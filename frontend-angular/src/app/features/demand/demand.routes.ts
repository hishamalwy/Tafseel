import { Provider } from '@angular/core';
import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '@shared/utils/unsaved-changes';
import { DEMAND_GATEWAY } from './services/demand.ports';
import { HttpDemandGateway } from './services/http-demand.gateway';
import {
  LoadMyOffers, LoadOffers, LoadOpenRequestForm, LoadOpportunity, LoadRequest, ManageOffer, ManageRequest, OpenRequestDrafts,
  PublishOpenRequest, SelectOffer
} from './services/demand.use-cases';

/**
 * Learning requests and the open marketplace (J4-01, J4-05, J4-07, J4-08 entry). Bindings load
 * with the screens; the parent routes require a signed-in user of the right role and the API
 * authorizes every call.
 */
const providers: Provider[] = [HttpDemandGateway, { provide: DEMAND_GATEWAY, useExisting: HttpDemandGateway }];

export const OPEN_REQUEST_ROUTES: Routes = [{
  path: '',
  canDeactivate: [unsavedChangesGuard],
  providers: [...providers, LoadOpenRequestForm, PublishOpenRequest, OpenRequestDrafts],
  loadComponent: () => import('./pages/open-request-page.component').then(m => m.OpenRequestPageComponent)
}];

export const REQUEST_ROUTES: Routes = [{
  path: '',
  providers: [...providers, LoadRequest, ManageRequest],
  loadComponent: () => import('./pages/request-detail-page.component').then(m => m.RequestDetailPageComponent)
}];

export const OFFERS_ROUTES: Routes = [{
  path: '',
  providers: [...providers, LoadOffers, SelectOffer],
  loadComponent: () => import('./pages/offers-page.component').then(m => m.OffersPageComponent)
}];

export const MY_OFFERS_ROUTES: Routes = [{
  path: '',
  providers: [...providers, LoadMyOffers],
  loadComponent: () => import('./pages/my-offers-page.component').then(m => m.MyOffersPageComponent)
}];

export const OPPORTUNITY_ROUTES: Routes = [{
  path: '',
  providers: [...providers, LoadOpportunity, ManageOffer],
  loadComponent: () => import('./pages/opportunity-page.component').then(m => m.OpportunityPageComponent)
}];
