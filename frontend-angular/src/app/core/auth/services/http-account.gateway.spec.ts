import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { HttpAccountGateway } from './http-account.gateway';

describe('HttpAccountGateway', () => {
  it('sends a password reset in the shape ResetPasswordRequest binds', async () => {
    TestBed.configureTestingModule({
      providers: [HttpAccountGateway, provideHttpClient(), provideHttpClientTesting()]
    });
    const gateway = TestBed.inject(HttpAccountGateway);
    const http = TestBed.inject(HttpTestingController);

    const done = firstValueFrom(gateway.resetPassword({ email: 'student@example.test', token: 'reset-token', newPassword: 'N3w-passphrase!' }), { defaultValue: undefined });
    const request = http.expectOne('/api/v1/auth/reset-password');

    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({ email: 'student@example.test', token: 'reset-token', password: 'N3w-passphrase!' });
    expect(request.request.body).not.toHaveProperty('newPassword');

    request.flush(null, { status: 204, statusText: 'No Content' });
    await done;
    http.verify();
  });
});
