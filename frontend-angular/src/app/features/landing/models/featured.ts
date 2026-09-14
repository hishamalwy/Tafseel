/**
 * The landing page's own read models.
 *
 * These are deliberately not the `Teacher` aggregate the browse and profile
 * screens use. A featured card shows a different, smaller set of facts, and it
 * shows them from `TeacherCardDto` — which carries a starting price and a
 * context Offer that the full profile does not. Sharing one model would mean
 * every field either being optional or being invented here, and inventing is
 * exactly what this section must not do.
 */

export interface FeaturedSubject {
  readonly id: string;
  readonly nameEnglish: string;
  readonly nameArabic: string;
}

export interface CatalogService {
  readonly nameEnglish: string;
  readonly nameArabic: string;
  readonly descriptionEnglish: string;
  readonly descriptionArabic: string;
}

export interface PlatformStats {
  readonly students: number | null;
  readonly teachers: number | null;
  readonly subjects: number | null;
}

export interface FeaturedTeacher {
  readonly id: string;
  readonly name: string;
  readonly headline: string;
  readonly hasAvatar: boolean;
  /** English-only, as `TeacherCardDto.Subjects` is. */
  readonly subjects: readonly string[];
  /** The context Offer is the only source carrying a translated subject name. */
  readonly subjectEnglish: string;
  readonly subjectArabic: string;
  readonly qualified: boolean;
  readonly rating: number | null;
  readonly ratingCount: number;
  readonly startingPrice: number | null;
  readonly currency: string;
  readonly deliveryHours: number | null;
}

export const FeaturedTeacher = {
  subject(teacher: FeaturedTeacher, isArabic: boolean): string {
    return isArabic
      ? (teacher.subjectArabic || teacher.subjectEnglish)
      : teacher.subjectEnglish;
  },

  hasRating(teacher: FeaturedTeacher): boolean {
    return teacher.rating != null && teacher.ratingCount > 0;
  },

  /**
   * Chips carry only what the subject line above them does not already say.
   * `Subjects` is English-only, so a chip repeating the subject showed "Physics"
   * under "الفيزياء" — the same fact twice, in two languages. A teacher with one
   * subject gets no chip row at all.
   */
  topics(teacher: FeaturedTeacher): readonly string[] {
    const shown = teacher.subjectEnglish.toLowerCase();
    return teacher.subjects
      .filter(name => String(name ?? '').toLowerCase() !== shown)
      .slice(0, 3);
  }
} as const;

export const FeaturedSubject = {
  name(subject: FeaturedSubject, isArabic: boolean): string {
    return isArabic
      ? (subject.nameArabic || subject.nameEnglish)
      : (subject.nameEnglish || subject.nameArabic);
  }
} as const;

export const CatalogService = {
  name(service: CatalogService, isArabic: boolean): string {
    return isArabic
      ? (service.nameArabic || service.nameEnglish)
      : (service.nameEnglish || service.nameArabic);
  },

  description(service: CatalogService, isArabic: boolean): string {
    return isArabic
      ? (service.descriptionArabic || service.descriptionEnglish)
      : (service.descriptionEnglish || service.descriptionArabic);
  }
} as const;

/**
 * Wayfinding numerals. Decorative rather than data, but they still follow the
 * reader's numeral system, so Arabic gets Arabic-Indic digits padded with an
 * Arabic-Indic zero. Every element carrying one is `aria-hidden`.
 */
export function catalogueIndex(n: number, isArabic: boolean): string {
  if (!isArabic) return String(n).padStart(2, '0');
  return new Intl.NumberFormat('ar-SA').format(n).padStart(2, '٠');
}
