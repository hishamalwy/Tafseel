import { Provider } from '@angular/core';
import {
  ACCOUNT_GATEWAY, SESSION_GATEWAY, SESSION_STORE, TEACHER_LIFECYCLE_GATEWAY
} from '@core/auth/services/auth.ports';
import { HttpAccountGateway } from '@core/auth/services/http-account.gateway';
import { HttpSessionGateway } from '@core/auth/services/http-session.gateway';
import { HttpTeacherLifecycleGateway } from '@core/auth/services/http-teacher-lifecycle.gateway';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { POLICY_REPOSITORY } from '@features/policies/services/policy.ports';
import {
  DRAFT_STORE, MARKETPLACE_GATEWAY, REQUEST_GATEWAY
} from '@features/requests/services/request.ports';
import {
  HttpMarketplaceGateway, HttpRequestGateway, LocalDraftStore
} from '@features/requests/services/http-request.gateway';
import {
  CATALOG_GATEWAY, FAVOURITES_GATEWAY, TEACHER_GATEWAY
} from '@features/teachers/services/teacher.ports';
import {
  HttpCatalogGateway, HttpFavouritesGateway, HttpTeacherGateway
} from '@features/teachers/services/http-teacher.gateway';
import {
  BOOKING_GATEWAY, MOCK_CHECKOUT_GATEWAY, PAYABLE_GATEWAY, PAYMENT_GATEWAY
} from '@features/checkout/services/checkout.ports';
import {
  HttpBookingGateway, HttpMockCheckoutGateway, HttpPayableGateway, HttpPaymentGateway
} from '@features/checkout/services/http-checkout.gateway';
import {
  DISPUTE_ADMIN_GATEWAY, DISPUTE_GATEWAY
} from '@features/disputes/services/dispute.ports';
import {
  HttpDisputeAdminGateway, HttpDisputeGateway
} from '@features/disputes/services/http-dispute.gateway';
import { StaticPolicyRepository } from '@features/policies/services/static-policy.repository';
import {
  CAMPAIGN_MEMORY, LANDING_GATEWAY, STUDENT_JOURNEY_GATEWAY
} from '@features/landing/services/landing.ports';
import {
  HttpLandingGateway, HttpStudentJourneyGateway
} from '@features/landing/services/http-landing.gateway';
import { StorageCampaignMemory } from '@features/landing/services/storage-campaign.memory';
import { TEACH_GATEWAY } from '@features/teach/services/teach.ports';
import { HttpTeachGateway } from '@features/teach/services/http-teach.gateway';

/** App-wide bindings for services that use an injection token. */
export const appProviders: Provider[] = [
  SignalSessionStore,
  { provide: SESSION_STORE, useExisting: SignalSessionStore },

  HttpSessionGateway,
  { provide: SESSION_GATEWAY, useExisting: HttpSessionGateway },

  HttpAccountGateway,
  { provide: ACCOUNT_GATEWAY, useExisting: HttpAccountGateway },

  HttpTeacherLifecycleGateway,
  { provide: TEACHER_LIFECYCLE_GATEWAY, useExisting: HttpTeacherLifecycleGateway },

  StaticPolicyRepository,
  { provide: POLICY_REPOSITORY, useExisting: StaticPolicyRepository },

  HttpDisputeGateway,
  { provide: DISPUTE_GATEWAY, useExisting: HttpDisputeGateway },

  HttpDisputeAdminGateway,
  { provide: DISPUTE_ADMIN_GATEWAY, useExisting: HttpDisputeAdminGateway },

  HttpPayableGateway,
  { provide: PAYABLE_GATEWAY, useExisting: HttpPayableGateway },

  HttpPaymentGateway,
  { provide: PAYMENT_GATEWAY, useExisting: HttpPaymentGateway },

  HttpMockCheckoutGateway,
  { provide: MOCK_CHECKOUT_GATEWAY, useExisting: HttpMockCheckoutGateway },

  HttpBookingGateway,
  { provide: BOOKING_GATEWAY, useExisting: HttpBookingGateway },

  HttpTeacherGateway,
  { provide: TEACHER_GATEWAY, useExisting: HttpTeacherGateway },

  HttpCatalogGateway,
  { provide: CATALOG_GATEWAY, useExisting: HttpCatalogGateway },

  HttpFavouritesGateway,
  { provide: FAVOURITES_GATEWAY, useExisting: HttpFavouritesGateway },

  HttpRequestGateway,
  { provide: REQUEST_GATEWAY, useExisting: HttpRequestGateway },

  HttpMarketplaceGateway,
  { provide: MARKETPLACE_GATEWAY, useExisting: HttpMarketplaceGateway },

  LocalDraftStore,
  { provide: DRAFT_STORE, useExisting: LocalDraftStore },

  HttpLandingGateway,
  { provide: LANDING_GATEWAY, useExisting: HttpLandingGateway },

  HttpStudentJourneyGateway,
  { provide: STUDENT_JOURNEY_GATEWAY, useExisting: HttpStudentJourneyGateway },

  StorageCampaignMemory,
  { provide: CAMPAIGN_MEMORY, useExisting: StorageCampaignMemory },

  HttpTeachGateway,
  { provide: TEACH_GATEWAY, useExisting: HttpTeachGateway }
];
