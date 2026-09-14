import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Session } from '@core/auth/models/session';
import { Role } from '@core/auth/models/role';
import { TeacherOnboarding } from '@core/auth/models/teacher-onboarding';
import { AuthFailure } from '@core/auth/models/auth-failure';
import {
  ACCOUNT_GATEWAY, AccountGateway, Credentials, Registration, SESSION_GATEWAY, SESSION_STORE,
  SessionGateway, SessionStore, TEACHER_LIFECYCLE_GATEWAY, TeacherLifecycleGateway
} from './auth.ports';
import { LogIn } from './log-in.use-case';
import { LogOut } from './log-out.use-case';
import { RestoreSession } from './restore-session.use-case';
import { RegisterAccount } from './register-account.use-case';
import { ResolveLandingRoute } from './resolve-landing-route.use-case';

const SESSION: Session = {
  userId: 'u1', email: 'noor@example.com', fullName: 'نور', fullNameEnglish: 'Noor',
  roles: ['Student'], hasAvatar: false, mfaEnabled: false,
  accessToken: 'tok', accessTokenExpiresAt: '2030-01-01T00:00:00Z'
};

/**
 * Use cases are tested against fake gateways, not HTTP.
 *
 * That substitution is the whole reason the ports exist, and it is what the
 * current architecture cannot do: `Tafseel-Auth.dc.html` only runs inside a
 * loaded page with a live API, so its login rules were only ever exercised by
 * matching source text in CI.
 */

class FakeSessionStore implements SessionStore {
  private session: Session | null = null;
  readonly current = () => this.session;
  set(session: Session | null): void { this.session = session; }
}

function configure(overrides: {
  session?: Partial<SessionGateway>;
  account?: Partial<AccountGateway>;
  lifecycle?: Partial<TeacherLifecycleGateway>;
} = {}) {
  const store = new FakeSessionStore();
  const sessionGateway: SessionGateway = {
    authenticate: () => of(SESSION),
    restore: () => of(SESSION as Session | null),
    revoke: () => of(undefined),
    ...overrides.session
  };
  const accountGateway: AccountGateway = {
    register: () => of(undefined),
    requestPasswordReset: () => of(undefined),
    resetPassword: () => of(undefined),
    resendConfirmation: () => of(undefined),
    confirmEmail: () => of(undefined),
    ...overrides.account
  };
  const lifecycleGateway: TeacherLifecycleGateway = {
    onboardingStatus: () => of({ isPublished: true, nextUrl: null } as TeacherOnboarding),
    ...overrides.lifecycle
  };

  TestBed.configureTestingModule({
    providers: [
      { provide: SESSION_STORE, useValue: store },
      { provide: SESSION_GATEWAY, useValue: sessionGateway },
      { provide: ACCOUNT_GATEWAY, useValue: accountGateway },
      { provide: TEACHER_LIFECYCLE_GATEWAY, useValue: lifecycleGateway }
    ]
  });
  return { store, sessionGateway, accountGateway, lifecycleGateway };
}

describe('LogIn', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('adopts the session on success', async () => {
    const { store } = configure();
    const session = await TestBed.inject(LogIn).execute({ email: 'noor@example.com', password: 'x' });
    expect(session.email).toBe('noor@example.com');
    expect(store.current()).toEqual(SESSION);
  });

  it('trims the email before it reaches the gateway', async () => {
    const authenticate = vi.fn((_: Credentials) => of(SESSION));
    configure({ session: { authenticate } });
    await TestBed.inject(LogIn).execute({ email: '  noor@example.com  ', password: 'x' });
    expect(authenticate.mock.calls[0]![0].email).toBe('noor@example.com');
  });

  it('refuses a malformed address without calling the gateway', async () => {
    const authenticate = vi.fn((_c: Credentials) => of(SESSION));
    configure({ session: { authenticate } });
    await expect(TestBed.inject(LogIn).execute({ email: 'nope', password: 'x' }))
      .rejects.toBeInstanceOf(AuthFailure);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('leaves the store untouched when the gateway rejects', async () => {
    const { store } = configure({
      session: { authenticate: () => throwError(() => new AuthFailure('invalid-credentials', 'no')) }
    });
    await expect(TestBed.inject(LogIn).execute({ email: 'noor@example.com', password: 'bad' }))
      .rejects.toBeInstanceOf(AuthFailure);
    expect(store.current()).toBeNull();
  });
});

describe('LogOut', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('clears the session even when the server call fails', async () => {
    const { store } = configure({ session: { revoke: () => throwError(() => new Error('offline')) } });
    store.set(SESSION);
    await TestBed.inject(LogOut).execute();
    expect(store.current()).toBeNull();
  });
});

