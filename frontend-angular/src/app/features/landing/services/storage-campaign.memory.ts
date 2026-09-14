import { Injectable, inject } from '@angular/core';
import { BrowserPreferences } from '@core/storage/browser-preferences';
import { SessionPreferences } from '@core/storage/session-preferences';
import { CampaignMemory } from '../services/landing.ports';
import { CampaignEvent, CampaignVisit, EMPTY_VISIT } from '../models/promotion';

const ENGAGEMENT_KEY = 'tafseel-campaign-engagement';
const VISIT_KEY = 'tafseel-campaign-visit';

/** Campaigns are finite, but the key is long-lived, so the store stays bounded. */
const MAX_ENGAGEMENTS = 60;

interface Engagement { seenAt?: string; dismissedAt?: string; claimedAt?: string }

function parse<T extends object>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as T
      : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Two stores, because the two questions have different lifetimes.
 *
 * *What did this visitor ever do with campaign X* is analytics-shaped and lives
 * in `localStorage`. *Have I already shown a dialog in this tab* is a property
 * of the visit and lives in `sessionStorage`, so a new tab tomorrow starts
 * clean. Merging them would either nag on every tab or silence a campaign
 * forever.
 */
@Injectable()
export class StorageCampaignMemory implements CampaignMemory {
  private readonly local = inject(BrowserPreferences);
  private readonly session = inject(SessionPreferences);

  visit(): CampaignVisit {
    const stored = parse<Partial<Record<keyof CampaignVisit, unknown>>>(
      this.session.read(VISIT_KEY), {});
    return {
      dismissedIds: this.ids(stored['dismissedIds']),
      claimedIds: this.ids(stored['claimedIds']),
      closedAt: typeof stored['closedAt'] === 'string' ? stored['closedAt'] : '',
      snapshotIds: this.ids(stored['snapshotIds'])
    };
  }

  record(campaignId: string, event: CampaignEvent): void {
    if (!campaignId) return;
    this.writeEngagement(campaignId, event);
    if (event === 'seenAt') return;

    const visit = this.visit();
    const bucket = event === 'claimedAt' ? 'claimedIds' : 'dismissedIds';
    if (visit[bucket].includes(campaignId)) return;
    this.writeVisit({ ...visit, [bucket]: [...visit[bucket], campaignId] });
  }

  rememberDialogClosed(liveIds: readonly string[]): void {
    this.writeVisit({
      ...this.visit(),
      closedAt: new Date().toISOString(),
      snapshotIds: liveIds.map(String).filter(Boolean)
    });
  }

  private ids(value: unknown): readonly string[] {
    return Array.isArray(value) ? value.map(String).filter(Boolean) : EMPTY_VISIT.dismissedIds;
  }

  private writeVisit(visit: CampaignVisit): void {
    this.session.write(VISIT_KEY, JSON.stringify(visit));
  }

  private writeEngagement(campaignId: string, event: CampaignEvent): void {
    const all = parse<Record<string, Engagement>>(this.local.read(ENGAGEMENT_KEY), {});
    all[campaignId] = { ...all[campaignId], [event]: new Date().toISOString() };

    const ids = Object.keys(all);
    if (ids.length > MAX_ENGAGEMENTS) {
      ids
        .sort((a, b) => String(all[a]?.seenAt ?? '').localeCompare(String(all[b]?.seenAt ?? '')))
        .slice(0, ids.length - MAX_ENGAGEMENTS)
        .forEach(id => delete all[id]);
    }
    this.local.write(ENGAGEMENT_KEY, JSON.stringify(all));
  }
}
