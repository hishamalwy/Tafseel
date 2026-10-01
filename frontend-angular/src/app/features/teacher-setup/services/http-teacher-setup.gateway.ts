import { HttpClient, HttpEvent, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Availability, ExceptionInput, RuleInput } from '../models/availability';
import { IntroVideo, OnboardingState } from '../models/readiness';
import { Offering, ServiceInput, ServiceSubject, ServiceType } from '../models/service-offer';
import {
  AvailabilityException, Credential, CredentialDraft, CredentialKind, NamedItem, OwnProfile, ProfileInput, TopicItem,
  WeeklyRule
} from '../models/teacher-profile';
import { TeacherSetupGateway } from './teacher-setup.ports';

type Json = Record<string, any>;

@Injectable()
export class HttpTeacherSetupGateway implements TeacherSetupGateway {
  private readonly http = inject(HttpClient);

  profile(): Observable<OwnProfile> {
    return this.http.get<Json>('/api/v1/teachers/me').pipe(map(ownProfile));
  }

  saveProfile(input: ProfileInput): Observable<void> {
    return this.http.put<void>('/api/v1/teachers/me', {
      headline: input.headline, bio: input.bio, country: input.country, city: input.city,
      timeZoneId: input.timeZoneId, responseTimeMinutes: input.responseTimeMinutes
    });
  }

  languages(): Observable<readonly NamedItem[]> {
    return this.http.get<Json[]>('/api/v1/languages').pipe(map(rows => rows.map(named)));
  }

  topics(): Observable<readonly TopicItem[]> {
    return this.http.get<Json[]>('/api/v1/topics').pipe(map(rows => rows.map(x => ({ ...named(x), subjectId: text(x['parentId']) }))));
  }

  educationLevels(): Observable<readonly NamedItem[]> {
    return this.http.get<Json[]>('/api/v1/education-levels').pipe(map(rows => rows.map(named)));
  }

  setLanguages(ids: readonly string[]): Observable<void> {
    return this.http.put<void>('/api/v1/teachers/me/languages', { ids });
  }

  setTopics(ids: readonly string[]): Observable<void> {
    return this.http.put<void>('/api/v1/teachers/me/topics', { ids });
  }

  setEducationLevels(ids: readonly string[]): Observable<void> {
    return this.http.put<void>('/api/v1/teachers/me/education-levels', { ids });
  }

  addCredential(kind: CredentialKind, draft: CredentialDraft): Observable<Credential> {
    return this.http.post<Json>(`/api/v1/teachers/me/${kind}`, {
      title: draft.title.trim(), organization: draft.organization.trim(), from: draft.from || null, to: draft.to || null
    }).pipe(map(credential));
  }

