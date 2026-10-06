import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, timeout } from 'rxjs';
import { CatalogService, FeaturedSubject, FeaturedTeacher, PlatformStats } from '../models/featured';
import {
  CAMPAIGN_MEMORY, JourneyOffer, LANDING_GATEWAY, STUDENT_JOURNEY_GATEWAY
} from './landing.ports';
import { Campaign, CampaignEvent, Promotion, V1_PROMOTIONS } from '../models/promotion';
import { StudentJourney, projectStudentJourney } from '@shared/models/student-journey';

/** What one landing page load produces. Any part may be missing. */
export interface LandingContent {
  readonly subjects: readonly FeaturedSubject[] | null;
  readonly teachers: readonly FeaturedTeacher[] | null;
  readonly services: readonly CatalogService[] | null;
  readonly promotions: readonly Promotion[];
  readonly stats: PlatformStats | null;
}

/**
 * The five public reads, settled independently.
 *
 * Publish each section as it settles; optional reads must not hide ready
 * discovery content. Failed reads are null, successful empty lists stay empty.
 */
@Injectable({ providedIn: 'root' })
export class LoadLandingContent {
  private readonly gateway = inject(LANDING_GATEWAY);

  async execute(publish?: (section: Partial<LandingContent>) => void): Promise<LandingContent> {
    const settle = async <K extends keyof LandingContent>(
      key: K, request: Observable<LandingContent[K]>, fallback: LandingContent[K]
    ): Promise<LandingContent[K]> => {
      let value: LandingContent[K];
      try {
        value = await firstValueFrom(request.pipe(timeout(10_000)));
      } catch {
        value = fallback;
      }
      publish?.({ [key]: value } as Partial<LandingContent>);
      return value;
    };
    const [subjects, teachers, services, promotions, stats] = await Promise.all([
      settle('subjects', this.gateway.featuredSubjects(4), null),
      settle('teachers', this.gateway.featuredTeachers(3), null),
      settle('services', this.gateway.services(), null),
      settle('promotions', this.gateway.promotions(), []),
      settle('stats', this.gateway.platformStats(), null)
    ]);
    return { subjects, teachers, services, promotions, stats };
  }
}

/** Loaded, failed, or not applicable — never collapsed into "you have none". */
export type JourneyState = 'idle' | 'loading' | 'ready' | 'error';

export interface StudentJourneyResult {
  readonly state: JourneyState;
  readonly journey: StudentJourney | null;
  /** The offer the payment reservation actually locked, when there is one. */
  readonly selectedOffer: JourneyOffer | null;
}

/**
 * A Student's own live requests, for the contextual module below the fold.
 *
 * Only Students have requests to continue, so no other role pays for this call.
 * A failure is reported as `error` and never as an empty journey: telling a
 * Student they have no requests because a fetch failed is a fabricated state.
 */
@Injectable({ providedIn: 'root' })
export class LoadStudentJourney {
  private readonly gateway = inject(STUDENT_JOURNEY_GATEWAY);

  async execute(roles: readonly string[]): Promise<StudentJourneyResult> {
    if (!roles.includes('Student')) {
      return { state: 'idle', journey: null, selectedOffer: null };
    }

    try {
      const rows = await firstValueFrom(this.gateway.myRequests());
      const journey = projectStudentJourney(rows);
      return {
        state: 'ready',
        journey,
        selectedOffer: await this.lockedOffer(rows, journey)
      };
    } catch {
      return { state: 'error', journey: null, selectedOffer: null };
    }
  }

  /**
   * The locked commercial terms live on the selected Offer, not on the request,
   * so this costs one extra call for the one request that needs it. If it fails
   * the module still renders — without a price, rather than with a guessed one.
   */
  private async lockedOffer(
    rows: readonly { id: string; selectedOfferId: string }[], journey: StudentJourney
  ): Promise<JourneyOffer | null> {
    const pending = journey.actionRequired;
    if (!pending) return null;
    try {
      const offers = await firstValueFrom(this.gateway.offers(pending.id));
      const selectedId = rows.find(row => row.id === pending.id)?.selectedOfferId;
      return offers.find(offer => offer.id === selectedId) ?? null;
    } catch {
      return null;
    }
  }
}

/**
 * Which campaign, if any, may present itself — and the record of what happened
 * to it.
 *
 * The published slots arrive in display order, so the first the visitor has
 * neither dismissed nor claimed is the primary campaign. The rest stay available
 * on the Offers surface rather than queueing behind this dialog.
 */
@Injectable({ providedIn: 'root' })
export class Campaigns {
  private readonly memory = inject(CAMPAIGN_MEMORY);

  /**
   * The first eligible published slot. A discount without a code cannot be redeemed.
   */
  primary(promotions: readonly Promotion[]): Promotion | null {
    return Campaign.eligible(this.memory.visit(), V1_PROMOTIONS.showable(promotions))[0] ?? null;
  }

  /** True when the dialog should stay shut for the rest of this tab session. */
  coolingDown(promotions: readonly Promotion[]): boolean {
    return Campaign.dialogCoolingDown(this.memory.visit(), promotions.map(p => p.id));
  }

  record(campaignId: string, event: CampaignEvent): void {
    this.memory.record(campaignId, event);
  }

  /** Taking a code, or following the campaign's own link, counts as claiming it. */
  claim(promotion: Promotion, liveIds: readonly string[]): void {
    this.memory.record(promotion.id, 'claimedAt');
    this.memory.rememberDialogClosed(liveIds);
  }

  dismiss(promotion: Promotion | null, liveIds: readonly string[]): void {
    if (promotion) this.memory.record(promotion.id, 'dismissedAt');
    this.memory.rememberDialogClosed(liveIds);
  }
}
