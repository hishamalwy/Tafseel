import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { Session } from '@core/auth/models/session';
import { SESSION_GATEWAY, SESSION_STORE } from '@core/auth/services/auth.ports';
import { HttpSessionGateway } from '@core/auth/services/http-session.gateway';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { authRetryInterceptor, authTokenInterceptor } from './interceptors';

const SIGNED_IN: Session = {
  userId: 'u1', email: 'reader@example.test', fullName: 'Reader', fullNameEnglish: 'Reader',
  roles: ['Student'], hasAvatar: false, mfaEnabled: false,
  accessToken: 'expired-token', accessTokenExpiresAt: '2030-01-01T00:00:00Z'
};

const REFRESHED = {
  userId: 'u1', email: 'reader@example.test', fullName: 'Reader', fullNameEnglish: 'Reader',
  roles: ['Student'], hasAvatar: false, mfaEnabled: false,
  accessToken: 'fresh-token', accessTokenExpiresAt: '2030-01-01T01:00:00Z'
};

/** The real interceptors, gateway and store over a fake backend (G-19). */
describe('refresh on 401', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let store: SignalSessionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authTokenInterceptor, authRetryInterceptor])),
        provideHttpClientTesting(),
        SignalSessionStore, HttpSessionGateway,
        { provide: SESSION_GATEWAY, useExisting: HttpSessionGateway },
        { provide: SESSION_STORE, useExisting: SignalSessionStore }
      ]
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    store = TestBed.inject(SignalSessionStore);
    store.set(SIGNED_IN);
  });

  const expired = { status: 401, statusText: 'Unauthorized' };
  const settle = () => new Promise(resolve => setTimeout(resolve));

  it('collapses concurrent refreshes into one network call and replays every request', async () => {
    const results = Promise.all(['/api/v1/a', '/api/v1/b', '/api/v1/c'].map(url => firstValueFrom(http.get(url))));
    for (const url of ['/api/v1/a', '/api/v1/b', '/api/v1/c']) backend.expectOne(url).flush(null, expired);
    await settle();

    const refreshes = backend.match('/api/v1/auth/refresh');
    expect(refreshes).toHaveLength(1);
    refreshes[0]!.flush(REFRESHED);
    await settle();

    for (const url of ['/api/v1/a', '/api/v1/b', '/api/v1/c']) {
      const replay = backend.expectOne(url);
      expect(replay.request.headers.get('Authorization')).toBe('Bearer fresh-token');
      replay.flush({ ok: url });
    }
    await expect(results).resolves.toHaveLength(3);
    expect(store.current()?.accessToken).toBe('fresh-token');
    backend.verify();
  });

  it('keeps the reader signed in when refresh is throttled (429)', async () => {
    const result = firstValueFrom(http.get('/api/v1/a'));
    backend.expectOne('/api/v1/a').flush(null, expired);
    await settle();
    backend.expectOne('/api/v1/auth/refresh')
      .flush(null, { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '30' } });

    await expect(result).rejects.toMatchObject({ status: 401 });
    expect(store.current()).toEqual(SIGNED_IN);
    backend.verify();
  });

  it('signs the reader out when the refresh token is rejected (401)', async () => {
    const result = firstValueFrom(http.get('/api/v1/a'));
    backend.expectOne('/api/v1/a').flush(null, expired);
    await settle();
    backend.expectOne('/api/v1/auth/refresh')
      .flush({ code: 'refresh_token_reused' }, { status: 401, statusText: 'Unauthorized' });

    await expect(result).rejects.toMatchObject({ status: 401 });
    expect(store.current()).toBeNull();
    backend.verify();
  });
});
