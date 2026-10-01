/**
 * Admin-published promotional slots, and the memory of what a visitor did with
 * them.
 *
 * Two separate concerns live here because the legacy page conflated them: what a
 * slot *is* (a discount, a dated event, or an announcement) and whether it may
 * be shown *again* this visit. The second one is the reason the landing page
 * does not re-open the same dialog on every refresh, so it is a rule, not a
 * storage detail.
 */

export type PromotionKind = 'discount' | 'event' | 'announcement';

/** A slot exactly as `/promotions` publishes it, in both languages. */
export interface Promotion {
  readonly id: string;
  readonly kindCode: string;
  readonly eyebrowArabic: string;
  readonly eyebrowEnglish: string;
  readonly titleArabic: string;
  readonly titleEnglish: string;
  readonly bodyArabic: string;
  readonly bodyEnglish: string;
  readonly highlightArabic: string;
  readonly highlightEnglish: string;
  readonly couponCode: string;
  readonly ctaLabelArabic: string;
  readonly ctaLabelEnglish: string;
  readonly ctaHref: string;
  readonly endsAt: string;
}

/** How the dialog opens: a big percentage, a date block, or the brand mark. */
export type PromotionLead = 'figure' | 'date' | 'mark';

export interface Countdown {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
}

/** What a visitor has already done with a campaign, for this tab session. */
export interface CampaignVisit {
  readonly dismissedIds: readonly string[];
  readonly claimedIds: readonly string[];
  readonly closedAt: string;
  /** The slots that were live when the visitor last closed the dialog. */
  readonly snapshotIds: readonly string[];
}

export const EMPTY_VISIT: CampaignVisit = {
  dismissedIds: [], claimedIds: [], closedAt: '', snapshotIds: []
};

/** Engagement fields recorded against a campaign, mirroring the legacy store. */
export type CampaignEvent = 'seenAt' | 'dismissedAt' | 'claimedAt';

export const Promotion = {
  kind(promotion: Promotion): PromotionKind {
    const code = promotion.kindCode || 'announcement';
    return code === 'discount' || code === 'event' ? code : 'announcement';
  },

  /**
   * The reader's language, falling back to the other one rather than to an
   * empty string: a slot published in Arabic only still says something to an
   * English reader.
   */
  text(arabic: string, english: string, isArabic: boolean): string {
    return (isArabic ? arabic || english : english || arabic) || '';
  },

  endsAt(promotion: Promotion): Date | null {
    if (!promotion.endsAt) return null;
    const parsed = new Date(promotion.endsAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  },

  /**
   * Time left, but only for the two kinds where a deadline is the point. An
   * announcement with an end date is not urgent, so it gets no clock.
   */
  countdown(promotion: Promotion, now: number): Countdown | null {
    const kind = Promotion.kind(promotion);
    if (kind !== 'discount' && kind !== 'event') return null;
    const ends = Promotion.endsAt(promotion);
    if (!ends) return null;
    const remaining = ends.getTime() - now;
    if (remaining <= 0) return null;
    const totalMinutes = Math.floor(remaining / 60000);
    return {
      days: Math.floor(totalMinutes / 1440),
      hours: Math.floor((totalMinutes % 1440) / 60),
      minutes: totalMinutes % 60
    };
  },

  lead(promotion: Promotion, isArabic: boolean): PromotionLead {
    const kind = Promotion.kind(promotion);
    const highlight = Promotion.text(
      promotion.highlightArabic, promotion.highlightEnglish, isArabic);
    if (kind === 'discount' && highlight) return 'figure';
    if (kind === 'event' && Promotion.endsAt(promotion)) return 'date';
    return 'mark';
  },

  /**
   * A discount slot ends on its code and its clock. The code *is* the action, so
   * a button beside it would compete with it.
   */
  showsCallToAction(promotion: Promotion, isArabic: boolean): boolean {
    return Promotion.kind(promotion) !== 'discount'
      && !!Promotion.text(promotion.ctaLabelArabic, promotion.ctaLabelEnglish, isArabic);
  }
} as const;

/**
 * A discount slot needs a redeemable code. The server suppresses inactive or expired codes;
 * the client also refuses a discount that arrived without a code.
 */
export const V1_PROMOTIONS = {
  /** Only slots a visitor can actually act on. */
  showable(promotions: readonly Promotion[]): readonly Promotion[] {
    return promotions.filter(promotion => Promotion.kind(promotion) !== 'discount' || !!promotion.couponCode);
  }
} as const;

export const Campaign = {
  /** Eligible while the visitor has neither dismissed nor claimed it. */
  isEligible(visit: CampaignVisit, campaignId: string): boolean {
    if (!campaignId) return false;
    return !visit.dismissedIds.includes(campaignId)
      && !visit.claimedIds.includes(campaignId);
  },

  eligible(visit: CampaignVisit, promotions: readonly Promotion[]): readonly Promotion[] {
    return promotions.filter(p => Campaign.isEligible(visit, p.id));
  },

  /**
   * Closing the dialog silences auto-open for the rest of this tab session, so a
   * backlog of already-published slots is not drip-fed one refresh at a time. A
   * campaign published *after* that close is new information, and still opens.
   */
  dialogCoolingDown(visit: CampaignVisit, liveIds: readonly string[]): boolean {
    if (!visit.closedAt) return false;
    if (!visit.snapshotIds.length) return true;
    return !liveIds.some(id => !!id && !visit.snapshotIds.includes(id));
  }
} as const;