describe('RestoreSession', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('coalesces concurrent restores into one gateway call', async () => {
    let calls = 0;
    configure({ session: { restore: () => { calls++; return of(SESSION as Session | null); } } });
    const restore = TestBed.inject(RestoreSession);

    await Promise.all([
      firstValueFrom(restore.execute()), firstValueFrom(restore.execute()), firstValueFrom(restore.execute())
    ]);
    expect(calls).toBe(1);
  });

  it('reports settled once the first attempt finishes', async () => {
    configure({ session: { restore: () => of(null) } });
    const restore = TestBed.inject(RestoreSession);
    expect(restore.isSettled).toBe(false);
    await firstValueFrom(restore.execute());
    expect(restore.isSettled).toBe(true);
  });

  it('turns "no session" into an error only on the retry path', async () => {
    configure({ session: { restore: () => of(null) } });
    const restore = TestBed.inject(RestoreSession);
    await expect(firstValueFrom(restore.execute())).resolves.toBeNull();
    await expect(firstValueFrom(restore.forRetry())).rejects.toBeInstanceOf(Error);
  });
});

describe('RegisterAccount', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('rejects a password the policy does not accept, before any request', async () => {
    const register = vi.fn((_registration: Registration) => of(undefined));
    configure({ account: { register } });
    await expect(TestBed.inject(RegisterAccount).execute({
      email: 'a@b.co', password: 'weak', fullName: 'A', role: 'Student', lang: 'en'
    })).rejects.toBeInstanceOf(AuthFailure);
    expect(register).not.toHaveBeenCalled();
  });

  it('sends trimmed values through', async () => {
    const register = vi.fn((_registration: Registration) => of(undefined));
    configure({ account: { register } });
    await TestBed.inject(RegisterAccount).execute({
      email: ' a@b.co ', password: 'Str0ng!Pass', fullName: '  Noor  ', role: 'Teacher', lang: 'ar'
    });
    expect(register.mock.calls[0]![0]).toMatchObject({ email: 'a@b.co', fullName: 'Noor', role: 'Teacher' });
  });
});

describe('ResolveLandingRoute', () => {
  beforeEach(() => TestBed.resetTestingModule());

  const run = (roles: readonly Role[], requested: string | null) =>
    TestBed.inject(ResolveLandingRoute).execute(roles, requested);

  it('honours a requested destination for a non-teacher', async () => {
    configure();
    await expect(run(['Student'], '/orders/9')).resolves.toBe('/orders/9');
  });

  it('falls back to the role home when nothing was requested', async () => {
    configure();
    await expect(run(['Admin'], null)).resolves.toBe('/admin');
    await expect(run(['QualityReviewer'], null)).resolves.toBe('/quality');
    await expect(run(['Student'], null)).resolves.toBe('/');
  });

  /** The one exception carried over from the original `destination()`. */
  it('sends an unpublished teacher to their lifecycle step, overriding the request', async () => {
    configure({ lifecycle: { onboardingStatus: () => of({ isPublished: false, nextUrl: '/teacher-apply/demo' }) } });
    await expect(run(['Teacher'], '/teacher/services')).resolves.toBe('/teacher-apply/demo');
  });

  it('lets a published teacher keep the requested destination', async () => {
    configure({ lifecycle: { onboardingStatus: () => of({ isPublished: true, nextUrl: null }) } });
    await expect(run(['Teacher'], '/teacher/services')).resolves.toBe('/teacher/services');
  });

  it('falls back to the application when onboarding status cannot be read', async () => {
    configure({ lifecycle: { onboardingStatus: () => throwError(() => new Error('500')) } });
    await expect(run(['Teacher'], '/teacher/services')).resolves.toBe('/teacher-apply');
  });
});
