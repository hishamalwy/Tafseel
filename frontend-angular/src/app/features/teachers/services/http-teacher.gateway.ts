import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import {
  Credential, Teacher, TeacherReview, TeacherSample, TeacherService, TrustBadge
} from '../models/teacher';
import {
  AvailabilityState, AvailabilitySummary, CatalogGateway, Catalogs,
  FavouritesGateway, TeacherGateway, TeacherPage, TeacherQuery
} from '../services/teacher.ports';

interface PageDto<T> { items?: T[]; page?: number; totalCount?: number; totalPages?: number }

interface NamedDto { id?: string; name?: string; nameAr?: string }
/** `PublicTeacherReviewDto`: the score and comment only - the reviewing student is not disclosed. */
interface PublicReviewDto { id?: string; overallScore?: number; originalComment?: string; createdAt?: string }

function toReview(dto: PublicReviewDto): TeacherReview {
  return {
    id: dto.id ?? '', rating: Number(dto.overallScore ?? 0), body: dto.originalComment ?? '', createdAt: dto.createdAt ?? '',
    studentDisplayName: null, studentDisplayNameEnglish: null
  };
}
interface CredentialDto {
  title?: string; issuer?: string; organisation?: string; organization?: string;
  field?: string; startYear?: number; endYear?: number; year?: number;
}

interface TeacherDto {
  id?: string; userId?: string; teacherId?: string;
  fullName?: string; fullNameEnglish?: string; hasAvatar?: boolean;
  headline?: string; headlineEnglish?: string; bio?: string; bioEnglish?: string;
  rating?: number | null; reviewCount?: number; ratingCount?: number; completedOrders?: number;
  // Browse and the profile disagree on these two: browse sends plain names and a
  // starting price, the profile sends named items and the services behind it.
  languages?: (string | NamedDto)[];
  subjects?: (string | NamedDto)[];
  topics?: (string | NamedDto)[];
  educationLevels?: (string | NamedDto)[];
  certifications?: CredentialDto[];
  experience?: CredentialDto[];
  country?: string; city?: string; responseTimeMinutes?: number | null;
  startingPrice?: number | null; currency?: string; startingCurrency?: string;
  sampleCount?: number;
  services?: Record<string, unknown>[];
  contextOffer?: Record<string, unknown> | null;
  trustBadges?: TrustBadge[];
  samples?: Record<string, unknown>[];
  introVideo?: { contentUrl?: string; contentType?: string; durationSeconds?: number | null } | null;
  isVerified?: boolean; verified?: boolean;
}

/** A catalogue entry arrives either as a bare name or as { name, nameAr }. */
function toName(value: string | NamedDto | undefined, arabic: boolean): string {
  if (typeof value === 'string') return value;
  if (!value) return '';
  return arabic ? (value.nameAr || value.name || '') : (value.name || value.nameAr || '');
}

function toNames(list: (string | NamedDto)[] | undefined, arabic: boolean): readonly string[] {
  return (list ?? []).map(item => toName(item, arabic)).filter(Boolean);
}

function toCredentials(list: CredentialDto[] | undefined): readonly Credential[] {
  return (list ?? []).map(item => ({
    title: item.title ?? '',
    meta: item.issuer ?? item.organisation ?? item.organization ?? item.field ?? '',
    years: [item.startYear, item.endYear ?? item.year]
      .filter(year => Number.isFinite(Number(year))).join(' — ')
  }));
}

/**
 * The API names these `nameEn`/`nameAr`, `deliveryHours` and `revisions`. This
 * read them as `serviceNameEnglish`, `deliveryDays` and `revisionAllowance`,
 * which exist nowhere in the payload - so every service rendered nameless, with
 * no delivery time and no price.
 */
function toService(dto: Record<string, unknown>): TeacherService {
  const num = (key: string): number | null => {
    const value = Number(dto[key]);
    return Number.isFinite(value) ? value : null;
  };
  const text = (key: string): string => String(dto[key] ?? '');
  const hours = num('deliveryHours') ?? num('defaultDeliveryHours');
  return {
    id: text('id'),
    subjectId: (dto['subjectId'] as string) ?? null,
    serviceCatalogItemId: (dto['serviceCatalogItemId'] as string) ?? null,
    serviceCatalogCode: text('serviceCatalogCode') || text('serviceCode'),
    serviceNameEnglish: text('nameEn') || text('serviceName') || text('title'),
    serviceNameArabic: text('nameAr') || text('serviceNameAr') || text('title'),
    descriptionEnglish: text('descriptionEn') || text('description'),
    descriptionArabic: text('descriptionAr') || text('description'),
    price: num('price') ?? num('defaultPrice'),
    currency: text('currency') || 'SAR',
    // Hours are the wire unit; the screens speak in days.
    deliveryDays: hours === null ? null : Math.max(1, Math.round(hours / 24)),
    deliveryHours: hours,
    revisionAllowance: num('revisions') ?? num('defaultRevisions'),
    canRequest: dto['canRequest'] !== false,
    canBook: !!dto['canBook'],
    requiresScheduling: !!dto['requiresScheduling'],
    allowedDurations: (dto['allowedDurations'] as number[]) ?? []
  };
}

