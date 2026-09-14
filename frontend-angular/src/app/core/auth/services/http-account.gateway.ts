import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import {
  AccountGateway, PasswordReset, Registration
} from '@core/auth/services/auth.ports';
import { toAuthFailure } from '@core/http/problem-details.mapper';

/** The policy revision `POST /auth/register` expects to be acknowledged. */
const POLICY_VERSION = '2026-08-12';

@Injectable()
export class HttpAccountGateway implements AccountGateway {
  private readonly http = inject(HttpClient);

  register(registration: Registration): Observable<void> {
    return this.http.post<unknown>('/api/v1/auth/register', {
      email: registration.email,
      password: registration.password,
      fullName: registration.fullName,
      role: registration.role,
      lang: registration.lang,
      policyVersion: POLICY_VERSION
    }, { withCredentials: true })
      .pipe(map(() => undefined), catchError(e => throwError(() => toAuthFailure(e))));
  }

  requestPasswordReset(email: string, lang: 'ar' | 'en'): Observable<void> {
    return this.http
      .post<void>('/api/v1/auth/forgot-password', { email, lang }, { withCredentials: true })
      .pipe(catchError(e => throwError(() => toAuthFailure(e))));
  }

  resetPassword(reset: PasswordReset): Observable<void> {
    return this.http.post<void>('/api/v1/auth/reset-password', {
      email: reset.email,
      token: reset.token,
      // `ResetPasswordRequest(Email, Token, Password)` binds `password`; `newPassword` was ignored (J2-04).
      password: reset.newPassword
    }, { withCredentials: true })
      .pipe(catchError(e => throwError(() => toAuthFailure(e))));
  }

  resendConfirmation(email: string, lang: 'ar' | 'en'): Observable<void> {
    return this.http
      .post<void>('/api/v1/auth/request-email-confirmation', { email, lang }, { withCredentials: true })
      .pipe(catchError(e => throwError(() => toAuthFailure(e))));
  }

  confirmEmail(email: string, token: string): Observable<void> {
    return this.http
      .post<void>('/api/v1/auth/confirm-email', { email, token }, { withCredentials: true })
      .pipe(catchError(e => throwError(() => toAuthFailure(e))));
  }
}