  removeCredential(kind: CredentialKind, id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/teachers/me/${kind}/${encodeURIComponent(id)}`);
  }

  eligibleSubjects(): Observable<readonly NamedItem[]> {
    return this.http.get<Json[]>('/api/v1/teachers/me/eligible-subjects').pipe(map(rows => rows.map(named)));
  }

  serviceTypes(): Observable<readonly ServiceType[]> {
    return this.http.get<Json[]>('/api/v1/teachers/me/marketplace-services').pipe(map(rows => rows.map(serviceType)));
  }

  createService(input: ServiceInput): Observable<void> {
    return this.http.post<Json>('/api/v1/teachers/me/services', {
      subjectId: input.subjectId, serviceCatalogItemId: input.serviceCatalogItemId, price: input.price,
      currency: input.currency, deliveryHours: input.deliveryHours, revisions: input.revisions,
      approachEn: input.approachEn, approachAr: input.approachAr, isAvailable: input.isAvailable
    }).pipe(map(() => undefined));
  }

  updateService(id: string, input: ServiceInput, version: string): Observable<void> {
    return this.http.put<void>(`/api/v1/teachers/me/services/${encodeURIComponent(id)}`, {
      subjectId: input.subjectId, serviceCatalogItemId: input.serviceCatalogItemId, price: input.price,
      currency: input.currency, deliveryHours: input.deliveryHours, revisions: input.revisions,
      approachEn: input.approachEn, approachAr: input.approachAr, isAvailable: input.isAvailable
    }, { headers: ifMatch(version) });
  }

  setServiceActive(id: string, active: boolean, version: string): Observable<void> {
    return this.http.put<void>(`/api/v1/teachers/me/services/${encodeURIComponent(id)}/active`, { active },
      { headers: ifMatch(version) });
  }

  replaceRules(rules: readonly RuleInput[]): Observable<readonly WeeklyRule[]> {
    return this.http.put<Json[]>('/api/v1/teachers/me/availability/rules', { rules }).pipe(map(rows => rows.map(weeklyRule)));
  }

  removeRule(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/teachers/me/availability/rules/${encodeURIComponent(id)}`);
  }

  addException(input: ExceptionInput): Observable<AvailabilityException> {
    return this.http.post<Json>('/api/v1/teachers/me/availability/exceptions', {
      startsAt: input.startsAt, endsAt: input.endsAt, reason: input.reason
    }).pipe(map(availabilityException));
  }

  removeException(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/teachers/me/availability/exceptions/${encodeURIComponent(id)}`);
  }

  onboarding(): Observable<OnboardingState> {
    return this.http.get<Json>('/api/v1/teachers/onboarding-status').pipe(map(onboarding));
  }

  introVideo(): Observable<IntroVideo> {
    return this.http.get<Json>('/api/v1/teachers/me/intro-video').pipe(map(introVideo));
  }

  uploadIntroVideo(file: File, version: string | null): Observable<HttpEvent<unknown>> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post('/api/v1/teachers/me/intro-video', body,
      { headers: version ? ifMatch(version) : new HttpHeaders(), reportProgress: true, observe: 'events' });
  }

  useApplicationVideo(sampleId: string, version: string | null): Observable<IntroVideo> {
    return this.http.post<Json>('/api/v1/teachers/me/intro-video/from-application', { sampleId, consent: true },
      { headers: version ? ifMatch(version) : new HttpHeaders() }).pipe(map(introVideo));
  }

  setIntroVisible(visible: boolean, version: string): Observable<IntroVideo> {
    return this.http.put<Json>('/api/v1/teachers/me/intro-video/visibility', { visible }, { headers: ifMatch(version) })
      .pipe(map(introVideo));
  }

  removeIntroVideo(version: string): Observable<IntroVideo> {
    return this.http.delete<Json>('/api/v1/teachers/me/intro-video', { headers: ifMatch(version) }).pipe(map(introVideo));
  }

  setPublished(published: boolean): Observable<void> {
    return this.http.put<void>('/api/v1/teachers/me/publication', { published });
  }
}

export function introVideo(row: Json | null): IntroVideo {
  const source = row?.['hasVideo'] ? (row['sourceCode'] === 'application' ? 'application' : 'upload') : null;
  return {
    source,
    isPublic: !!row?.['isPublic'],
    fileName: (row?.['fileName'] as string | null) ?? null,
    consentedAt: (row?.['consentedAt'] as string | null) ?? null,
    version: (row?.['version'] as string | null) ?? null,
    consentStatement: String(row?.['consentStatementToAccept'] ?? ''),
    applicationVideos: ((row?.['applicationVideos'] as Json[] | undefined) ?? []).map(v => ({
      sampleId: String(v['sampleId'] ?? ''),
      subjectName: String(v['subjectName'] ?? ''),
      subjectNameAr: (v['subjectNameAr'] as string | null) ?? null,
      title: String(v['title'] ?? ''),
      titleAr: String(v['titleAr'] ?? ''),
      durationSeconds: typeof v['durationSeconds'] === 'number' ? v['durationSeconds'] as number : null,
      inUse: !!v['inUse']
    }))
  };
}

function ifMatch(version: string): HttpHeaders {
  return new HttpHeaders({ 'If-Match': version });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function list<T>(value: unknown, mapper: (x: Json) => T): readonly T[] {
  return Array.isArray(value) ? value.map(mapper) : [];
}

function named(x: Json): NamedItem {
  return { id: text(x['id']), name: text(x['name']), nameArabic: text(x['nameAr']), code: text(x['code']) };
}

function credential(x: Json): Credential {
  return { id: text(x['id']), title: text(x['title']), organization: text(x['organization']), from: text(x['from']), to: text(x['to']) };
}

function weeklyRule(x: Json): WeeklyRule {
  return {
    id: text(x['id']), dayOfWeek: Number(x['dayOfWeek'] ?? 0),
    start: Availability.clock(text(x['start'])), end: Availability.clock(text(x['end'])),
    timeZoneId: text(x['timeZoneId']), slotMinutes: typeof x['slotMinutes'] === 'number' ? x['slotMinutes'] : null
  };
}

function availabilityException(x: Json): AvailabilityException {
  return { id: text(x['id']), startsAt: text(x['startsAt']), endsAt: text(x['endsAt']), reason: text(x['reason']) };
}

export function ownProfile(x: Json): OwnProfile {
  return {
    teacherId: text(x['teacherId']), fullName: text(x['fullName']), headline: text(x['headline']), bio: text(x['bio']),
    country: text(x['country']), city: text(x['city']), timeZoneId: text(x['timeZoneId']),
    responseTimeMinutes: typeof x['responseTimeMinutes'] === 'number' ? x['responseTimeMinutes'] : null,
    languages: list(x['languages'], named), topics: list(x['topics'], named), educationLevels: list(x['educationLevels'], named),
    certifications: list(x['certifications'], credential), experience: list(x['experience'], credential),
    rules: list(x['availability'], weeklyRule), exceptions: list(x['availabilityExceptions'], availabilityException),
    isProfileComplete: !!x['isProfileComplete'], isPubliclyVisible: !!x['isPubliclyVisible'],
    publicationBlockingReasons: list(x['publicationBlockingReasons'], value => String(value))
  };
}

function offering(x: Json): Offering {
  return {
    id: text(x['id']), subjectId: text(x['subjectId']), serviceTypeId: text(x['serviceCatalogItemId']),
    price: Number(x['price'] ?? 0), currency: text(x['currency']), deliveryHours: Number(x['deliveryHours'] ?? 0),
    revisions: Number(x['revisions'] ?? 0), isActive: !!x['isActive'], requiresScheduling: !!x['requiresScheduling'],
    approachEn: text(x['approachEn']), approachAr: text(x['approachAr']), version: text(x['version']),
    configurationState: text(x['configurationState']), isSuperseded: !!x['isSuperseded'],
    canRequest: !!x['canRequest'], canBook: !!x['canBook']
  };
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

export function serviceType(x: Json): ServiceType {
  return {
    id: text(x['id']), code: text(x['code']), name: text(x['nameEn']), nameArabic: text(x['nameAr']),
    description: text(x['descriptionEn']), descriptionArabic: text(x['descriptionAr']), orderType: text(x['orderType']),
    currency: text(x['currencyCode']), minPrice: Number(x['minimumPrice'] ?? 0), defaultPrice: Number(x['defaultPrice'] ?? 0),
    maxPrice: Number(x['maximumPrice'] ?? 0), minDeliveryHours: nullableNumber(x['minimumDeliveryHours']),
    defaultDeliveryHours: nullableNumber(x['defaultDeliveryHours']), maxDeliveryHours: nullableNumber(x['maximumDeliveryHours']),
    defaultRevisions: Number(x['defaultRevisions'] ?? 0), maxRevisions: Number(x['maximumRevisions'] ?? 0),
    canEnable: !!x['canEnable'], availabilityState: text(x['availabilityState']),
    subjects: list(x['subjects'], (s): ServiceSubject => ({
      id: text(s['id']), name: text(s['name']), nameArabic: text(s['nameAr']),
      isSubjectActive: !!s['isSubjectActive'], isQualificationActive: !!s['isQualificationActive']
    })),
    offerings: list(x['offerings'], offering)
  };
}

function onboarding(x: Json): OnboardingState {
  return {
    status: Number(x['status'] ?? -1), emailConfirmed: !!x['emailConfirmed'],
    approvedSubjectIds: list(x['approvedSubjectIds'], value => String(value)),
    profileComplete: !!x['profileComplete'], hasActiveService: !!x['hasActiveService'],
    hasAvailability: !!x['hasAvailability'], hasPublicSample: !!x['hasPublicSample'], isPublished: !!x['isPublished'],
    readyForPublication: !!x['readyForPublication'],
    blockingReasons: list(x['blockingReasons'], value => String(value)),
    missingRequirements: list(x['missingRequirements'], value => String(value)),
    applicationId: typeof x['applicationId'] === 'string' ? x['applicationId'] as string : undefined
  };
}
