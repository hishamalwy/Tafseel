import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { CatalogService, FeaturedSubject, FeaturedTeacher, PlatformStats } from '../models/featured';
import { JourneyOffer, LandingGateway, StudentJourneyGateway } from '../services/landing.ports';
import { Promotion } from '../models/promotion';
import { StudentRequestRow } from '@shared/models/student-journey';

interface PageDto<T> { items?: T[] }

interface SubjectDto { id?: string; name?: string; nameEn?: string; nameAr?: string }

interface ServiceDto {
  name?: string; nameEn?: string; nameAr?: string;
  detail?: string; descriptionEn?: string; descriptionAr?: string;
}

interface ContextOfferDto {
  subjectName?: string; subjectNameAr?: string; deliveryHours?: number | null;
}

interface TeacherCardDto {
  teacherId?: string; fullName?: string; headline?: string; hasAvatar?: boolean;
  subjects?: string[]; trustBadges?: { code?: string }[]; verified?: boolean;
  rating?: number | null; ratingCount?: number;
  startingPrice?: number | null; currency?: string;
  contextOffer?: ContextOfferDto | null;
}

interface PromotionDto {
  id?: string; kindCode?: string;
  eyebrowAr?: string; eyebrowEn?: string;
  titleAr?: string; titleEn?: string;
  bodyAr?: string; bodyEn?: string;
  highlightAr?: string; highlightEn?: string;
  couponCode?: string;
  ctaLabelAr?: string; ctaLabelEn?: string; ctaHref?: string;
  endsAt?: string;
}

interface StatsDto { students?: number; teachers?: number; subjects?: number }

function toPromotion(dto: PromotionDto): Promotion {
  return {
    id: String(dto.id ?? ''),
    kindCode: dto.kindCode ?? 'announcement',
    eyebrowArabic: dto.eyebrowAr ?? '',
    eyebrowEnglish: dto.eyebrowEn ?? '',
    titleArabic: dto.titleAr ?? '',
    titleEnglish: dto.titleEn ?? '',
    bodyArabic: dto.bodyAr ?? '',
    bodyEnglish: dto.bodyEn ?? '',
    highlightArabic: dto.highlightAr ?? '',
    highlightEnglish: dto.highlightEn ?? '',
    couponCode: dto.couponCode ?? '',
    ctaLabelArabic: dto.ctaLabelAr ?? '',
    ctaLabelEnglish: dto.ctaLabelEn ?? '',
    ctaHref: dto.ctaHref ?? '',
    endsAt: dto.endsAt ?? ''
  };
}

/**
 * A card is composed only from fields `/teachers` actually returns: no invented
 * rating, review count, availability, photo or demo. A missing value stays null
 * so the card can drop its row rather than show a placeholder.
 */
function toFeaturedTeacher(dto: TeacherCardDto): FeaturedTeacher {
  const badges = dto.trustBadges ?? [];
  const offer = dto.contextOffer ?? null;
  const subjects = dto.subjects ?? [];
  return {
    id: String(dto.teacherId ?? ''),
    name: dto.fullName ?? '',
    headline: dto.headline ?? '',
    hasAvatar: !!dto.hasAvatar,
    subjects,
    subjectEnglish: offer?.subjectName || subjects[0] || '',
    subjectArabic: offer?.subjectNameAr ?? '',
    qualified: badges.some(b => b?.code === 'qualified_on_tafseel') || !!dto.verified,
    rating: dto.rating ?? null,
    ratingCount: Number(dto.ratingCount) || 0,
    startingPrice: dto.startingPrice ?? null,
    currency: dto.currency || 'SAR',
    deliveryHours: Number.isFinite(offer?.deliveryHours) ? Number(offer?.deliveryHours) : null
  };
}

@Injectable()
export class HttpLandingGateway implements LandingGateway {
  private readonly http = inject(HttpClient);

  featuredSubjects(take: number): Observable<readonly FeaturedSubject[]> {
    return this.http
      .get<SubjectDto[]>(`/api/v1/subjects/featured?take=${take}`)
      .pipe(map(rows => (rows ?? []).map(row => ({
        id: String(row.id ?? ''),
        nameEnglish: row.nameEn || row.name || '',
        nameArabic: row.nameAr ?? ''
      }))));
  }