function introSample(intro: TeacherDto['introVideo']): TeacherSample[] {
  if (!intro?.contentUrl) return [];
  return [{
    id: 'intro', title: '', mediaUrl: intro.contentUrl, description: '',
    durationSeconds: typeof intro.durationSeconds === 'number' ? intro.durationSeconds : null,
    trustCode: 'intro', contentType: intro.contentType ?? '', subjectId: null
  }];
}

function toSample(dto: Record<string, unknown>): TeacherSample {
  const duration = Number(dto['durationSeconds']);
  return {
    id: String(dto['id'] ?? ''),
    title: String(dto['title'] ?? ''),
    // Samples are private media: the id addresses them, the URL is not sent.
    mediaUrl: dto['mediaUrl'] as string
      ?? (dto['id'] ? `/api/v1/teachers/samples/${dto['id']}/content` : null),
    description: String(dto['description'] ?? ''),
    durationSeconds: Number.isFinite(duration) ? duration : null,
    trustCode: String(dto['trustCode'] ?? ''),
    contentType: String(dto['contentType'] ?? ''),
    subjectId: (dto['subjectId'] as string) ?? null
  };
}

/**
 * Reads the document's language rather than taking it as an argument: the call
 * sites are `array.map(toTeacher)`, and a second parameter there collects the
 * index. Guarded for the server render, where there is no document.
 */
function isArabic(): boolean {
  return typeof document !== 'undefined' && document.documentElement.lang === 'ar';
}

function toTeacher(dto: TeacherDto): Teacher {
  const arabic = isArabic();
  return {
    id: String(dto.id ?? dto.teacherId ?? dto.userId ?? ''),
    fullName: dto.fullName ?? '',
    fullNameEnglish: dto.fullNameEnglish ?? '',
    hasAvatar: !!dto.hasAvatar,
    headline: dto.headline ?? '',
    headlineEnglish: dto.headlineEnglish ?? '',
    bio: dto.bio ?? '',
    bioEnglish: dto.bioEnglish ?? '',
    rating: dto.rating ?? null,
    // Browse calls it ratingCount, the profile calls it reviewCount.
    reviewCount: Number(dto.reviewCount ?? dto.ratingCount) || 0,
    completedOrders: Number(dto.completedOrders) || 0,
    languages: toNames(dto.languages, arabic),
    subjects: toNames(dto.subjects, arabic),
    topics: toNames(dto.topics, arabic),
    educationLevels: toNames(dto.educationLevels, arabic),
    certifications: toCredentials(dto.certifications),
    experience: toCredentials(dto.experience),
    country: dto.country ?? '',
    city: dto.city ?? '',
    responseTimeMinutes: dto.responseTimeMinutes ?? null,
    startingPrice: dto.startingPrice ?? null,
    currency: dto.startingCurrency ?? dto.currency ?? 'SAR',
    sampleCount: dto.sampleCount ?? 0,
    services: (dto.services ?? (dto.contextOffer ? [dto.contextOffer] : [])).map(toService),
    trustBadges: dto.trustBadges ?? [],
    // PRODUCT-P1: the teacher's one chosen introduction video leads; nothing else of theirs is shown by default.
    samples: [...introSample(dto.introVideo), ...(dto.samples ?? []).map(toSample)],
    isVerified: !!(dto.isVerified ?? dto.verified)
  };
}

/** AvailabilitySummaryDto. */
export interface AvailabilitySummaryDto {
  teacherId: string;
  teacherServiceId: string | null;
  state: string;
  nextSlotStartUtc: string | null;
  nextSlotEndUtc: string | null;
  durationMinutes: number | null;
}

export function toAvailability(dto: AvailabilitySummaryDto): AvailabilitySummary {
  return {
    teacherId: dto.teacherId,
    teacherServiceId: dto.teacherServiceId ?? null,
    state: dto.state as AvailabilityState,
    nextAvailableAt: dto.nextSlotStartUtc ?? null,
    durationMinutes: dto.durationMinutes ?? null
  };
}

function viewerTimeZone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}

