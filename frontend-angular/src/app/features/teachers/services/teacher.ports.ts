import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Teacher, TeacherReview } from '../models/teacher';

export interface TeacherPage {
  readonly items: readonly Teacher[];
  readonly page: number;
  readonly totalCount: number;
  readonly totalPages: number;
}

/**
 * Every filter browse can apply, all optional.
 *
 * Each is `?: T | undefined` rather than plain `?: T` because the project runs
 * with `exactOptionalPropertyTypes`: reading a filter out of the URL yields
 * `undefined` for "not set", and that has to be assignable.
 */
export interface TeacherQuery {
  readonly q?: string | undefined;
  readonly subjectId?: string | undefined;
  readonly topicId?: string | undefined;
  readonly serviceId?: string | undefined;
  readonly educationLevelId?: string | undefined;
  readonly availableOn?: string | undefined;
  readonly minRating?: number | undefined;
  readonly maxPrice?: number | undefined;
  readonly languageIds?: readonly string[] | undefined;
  readonly verifiedOnly?: boolean | undefined;
  readonly sort?: string | undefined;
  readonly page?: number | undefined;
  readonly pageSize?: number | undefined;
}

export interface CatalogItem {
  readonly id: string;
  readonly nameEnglish: string;
  readonly nameArabic: string;
}

export interface Catalogs {
  readonly subjects: readonly CatalogItem[];
  readonly topics: readonly CatalogItem[];
  readonly services: readonly CatalogItem[];
  readonly educationLevels: readonly CatalogItem[];
  readonly languages: readonly CatalogItem[];
}

export interface AvailabilitySummary {
  readonly teacherId: string;
  readonly nextAvailableAt: string | null;
  readonly openSlotCount: number;
}

export interface TeacherGateway {
  search(query: TeacherQuery): Observable<TeacherPage>;
  byId(teacherId: string): Observable<Teacher>;
  reviews(teacherId: string, pageSize: number): Observable<readonly TeacherReview[]>;
  availability(teacherIds: readonly string[], teacherServiceId?: string): Observable<readonly AvailabilitySummary[]>;
  compare(teacherIds: readonly string[]): Observable<readonly Teacher[]>;
}

/** The filter dropdowns. Separate because browse needs them and the profile does not. */
export interface CatalogGateway {
  all(): Observable<Catalogs>;
}

/** Students only; a guest sees no favourites and cannot set one. */
export interface FavouritesGateway {
  mine(): Observable<readonly string[]>;
  add(teacherId: string): Observable<void>;
  remove(teacherId: string): Observable<void>;
}

export const TEACHER_GATEWAY = new InjectionToken<TeacherGateway>('TeacherGateway');
export const CATALOG_GATEWAY = new InjectionToken<CatalogGateway>('CatalogGateway');
export const FAVOURITES_GATEWAY = new InjectionToken<FavouritesGateway>('FavouritesGateway');
