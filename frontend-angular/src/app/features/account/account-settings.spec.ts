import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccountSettingsGateway } from './services/account-settings.gateway';

describe('AccountSettingsGateway', () => {
  let gateway: AccountSettingsGateway;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    gateway = TestBed.inject(AccountSettingsGateway);
    backend = TestBed.inject(HttpTestingController);
  });

  it('signs out the other devices and reports how many', async () => {
    const result = gateway.signOutOthers();
    const request = backend.expectOne('/api/v1/auth/sessions/sign-out-others');
    expect(request.request.method).toBe('POST');
    request.flush({ signedOut: 2 });
    expect(await result).toBe(2);
  });

  it('changes the password with exactly the ChangePasswordRequest keys', async () => {
    const sent = gateway.changePassword('Old!Password1', 'New!Password12');
    const request = backend.expectOne('/api/v1/auth/password');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ currentPassword: 'Old!Password1', newPassword: 'New!Password12' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    await sent;
  });

  it('deletes the account with the password in the body, never the URL', async () => {
    const sent = gateway.deleteAccount('Secret!Pass1');
    const request = backend.expectOne('/api/v1/auth/account');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({ password: 'Secret!Pass1' });
    expect(request.request.urlWithParams).not.toContain('Secret');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await sent;
  });

  it('saves learning preferences with the version read and reads them back', async () => {
    const saved = gateway.saveLearning({ explanationStyle: 'visual', languageId: 'lang-1', version: 'v1' });
    const put = backend.expectOne('/api/v1/students/me/learning-preferences');
    expect(put.request.body).toEqual({ explanationStyle: 'visual', preferredTeachingLanguageId: 'lang-1', version: 'v1' });
    put.flush({});
    await Promise.resolve();
    backend.expectOne('/api/v1/students/me/learning-preferences').flush({
      explanationStyle: 'visual', preferredTeachingLanguage: { id: 'lang-1', name: 'Arabic' }, version: 'v2'
    });
    expect(await saved).toEqual({ explanationStyle: 'visual', languageId: 'lang-1', version: 'v2' });
  });
});
