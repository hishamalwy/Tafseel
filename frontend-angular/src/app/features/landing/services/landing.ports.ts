import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { CatalogService, FeaturedSubject, FeaturedTeacher, PlatformStats } from '../models/featured';
import { CampaignEvent, CampaignVisit, Promotion } from '../models/promotion';
import { StudentRequestRow } from '@shared/models/student-journey';

/** The five public reads the landing page opens with. */
export interface LandingGateway {
  featuredSubjects(take: number): Observable<readonly FeaturedSubject[]>;
  featuredTeachers(take: number): Observable<readonly FeaturedTeacher[]>;
  services(): Observable<readonly CatalogService[]>;
  promotions(): Observable<readonly Promotion[]>;
  platformStats(): Observable<PlatformStats | null>;
}

/** A signed-in Student's own requests, and the offer their reservation locked. */
export interface StudentJourneyGateway {
  myRequests(): Observable<readonly StudentRequestRow[]>;
  offers(requestId: string): Observable<readonly JourneyOffer[]>;
}

export interface JourneyOffer {
  readonly id: string;
  readonly amount: number | null;
  readonly currency: string;
  readonly deliveryHours: number | null;
  readonly teacherDisplayName: string;
  readonly teacherDisplayNameEnglish: string;
}

/**
 * What the visitor has already done with the published campaigns.
 *
 * Split from the gateway because it is not a read of Tafseel's data: it is this
 * browser's memory of this visit, and on the server it has none.
 */
export interface CampaignMemory {
  visit(): CampaignVisit;
  record(campaignId: string, event: CampaignEvent): void;
  rememberDialogClosed(liveIds: readonly string[]): void;
}

export const LANDING_GATEWAY = new InjectionToken<LandingGateway>('LandingGateway');
export const STUDENT_JOURNEY_GATEWAY =
  new InjectionToken<StudentJourneyGateway>('StudentJourneyGateway');
export const CAMPAIGN_MEMORY = new InjectionToken<CampaignMemory>('CampaignMemory');
