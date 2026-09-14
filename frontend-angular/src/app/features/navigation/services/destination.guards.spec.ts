import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { Role } from '@core/auth/models/role';
import { SignalSessionStore } from '@core/auth/services/session.store';
import {
  adminOperationsTabGuard, conversationLinkGuard, disputeLinkGuard, liveSessionLinkGuard, requestLinkGuard
} from './destination.guards';

function setup(roles: readonly Role[]) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: SignalSessionStore, useValue: { roles: signal(roles) } }
    ]
  });
  return { http: TestBed.inject(HttpTestingController), router: TestBed.inject(Router) };
}

async function run(guard: CanActivateFn, params: Record<string, string>): Promise<string> {
  const route = { paramMap: convertToParamMap(params) } as ActivatedRouteSnapshot;
  const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () => guard(route, {} as RouterStateSnapshot));
  const tree = await result as UrlTree;
  return TestBed.inject(Router).serializeUrl(tree);
}

describe('link guards', () => {
  it('turns a live-session link into the student sessions list, keeping the id', async () => {
    setup(['Student']);
    expect(await run(liveSessionLinkGuard, { sessionId: 'abc' })).toBe('/student/sessions?sessionId=abc');
  });

  it('turns a conversation link into the teacher inbox', async () => {
    setup(['Teacher']);
    expect(await run(conversationLinkGuard, { conversationId: 'c-1' })).toBe('/teacher/messages?conversationId=c-1');
  });

  it('asks the API which kind of request a teacher link names', async () => {
    const { http } = setup(['Teacher']);
    const pending = run(requestLinkGuard(false), { requestId: 'r 1' });
    http.expectOne('/api/v1/learning-requests/r%201').flush({ sourcingMode: 0 });
    expect(await pending).toBe('/teacher/work?tab=requests&requestId=r%201');
    http.verify();
  });

  it('falls back to the opportunities list when the request cannot be read', async () => {
    const { http } = setup(['Teacher']);
    const pending = run(requestLinkGuard(false), { requestId: 'r2' });
    http.expectOne('/api/v1/learning-requests/r2').flush(null, { status: 404, statusText: 'Not Found' });
    expect(await pending).toBe('/teacher/opportunities?requestId=r2');
  });

  it('opens a student offers link on the marketplace without a lookup', async () => {
    const { http } = setup(['Student']);
    expect(await run(requestLinkGuard(true), { requestId: 'r3' })).toBe('/requests?requestId=r3');
    http.verify();
  });

  it('keeps dispute ids and older operations tabs', async () => {
    setup(['Admin']);
    expect(await run(disputeLinkGuard, { disputeId: 'd1' })).toBe('/disputes?selectedId=d1');
    expect(await run(adminOperationsTabGuard, { tab: 'sessions' })).toBe('/admin/operations?tab=sessions');
  });
});
