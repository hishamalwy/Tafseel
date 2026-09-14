/**
 * Wire shapes for `/api/v1`. These live in infrastructure, not domain: they
 * mirror `Tafseel.Api.Controllers.AuthController` and change when the API
 * changes, which is a different reason than the business rules changing.
 */
import { Role } from '@core/auth/models/role';

export interface SessionDto {
  userId: string;
  email: string;
  fullName: string;
  fullNameEnglish: string;
  roles: string[];
  hasAvatar: boolean;
  mfaEnabled: boolean;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface TeacherOnboardingDto {
  isPublished: boolean;
  nextUrl?: string | null;
}

/** RFC 7807, plus the `code`/`traceId` extensions `ApiProblem.Create` adds. */
export interface ProblemDetailsDto {
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  traceId?: string;
  errors?: Record<string, string[]>;
}

export const KNOWN_ROLES: readonly Role[] = ['Admin', 'QualityReviewer', 'Teacher', 'Student'];
