import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';

/** The sections that moved to their own screens keep links stored before the move working. */
describe('moved workspace links', () => {
  const setup = () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    return { router: TestBed.inject(Router), injector: TestBed.inject(EnvironmentInjector) };
  };
  const route = (path: string) => routes.find(r => r.path === path)!;
  const serialize = (router: Router, result: unknown) => result instanceof UrlTree ? router.serializeUrl(result) : result;

  it.each([
    [{ tab: 'applications', selectedId: 'a1' }, '/quality/applications/a1'],
    [{ tab: 'applications' }, '/quality/applications'],
    [{ tab: 'additional' }, '/quality/applications'],
    [{ tab: 'showcases', selectedId: 's1' }, '/quality/showcases?selectedId=s1']
  ])('/quality/review %o goes to %s', (queryParams, target) => {
    const { router, injector } = setup();
    const redirect = route('quality/review').redirectTo as (data: { queryParams: Record<string, string> }) => unknown;
    expect(serialize(router, injector.runInContext(() => redirect({ queryParams })))).toBe(target);
  });

  it.each([
    ['teacher/profile', { tab: 'videos' }, '/teacher/qualifications?tab=videos'],
    ['teacher/profile', { tab: 'reviews', reviewId: 'r1' }, '/teacher/qualifications?tab=reviews&reviewId=r1'],
    ['teacher/profile', {}, true],
    ['teacher/profile', { tab: 'details' }, true],
    ['teacher/services', { tab: 'availability' }, '/teacher/availability?tab=availability'],
    ['teacher/services', { tab: 'catalog' }, true]
  ])('%s %o resolves to %s', (path, queryParams, expected) => {
    const { router, injector } = setup();
    const moved = route(path).canActivate!.at(-1) as CanActivateFn;
    const snapshot = { queryParams, queryParamMap: convertToParamMap(queryParams) } as unknown as ActivatedRouteSnapshot;
    const result = injector.runInContext(() => moved(snapshot, {} as RouterStateSnapshot));
    expect(serialize(router, result)).toBe(expected);
  });

  it('declares the dedicated screens ahead of the generic dashboard section', () => {
    const order = (path: string) => routes.findIndex(r => r.path === path);
    for (const path of ['teacher/profile', 'teacher/services', 'teacher/availability', 'teacher/publication'])
      expect(order(path)).toBeLessThan(order('teacher/:section'));
    for (const path of ['quality/applications', 'quality/applications/:applicationId', 'quality/review'])
      expect(order(path)).toBeLessThan(order('quality/:section'));
  });
});
