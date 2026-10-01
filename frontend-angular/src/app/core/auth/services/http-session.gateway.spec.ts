import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { HttpSessionGateway } from './http-session.gateway';

const SESSION_DTO = {
  userId: 'u1', email: 'noor@example.com', fullName: 'Noor', fullNameEnglish: 'Noor', roles: ['Student'],
  hasAvatar: false, mfaEnabled: false, accessToken: 'jwt', accessTokenExpiresAt: '2026-09-23T12:00:00Z'
};

function signIn(credentials: Parameters<HttpSessionGateway['authenticate']>[0]) {
  TestBed.configureTestingModule({
    providers: [HttpSessionGateway, provideHttpClient(), provideHttpClientTesting()]
  });
  const http = TestBed.inject(HttpTestingController);
  const done = firstValueFrom(TestBed.inject(HttpSessionGateway).authenticate(credentials));
  const request = http.expectOne('/api/v1/auth/login');
  request.flush(SESSION_DTO);
  http.verify();
  return { body: request.request.body, withCredentials: request.request.withCredentials, done };
}

describe('HttpSessionGateway.authenticate', () => {
  it('sends an unticked "Remember me" as rememberMe: false, the shape LoginRequest binds', async () => {
    const { body, withCredentials, done } = signIn({ email: 'noor@example.com', password: 'x', rememberMe: false });
    expect(withCredentials).toBe(true);
    expect(body).toEqual({ email: 'noor@example.com', password: 'x', rememberMe: false });
    await done;
  });

  it('remembers the sign-in when the caller does not say otherwise', async () => {
    const { body, done } = signIn({ email: 'noor@example.com', password: 'x' });
    expect(body.rememberMe).toBe(true);
    await done;
  });
});
