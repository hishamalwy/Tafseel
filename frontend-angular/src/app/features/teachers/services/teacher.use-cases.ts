import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DiscoveryContext, EMPTY_DISCOVERY, Teacher, TeacherReview, TeacherService } from '../models/teacher';
import {
  AvailabilitySummary, CATALOG_GATEWAY, Catalogs, FAVOURITES_GATEWAY,
  TEACHER_GATEWAY, TeacherPage, TeacherQuery
} from './teacher.ports';

export const TEACHERS_PAGE_SIZE = 12;

@Injectable({ providedIn: 'root' })
export class SearchTeachers {
  private readonly gateway = inject(TEACHER_GATEWAY);

  execute(query: TeacherQuery): Promise<TeacherPage> {
    return firstValueFrom(this.gateway.search({ pageSize: TEACHERS_PAGE_SIZE, ...query }));
  }
}

@Injectable({ providedIn: 'root' })
export class LoadCatalogs {
  private readonly gateway = inject(CATALOG_GATEWAY);

  /** Filters are optional furniture: an empty set is better than a broken page. */
  async execute(): Promise<Catalogs> {
    try {
      return await firstValueFrom(this.gateway.all());
    } catch {
      return { subjects: [], topics: [], services: [], educationLevels: [], languages: [] };
    }
  }
}

export interface TeacherProfileView {
  readonly teacher: Teacher;
  readonly reviews: readonly TeacherReview[];
  readonly preferredService: TeacherService | null;
  readonly availability: AvailabilitySummary | null;
  readonly availabilityFailed: boolean;
  readonly isFavourite: boolean;
}

/**
 * Everything the profile screen shows, assembled in one place.
 *
 * Reviews, availability and the favourite flag are all optional: the profile is
 * still worth showing without them, so each degrades rather than failing the
 * whole load.
 */
@Injectable({ providedIn: 'root' })
export class LoadTeacherProfile {
  private readonly teachers = inject(TEACHER_GATEWAY);
  private readonly favourites = inject(FAVOURITES_GATEWAY);

  async execute(
    teacherId: string, isStudent: boolean, discovery: DiscoveryContext = EMPTY_DISCOVERY
  ): Promise<TeacherProfileView> {
    const [teacher, reviews] = await Promise.all([
      firstValueFrom(this.teachers.byId(teacherId)),
      this.optional(() => firstValueFrom(this.teachers.reviews(teacherId, 50)), [])
    ]);

    const preferredService = Teacher.preferredService(teacher.services, discovery);
    const serviceId = Teacher.availabilityServiceId(preferredService);

    const availabilityList = await this.optional(
      () => firstValueFrom(this.teachers.availability([teacherId], serviceId)), null);

    const isFavourite = isStudent
      ? await this.optional(
          async () => (await firstValueFrom(this.favourites.mine())).includes(teacherId), false)
      : false;

    return {
      teacher,
      reviews,
      preferredService,
      availability: availabilityList?.[0] ?? null,
      availabilityFailed: availabilityList === null,
      isFavourite
    };
  }

  private async optional<T>(run: () => Promise<T>, fallback: T): Promise<T> {
    try { return await run(); } catch { return fallback; }
  }
}

@Injectable({ providedIn: 'root' })
export class ToggleFavouriteTeacher {
  private readonly favourites = inject(FAVOURITES_GATEWAY);

  /** Returns the new state so the caller does not have to guess after a failure. */
  async execute(teacherId: string, currentlyFavourite: boolean): Promise<boolean> {
    if (currentlyFavourite) {
      await firstValueFrom(this.favourites.remove(teacherId));
      return false;
    }
    await firstValueFrom(this.favourites.add(teacherId));
    return true;
  }
}

@Injectable({ providedIn: 'root' })
export class CompareTeachers {
  private readonly gateway = inject(TEACHER_GATEWAY);

  /** The comparison tray holds at most four; more than that stops being readable. */
  static readonly MAX = 4;

  execute(teacherIds: readonly string[]): Promise<readonly Teacher[]> {
    return firstValueFrom(this.gateway.compare(teacherIds.slice(0, CompareTeachers.MAX)));
  }
}
