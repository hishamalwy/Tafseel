import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { TeacherOnboarding } from '@core/auth/models/teacher-onboarding';
import { TeacherLifecycleGateway } from '@core/auth/services/auth.ports';
import { TeacherOnboardingDto } from '@core/http/api.dto';

@Injectable()
export class HttpTeacherLifecycleGateway implements TeacherLifecycleGateway {
  private readonly http = inject(HttpClient);

  onboardingStatus(): Observable<TeacherOnboarding> {
    return this.http
      .get<TeacherOnboardingDto>('/api/v1/teachers/onboarding-status')
      .pipe(map(dto => ({
        isPublished: !!dto.isPublished,
        nextUrl: dto.nextUrl ?? null
      })));
  }
}
