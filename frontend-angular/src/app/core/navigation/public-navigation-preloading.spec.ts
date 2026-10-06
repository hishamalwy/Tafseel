import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PublicNavigationPreloading } from './public-navigation-preloading';

describe('public navigation preloading', () => {
  it('warms public destinations without loading protected workspaces', () => {
    const strategy = TestBed.inject(PublicNavigationPreloading);
    const loaded: string[] = [];
    for (const path of ['about', 'teachers', 'teachers/:teacherId', 'auth', 'admin/:section', 'teacher/services']) {
      strategy.preload({ path }, () => { loaded.push(path); return of(null); }).subscribe();
    }
    expect(loaded).toEqual(['about', 'teachers', 'teachers/:teacherId', 'auth']);
  });

  it('does not request route bundles during server rendering', () => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    let loaded = false;
    TestBed.inject(PublicNavigationPreloading).preload({ path: 'about' }, () => { loaded = true; return of(null); }).subscribe();
    expect(loaded).toBe(false);
  });
});
