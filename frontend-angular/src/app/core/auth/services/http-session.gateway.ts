import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { Session } from '@core/auth/models/session';
import { Role } from '@core/auth/models/role';
import { Credentials, SessionGateway } from '@core/auth/services/auth.ports';
import { KNOWN_ROLES, SessionDto } from '@core/http/api.dto';
import { toAuthFailure } from '@core/http/problem-details.mapper';

/** Wire DTO to domain entity. Unknown role names are dropped, not trusted. */
function toSession(dto: SessionDto): Session {
  return {
    userId: dto.userId,
    email: dto.email,
    fullName: dto.fullName,
    fullNameEnglish: dto.fullNameEnglish,
    roles: (dto.roles ?? []).filter((r): r is Role => (KNOWN_ROLES as readonly string[]).includes(r)),
    hasAvatar: !!dto.hasAvatar,
    mfaEnabled: !!dto.mfaEnabled,
    accessToken: dto.accessToken,
    accessTokenExpiresAt: dto.accessTokenExpiresAt
  };
}

/**
 * HTTP adapter for SessionGateway.
 *
 * `withCredentials` is mandatory on all three calls: the refresh token is an
 * HttpOnly cookie, and a request that omits it cannot be re-authenticated.
 */
@Injectable()
export class HttpSessionGateway implements SessionGateway {
  private readonly http = inject(HttpClient);

  authenticate(credentials: Credentials): Observable<Session> {
    const body = {
      email: credentials.email,
      password: credentials.password,
      ...(credentials.mfaCode ? { code: credentials.mfaCode } : {})
    };
    return this.http
      .post<SessionDto>('/api/v1/auth/login', body, { withCredentials: true })
      .pipe(map(toSession), catchError(e => throwError(() => toAuthFailure(e))));
  }

  /** A dead or missing cookie is "no session", so it resolves to null. */
  restore(): Observable<Session | null> {
    return this.http
      .post<SessionDto>('/api/v1/auth/refresh', null, { withCredentials: true })
      .pipe(map(dto => toSession(dto) as Session | null), catchError(() => of(null)));
  }

  revoke(): Observable<void> {
    return this.http.post<void>('/api/v1/auth/logout', null, { withCredentials: true });
  }
}
