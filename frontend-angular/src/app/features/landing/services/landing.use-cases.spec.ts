import { TestBed } from '@angular/core/testing';
import { NEVER, Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANDING_GATEWAY, LandingGateway } from './landing.ports';
import { LandingContent, LoadLandingContent } from './landing.use-cases';
import { PlatformStats } from '../models/featured';

function loader(over: Partial<LandingGateway> = {}) {
  TestBed.configureTestingModule({ providers: [{ provide: LANDING_GATEWAY, useValue: {
    featuredSubjects: () => of([]), featuredTeachers: () => of([]), services: () => of([]),
    promotions: () => of([]), platformStats: () => of(null), ...over
  } }] });
  return TestBed.inject(LoadLandingContent);
}

describe('Landing content delivery', () => {
  afterEach(() => vi.useRealTimers());

  it('publishes ready discovery before slow statistics and preserves empty versus failed services', async () => {
    const stats = new Subject<PlatformStats | null>();
    const published: Partial<LandingContent>[] = [];
    const loading = loader({ platformStats: () => stats }).execute(section => published.push(section));
    await Promise.resolve();
    expect(published).toContainEqual({ teachers: [] });
    expect(published).toContainEqual({ services: [] });
    expect(published.some(section => 'stats' in section)).toBe(false);
    stats.next(null);
    expect((await loading).services).toEqual([]);

    TestBed.resetTestingModule();
    expect((await loader({ services: () => throwError(() => new Error('offline')) }).execute()).services).toBeNull();
  });

  it('settles a read that never responds instead of keeping the page pending indefinitely', async () => {
    vi.useFakeTimers();
    const loading = loader({ platformStats: () => NEVER }).execute();
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await loading).stats).toBeNull();
  });
});
