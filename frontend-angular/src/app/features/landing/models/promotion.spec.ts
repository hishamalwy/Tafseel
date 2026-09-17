import { describe, expect, it } from 'vitest';
import {
  Campaign, CampaignVisit, EMPTY_VISIT, Promotion, V1_PROMOTIONS
} from './promotion';

const NOW = Date.parse('2026-03-01T12:00:00Z');

function promotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: 'p1',
    kindCode: 'announcement',
    eyebrowArabic: '', eyebrowEnglish: '',
    titleArabic: 'عنوان', titleEnglish: 'Title',
    bodyArabic: '', bodyEnglish: '',
    highlightArabic: '', highlightEnglish: '',
    couponCode: '',
    ctaLabelArabic: '', ctaLabelEnglish: '',
    ctaHref: '',
    endsAt: '',
    ...overrides
  };
}

function visit(overrides: Partial<CampaignVisit> = {}): CampaignVisit {
  return { ...EMPTY_VISIT, ...overrides };
}

describe('Promotion.text', () => {
  it('falls back to the other language rather than to an empty string', () => {
    expect(Promotion.text('', 'English only', true)).toBe('English only');
    expect(Promotion.text('عربي فقط', '', false)).toBe('عربي فقط');
  });

  it('prefers the reader’s language when both are published', () => {
    expect(Promotion.text('عربي', 'English', true)).toBe('عربي');
    expect(Promotion.text('عربي', 'English', false)).toBe('English');
  });
});

describe('Promotion.kind', () => {
  it('treats an unknown or missing kind as an announcement', () => {
    expect(Promotion.kind(promotion({ kindCode: 'flash-sale' }))).toBe('announcement');
    expect(Promotion.kind(promotion({ kindCode: '' }))).toBe('announcement');
  });
});

describe('Promotion.countdown', () => {
  const soon = new Date(NOW + (2 * 1440 + 3 * 60 + 7) * 60000).toISOString();

  it('splits the remaining time into days, hours and minutes', () => {
    const parts = Promotion.countdown(promotion({ kindCode: 'discount', endsAt: soon }), NOW);
    expect(parts).toEqual({ days: 2, hours: 3, minutes: 7 });
  });

  it('gives an announcement no clock, even when it carries an end date', () => {
    expect(Promotion.countdown(promotion({ endsAt: soon }), NOW)).toBeNull();
  });

  it('gives no clock once the deadline has passed', () => {
    const past = new Date(NOW - 60000).toISOString();
    expect(Promotion.countdown(promotion({ kindCode: 'discount', endsAt: past }), NOW)).toBeNull();
  });

  it('gives no clock for an unparseable date rather than a negative one', () => {
    const broken = promotion({ kindCode: 'event', endsAt: 'not a date' });
    expect(Promotion.countdown(broken, NOW)).toBeNull();
  });
});

describe('Promotion.lead', () => {
  it('leads a discount with its figure, when it has one', () => {
    const p = promotion({ kindCode: 'discount', highlightEnglish: '25%' });
    expect(Promotion.lead(p, false)).toBe('figure');
  });

  it('falls back to the brand mark when a discount publishes no figure', () => {
    expect(Promotion.lead(promotion({ kindCode: 'discount' }), false)).toBe('mark');
  });

  it('leads a dated event with its date', () => {
    const p = promotion({ kindCode: 'event', endsAt: new Date(NOW).toISOString() });
    expect(Promotion.lead(p, false)).toBe('date');
  });
});

describe('Promotion.showsCallToAction', () => {
  it('is suppressed on a discount, whose code is already the action', () => {
    const p = promotion({ kindCode: 'discount', ctaLabelEnglish: 'Shop now' });
    expect(Promotion.showsCallToAction(p, false)).toBe(false);
  });

  it('shows on any other kind that published a label', () => {
    const p = promotion({ kindCode: 'event', ctaLabelEnglish: 'Reserve a seat' });
    expect(Promotion.showsCallToAction(p, false)).toBe(true);
  });

  it('is suppressed when no label was published, whatever the kind', () => {
    expect(Promotion.showsCallToAction(promotion(), false)).toBe(false);
  });
});

describe('Campaign eligibility', () => {
  it('drops a campaign the visitor dismissed or claimed this visit', () => {
    const state = visit({ dismissedIds: ['a'], claimedIds: ['b'] });
    const all = [promotion({ id: 'a' }), promotion({ id: 'b' }), promotion({ id: 'c' })];
    expect(Campaign.eligible(state, all).map(p => p.id)).toEqual(['c']);
  });

  it('never treats a campaign with no id as eligible', () => {
    expect(Campaign.isEligible(EMPTY_VISIT, '')).toBe(false);
  });
});

describe('Campaign.dialogCoolingDown', () => {
  it('does not cool down before the visitor has closed anything', () => {
    expect(Campaign.dialogCoolingDown(EMPTY_VISIT, ['a'])).toBe(false);
  });

  it('stays shut for slots that were already live when the dialog was closed', () => {
    const state = visit({ closedAt: '2026-03-01T11:00:00Z', snapshotIds: ['a', 'b'] });
    expect(Campaign.dialogCoolingDown(state, ['a', 'b'])).toBe(true);
    // Fewer live slots than the snapshot is still nothing new.
    expect(Campaign.dialogCoolingDown(state, ['a'])).toBe(true);
  });

  it('opens again for a slot published after that close', () => {
    const state = visit({ closedAt: '2026-03-01T11:00:00Z', snapshotIds: ['a'] });
    expect(Campaign.dialogCoolingDown(state, ['a', 'brand-new'])).toBe(false);
  });

  it('stays shut when the close recorded no snapshot at all', () => {
    const state = visit({ closedAt: '2026-03-01T11:00:00Z' });
    expect(Campaign.dialogCoolingDown(state, ['a'])).toBe(true);
  });
});

describe('UX-07 what V1 may promise', () => {
  it('keeps only slots a visitor can act on', () => {
    const discount = promotion({ id: 'sale', kindCode: 'discount', couponCode: 'TAFSEEL20' });
    const feature = promotion({ id: 'feature', kindCode: 'announcement' });
    const event = promotion({ id: 'event', kindCode: 'event' });
    // A discount ends on a coupon code, and V1 checkout cannot redeem one.
    expect(V1_PROMOTIONS.showable([discount, feature, event]).map(p => p.id)).toEqual(['feature', 'event']);
    expect(V1_PROMOTIONS.showable([discount])).toEqual([]);
    expect(V1_PROMOTIONS.showable([])).toEqual([]);
  });

  it('does not judge a promotion by whether it carries a code', () => {
    // A non-discount slot with a code is still showable — it just never renders the code.
    const announcement = promotion({ id: 'with-code', kindCode: 'announcement', couponCode: 'TAFSEEL20' });
    expect(V1_PROMOTIONS.showable([announcement]).map(p => p.id)).toEqual(['with-code']);
  });
});
