import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BrowserPreferences } from '@core/storage/browser-preferences';
import { PendingReturnStore } from './pending-return.store';

/** UX audit 2026-09-27, UX-11: the service a visitor chose survives sign-up and e-mail confirmation. */
describe('PendingReturnStore', () => {
  function store() {
    const values = new Map<string, string>();
    TestBed.configureTestingModule({
      providers: [{ provide: BrowserPreferences, useValue: {
        read: (k: string) => values.get(k) ?? null, write: (k: string, v: string) => values.set(k, v), remove: (k: string) => values.delete(k)
      } }]
    });
    return TestBed.inject(PendingReturnStore);
  }

  it('gives back the address once, then forgets it', () => {
    const pending = store();
    pending.remember('/requests/new/?teacherId=t1&teacherServiceId=s1', 1_000);
    expect(pending.take(2_000)).toBe('/requests/new/?teacherId=t1&teacherServiceId=s1');
    expect(pending.take(3_000)).toBeNull();
  });

  it('keeps nothing unsafe, and nothing older than three days', () => {
    const pending = store();
    pending.remember('https://evil.example/', 0);
    expect(pending.take(1)).toBeNull();
    pending.remember('/sessions/book', 0);
    expect(pending.take(4 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});
