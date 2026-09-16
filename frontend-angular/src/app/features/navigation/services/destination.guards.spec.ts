import { EnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { Role } from '@core/auth/models/role';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { adminOperationsTabGuard, disputeLinkGuard, marketplaceLinkGuard, teacherReviewLinkGuard } from './destination.guards';

function setup(roles: readonly Role[]) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: SignalSessionStore, useValue: { roles: signal(roles) } }]
  });
}

async function run(guard: CanActivateFn, params: Record<string, string>, query: Record<string, string> = {}): Promise<string> {
  const route = { paramMap: convertToParamMap(params), queryParamMap: convertToParamMap(query) } as ActivatedRouteSnapshot;
  const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () => guard(route, {} as RouterStateSnapshot));
  return TestBed.inject(Router).serializeUrl(await result as UrlTree);
}

describe('link guards', () => {
  it('keeps dispute ids and older operations tabs', async () => {
    setup(['Admin']);
    expect(await run(disputeLinkGuard, { disputeId: 'd1' })).toBe('/disputes?selectedId=d1');
    expect(await run(adminOperationsTabGuard, { tab: 'sessions' })).toBe('/admin/operations?tab=sessions');
  });

  it('forwards the retired /requests page by role and keeps a stored request id (UX-05)', async () => {
    const id = '8f14e45f-ceea-467a-9575-3b1f3f0f5a21';
    setup(['Student']);
    expect(await run(marketplaceLinkGuard, {})).toBe('/requests/new');
    expect(await run(marketplaceLinkGuard, {}, { requestId: id })).toBe(`/requests/${id}`);
    TestBed.resetTestingModule();
    setup(['Teacher']);
    expect(await run(marketplaceLinkGuard, {})).toBe('/teacher/opportunities');
    expect(await run(marketplaceLinkGuard, {}, { requestId: id })).toBe(`/teacher/opportunities/${id}`);
  });

  it('opens a teacher review on the reviews tab', async () => {
    setup(['Teacher']);
    expect(await run(teacherReviewLinkGuard, { reviewId: 'v1' })).toBe('/teacher/qualifications?tab=reviews&reviewId=v1');
  });
});