  featuredTeachers(take: number): Observable<readonly FeaturedTeacher[]> {
    return this.http
      .get<PageDto<TeacherCardDto>>(`/api/v1/teachers?pageSize=${take}`)
      .pipe(map(page => (page.items ?? []).map(toFeaturedTeacher)));
  }

  /**
   * No cap: the section renders whatever the public catalogue publishes, so it
   * can never advertise a count the catalogue does not have.
   */
  services(): Observable<readonly CatalogService[]> {
    return this.http
      .get<ServiceDto[]>('/api/v1/services')
      .pipe(map(rows => (rows ?? []).map(row => ({
        nameEnglish: row.nameEn || row.name || '',
        nameArabic: row.nameAr ?? '',
        descriptionEnglish: row.descriptionEn || row.detail || '',
        descriptionArabic: row.descriptionAr ?? ''
      }))));
  }

  promotions(): Observable<readonly Promotion[]> {
    return this.http
      .get<PromotionDto[]>('/api/v1/promotions')
      .pipe(map(rows => (Array.isArray(rows) ? rows : []).map(toPromotion)));
  }

  platformStats(): Observable<PlatformStats | null> {
    return this.http
      .get<StatsDto>('/api/v1/platform/stats')
      .pipe(map(dto => dto ? {
        students: Number.isFinite(dto.students) ? Number(dto.students) : null,
        teachers: Number.isFinite(dto.teachers) ? Number(dto.teachers) : null,
        subjects: Number.isFinite(dto.subjects) ? Number(dto.subjects) : null
      } : null));
  }
}

interface RequestRowDto {
  id?: string; title?: string; status?: number; sourcingMode?: number;
  offerCount?: number | null; paymentReservationExpiresAt?: string;
  preferredDeliveryAt?: string; teacherDisplayName?: string;
  teacherDisplayNameEnglish?: string; selectedOfferId?: string;
}

interface OfferDto {
  id?: string; amount?: number | null; currency?: string; deliveryHours?: number | null;
  teacherDisplayName?: string; teacherDisplayNameEnglish?: string;
}

@Injectable()
export class HttpStudentJourneyGateway implements StudentJourneyGateway {
  private readonly http = inject(HttpClient);

  myRequests(): Observable<readonly StudentRequestRow[]> {
    return this.http
      .get<PageDto<RequestRowDto>>('/api/v1/learning-requests/mine?page=1&pageSize=20')
      .pipe(map(page => (page.items ?? []).map(row => ({
        id: String(row.id ?? ''),
        title: row.title ?? '',
        status: Number(row.status ?? 0),
        sourcingMode: Number(row.sourcingMode ?? 0),
        offerCount: typeof row.offerCount === 'number' ? row.offerCount : null,
        paymentReservationExpiresAt: row.paymentReservationExpiresAt ?? '',
        preferredDeliveryAt: row.preferredDeliveryAt ?? '',
        teacherDisplayName: row.teacherDisplayName ?? '',
        teacherDisplayNameEnglish: row.teacherDisplayNameEnglish ?? '',
        selectedOfferId: row.selectedOfferId ?? ''
      }))));
  }

  offers(requestId: string): Observable<readonly JourneyOffer[]> {
    return this.http
      .get<OfferDto[] | PageDto<OfferDto>>(
        `/api/v1/open-marketplace/requests/${encodeURIComponent(requestId)}/offers`)
      .pipe(map(result => {
        const rows = Array.isArray(result) ? result : (result.items ?? []);
        return rows.map(row => ({
          id: String(row.id ?? ''),
          amount: row.amount ?? null,
          currency: row.currency || 'SAR',
          deliveryHours: row.deliveryHours ?? null,
          teacherDisplayName: row.teacherDisplayName ?? '',
          teacherDisplayNameEnglish: row.teacherDisplayNameEnglish ?? ''
        }));
      }));
  }
}