/** Only send parameters that carry a value; the API treats empty as unfiltered. */
function toParams(query: TeacherQuery): string {
  const params = new URLSearchParams();
  const put = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === '' || value === false) return;
    params.set(key, String(value));
  };
  put('search', query.q);
  put('subjectId', query.subjectId);
  put('topicId', query.topicId);
  put('serviceTypeId', query.serviceId);
  put('educationLevelId', query.educationLevelId);
  put('availableOn', query.availableOn);
  put('minimumRating', query.minRating);
  put('maximumPrice', query.maxPrice);
  put('verifiedOnly', query.verifiedOnly);
  put('sort', query.sort === 'rating' ? 'highest-rated'
    : query.sort === 'price' ? 'lowest-price' : query.sort || 'name');
  put('page', query.page);
  put('pageSize', query.pageSize);
  for (const id of query.languageIds ?? []) params.append('languageIds', id);
  return params.toString();
}

@Injectable()
export class HttpTeacherGateway implements TeacherGateway {
  private readonly http = inject(HttpClient);

  search(query: TeacherQuery): Observable<TeacherPage> {
    return this.http
      .get<PageDto<TeacherDto>>(`/api/v1/teachers?${toParams(query)}`)
      .pipe(map(page => ({
        items: (page.items ?? []).map(toTeacher),
        page: Number(page.page ?? 1),
        totalCount: Number(page.totalCount ?? 0),
        totalPages: Number(page.totalPages ?? 1)
      })));
  }

  byId(teacherId: string): Observable<Teacher> {
    return this.http
      .get<TeacherDto>(`/api/v1/teachers/${encodeURIComponent(teacherId)}`)
      .pipe(map(toTeacher));
  }

  reviews(teacherId: string, pageSize: number): Observable<readonly TeacherReview[]> {
    return this.http
      .get<PageDto<PublicReviewDto>>(
        `/api/v1/teachers/${encodeURIComponent(teacherId)}/reviews?pageSize=${pageSize}`)
      .pipe(map(page => (page.items ?? []).map(toReview)));
  }

  /**
   * GET /teachers/availability matched /teachers/{teacherId} with the id "availability" (J1-04).
   * The summaries live on the live-session API; the viewer's time zone decides what "today" is.
   */
  availability(
    teacherIds: readonly string[], teacherServiceId?: string
  ): Observable<readonly AvailabilitySummary[]> {
    const params = new URLSearchParams();
    for (const id of teacherIds) params.append('teacherIds', id);
    if (teacherServiceId) params.set('teacherServiceId', teacherServiceId);
    const zone = viewerTimeZone();
    if (zone) params.set('viewerTimeZoneId', zone);
    return this.http
      .get<{ summaries?: AvailabilitySummaryDto[] }>(`/api/v1/live-sessions/availability-summaries?${params}`)
      .pipe(map(result => (result.summaries ?? []).map(toAvailability)));
  }

  compare(teacherIds: readonly string[]): Observable<readonly Teacher[]> {
    const params = new URLSearchParams();
    for (const id of teacherIds) params.append('ids', id);
    return this.http
      .get<{ teachers: TeacherDto[] }>(`/api/v1/teachers/compare?${params}`)
      .pipe(map(result => result.teachers.map(toTeacher)));
  }
}

@Injectable()
export class HttpCatalogGateway implements CatalogGateway {
  private readonly http = inject(HttpClient);

  /**
   * Five independent lists. `forkJoin` fetches them together, and each falls
   * back to empty so one missing catalog does not empty every dropdown.
   */
  all(): Observable<Catalogs> {
    const list = (path: string) => this.http
      .get<(NamedDto & { nameEnglish?: string; nameArabic?: string })[]
        | PageDto<NamedDto & { nameEnglish?: string; nameArabic?: string }>>(path)
      .pipe(map(result => (Array.isArray(result) ? result : (result.items ?? [])).map(item => ({
        id: item.id ?? '',
        nameEnglish: item.nameEnglish || item.name || '',
        nameArabic: item.nameArabic || item.nameAr || item.name || ''
      }))));

    return forkJoin({
      subjects: list('/api/v1/subjects'),
      topics: list('/api/v1/topics'),
      services: list('/api/v1/services'),
      educationLevels: list('/api/v1/education-levels'),
      languages: list('/api/v1/languages')
    });
  }
}

@Injectable()
export class HttpFavouritesGateway implements FavouritesGateway {
  private readonly http = inject(HttpClient);

  /** The API answers TeacherCardDto[]; each card's id is its `teacherId`. */
  mine(): Observable<readonly string[]> {
    return this.http
      .get<{ teacherId?: string }[]>('/api/v1/favorite-teachers')
      .pipe(map(list => (list ?? []).map(card => String(card.teacherId ?? '')).filter(Boolean)));
  }

  /** PUT /favorite-teachers/{teacherId}, no body (J1-07); the old POST with a body had no route. */
  add(teacherId: string): Observable<void> {
    return this.http.put<void>(`/api/v1/favorite-teachers/${encodeURIComponent(teacherId)}`, null);
  }

  remove(teacherId: string): Observable<void> {
    return this.http.delete<void>(
      `/api/v1/favorite-teachers/${encodeURIComponent(teacherId)}`);
  }
}
