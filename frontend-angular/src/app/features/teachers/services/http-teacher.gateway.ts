import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import {
  Credential, Teacher, TeacherReview, TeacherSample, TeacherService, TrustBadge
} from '../models/teacher';
import {
  AvailabilitySummary, CatalogGateway, CatalogItem, Catalogs,
  FavouritesGateway, TeacherGateway, TeacherPage, TeacherQuery
} from '../services/teacher.ports';

interface PageDto<T> { items?: T[]; page?: number; totalCount?: number; totalPages?: number }

interface NamedDto { id?: string; name?: string; nameAr?: string }
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
  startingPrice?: number | null; currency?: string;
  services?: Record<string, unknown>[];
  trustBadges?: TrustBadge[];
  samples?: Record<string, unknown>[];
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
    serviceCatalogCode: text('serviceCatalogCode'),
    serviceNameEnglish: text('nameEn') || text('title'),
    serviceNameArabic: text('nameAr') || text('title'),
    descriptionEnglish: text('descriptionEn') || text('description'),
    descriptionArabic: text('descriptionAr') || text('description'),
    price: num('price') ?? num('defaultPrice'),
    currency: text('currency') || 'SAR',
    // Hours are the wire unit; the screens speak in days.
    deliveryDays: hours === null ? null : Math.max(1, Math.round(hours / 24)),
    revisionAllowance: num('revisions') ?? num('defaultRevisions'),
    canRequest: dto['canRequest'] !== false,
    canBook: !!dto['canBook'],
    requiresScheduling: !!dto['requiresScheduling'],
    allowedDurations: (dto['allowedDurations'] as number[]) ?? []
  };
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
    currency: dto.currency ?? 'SAR',
    services: (dto.services ?? []).map(toService),
    trustBadges: dto.trustBadges ?? [],
    samples: (dto.samples ?? []).map(toSample),
    isVerified: !!(dto.isVerified ?? dto.verified)
  };
}

/** Only send parameters that carry a value; the API treats empty as unfiltered. */
function toParams(query: TeacherQuery): string {
  const params = new URLSearchParams();
  const put = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === '' || value === false) return;
    params.set(key, String(value));
  };
  put('q', query.q);
  put('subjectId', query.subjectId);
  put('topicId', query.topicId);
  put('serviceId', query.serviceId);
  put('educationLevelId', query.educationLevelId);
  put('availableOn', query.availableOn);
  put('minRating', query.minRating);
  put('maxPrice', query.maxPrice);
  put('verifiedOnly', query.verifiedOnly);
  put('sort', query.sort);
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
      .get<PageDto<TeacherReview>>(
        `/api/v1/teachers/${encodeURIComponent(teacherId)}/reviews?pageSize=${pageSize}`)
      .pipe(map(page => page.items ?? []));
  }

  availability(
    teacherIds: readonly string[], teacherServiceId?: string
  ): Observable<readonly AvailabilitySummary[]> {
    const params = new URLSearchParams();
    for (const id of teacherIds) params.append('teacherIds', id);
    if (teacherServiceId) params.set('teacherServiceId', teacherServiceId);
    return this.http
      .get<{ summaries?: AvailabilitySummary[] }>(`/api/v1/teachers/availability?${params}`)
      .pipe(map(result => result.summaries ?? []));
  }

  compare(teacherIds: readonly string[]): Observable<readonly Teacher[]> {
    const params = new URLSearchParams();
    for (const id of teacherIds) params.append('teacherIds', id);
    return this.http
      .get<PageDto<TeacherDto>>(`/api/v1/teachers/compare?${params}`)
      .pipe(map(page => (page.items ?? []).map(toTeacher)));
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
      .get<CatalogItem[] | PageDto<CatalogItem>>(path)
      .pipe(map(result => (Array.isArray(result) ? result : (result.items ?? [])) as CatalogItem[]));

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

  mine(): Observable<readonly string[]> {
    return this.http
      .get<{ teacherId?: string }[]>('/api/v1/favorite-teachers')
      .pipe(map(list => (list ?? []).map(f => String(f.teacherId ?? ''))));
  }

  add(teacherId: string): Observable<void> {
    return this.http.post<void>('/api/v1/favorite-teachers', { teacherId });
  }

  remove(teacherId: string): Observable<void> {
    return this.http.delete<void>(
      `/api/v1/favorite-teachers/${encodeURIComponent(teacherId)}`);
  }
}
