/**
 * The Admin catalog (J13-01..03): Catalog Services with their price policy, subjects, the qualification
 * topics that open a subject to applicants, specialist topics, education levels and teaching languages.
 *
 * The API's catalog rows share one wide DTO; each kind here keeps only the fields an Admin decides on.
 * Codes, categories, icons of services and ordering are carried along unchanged, never shown.
 */
export type CatalogKind = 'services' | 'subjects' | 'qualification-topics' | 'topics' | 'education-levels' | 'languages';

export const CATALOG_KINDS: readonly CatalogKind[] =
  ['services', 'subjects', 'qualification-topics', 'topics', 'education-levels', 'languages'];

type Json = Record<string, unknown>;
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export interface CatalogService {
  readonly id: string;
  readonly nameEn: string; readonly nameAr: string;
  readonly descriptionEn: string; readonly descriptionAr: string;
  readonly isLive: boolean;
  readonly isActive: boolean;
  readonly minPrice: number; readonly maxPrice: number; readonly defaultPrice: number; readonly recommendedPrice: number;
  readonly minDeliveryHours: number | null; readonly defaultDeliveryHours: number | null;
  readonly recommendedDeliveryHours: number | null; readonly maxDeliveryHours: number | null;
  readonly defaultRevisions: number; readonly maxRevisions: number;
  readonly durations: readonly number[];
  /** Teachers offering this service now; turning it off takes it away from them. */
  readonly teacherCount: number;
  /** Everything the Admin does not edit, sent back unchanged. */
  readonly carry: Json;
}

export interface Subject {
  readonly id: string; readonly nameEn: string; readonly nameAr: string;
  readonly icon: string; readonly displayOrder: number; readonly isActive: boolean;
}

export interface QualificationTopic {
  readonly id: string; readonly subjectId: string;
  readonly titleEn: string; readonly titleAr: string;
  readonly instructionsEn: string; readonly instructionsAr: string;
  readonly minSeconds: number; readonly expectedSeconds: number; readonly maxSeconds: number;
  readonly guidanceEn: string; readonly guidanceAr: string;
  readonly isActive: boolean;
  readonly resources: readonly { readonly id: string; readonly name: string; readonly url: string }[];
}

export interface Topic {
  readonly id: string; readonly subjectId: string; readonly nameEn: string; readonly nameAr: string;
  readonly level: string; readonly isActive: boolean;
}

export interface EducationLevel { readonly id: string; readonly nameEn: string; readonly nameAr: string; readonly isActive: boolean }
export interface Language { readonly id: string; readonly name: string; readonly code: string; readonly isActive: boolean }

export const LIVE_DURATIONS = [30, 60, 90, 120] as const;
/** The levels already in use; an older free-text value is kept and shown as it is. */
export const TOPIC_LEVELS = ['Foundational', 'Standard', 'Advanced'] as const;

export const Catalog = {
  service(x: Json): CatalogService {
    return {
      id: text(x['id']),
      nameEn: text(x['nameEn']) || text(x['name']), nameAr: text(x['nameAr']),
      descriptionEn: text(x['descriptionEn']) || text(x['detail']), descriptionAr: text(x['descriptionAr']),
      isLive: x['orderType'] === 'live_session' || x['requiresScheduling'] === true,
      isActive: x['isActive'] === true,
      minPrice: num(x['minPrice']) ?? 0, maxPrice: num(x['maxPrice']) ?? 0,
      defaultPrice: num(x['defaultPrice']) ?? 0, recommendedPrice: num(x['recommendedPrice']) ?? 0,
      minDeliveryHours: num(x['minimumDeliveryHours']), defaultDeliveryHours: num(x['defaultDeliveryHours']),
      recommendedDeliveryHours: num(x['recommendedDeliveryHours']), maxDeliveryHours: num(x['maximumDeliveryHours']),
      defaultRevisions: num(x['defaultRevisions']) ?? 0, maxRevisions: num(x['maximumRevisions']) ?? 0,
      durations: Array.isArray(x['allowedDurations']) ? (x['allowedDurations'] as unknown[]).map(Number).filter(Number.isFinite) : [],
      teacherCount: num(x['enabledTeacherCount']) ?? 0,
      carry: {
        code: x['code'] ?? null, categoryCode: x['categoryCode'], iconCode: x['iconCode'], orderType: x['orderType'],
        qualificationPolicy: x['qualificationPolicy'], currencyCode: x['currencyCode'] ?? 'SAR',
        displayOrder: num(x['displayOrder']) ?? 0, isPublic: x['isPublic'] !== false, teacherSelectable: x['teacherSelectable'] !== false
      }
    };
  },
  subject(x: Json): Subject {
    return { id: text(x['id']), nameEn: text(x['nameEn']) || text(x['name']), nameAr: text(x['nameAr']),
      icon: text(x['detail']), displayOrder: num(x['displayOrder']) ?? 0, isActive: x['isActive'] === true };
  },
  qualificationTopic(x: Json): QualificationTopic {
    const resources = Array.isArray(x['resources']) ? (x['resources'] as Json[]) : [];
    return {
      id: text(x['id']), subjectId: text(x['parentId']),
      titleEn: text(x['name']), titleAr: text(x['titleAr']) || text(x['nameAr']),
      instructionsEn: text(x['detail']), instructionsAr: text(x['instructionsAr']),
      minSeconds: num(x['minVideoSeconds']) ?? 30, expectedSeconds: num(x['expectedVideoSeconds']) ?? 180,
      maxSeconds: num(x['maxVideoSeconds']) ?? 180,
      guidanceEn: text(x['evaluationGuidance']), guidanceAr: text(x['evaluationGuidanceAr']),
      isActive: x['isActive'] === true,
      resources: resources.map(r => ({ id: text(r['id']), name: text(r['displayName']) || text(r['originalFileName']), url: text(r['url']) }))
    };
  },
  topic(x: Json): Topic {
    return { id: text(x['id']), subjectId: text(x['parentId']), nameEn: text(x['nameEn']) || text(x['name']),
      nameAr: text(x['nameAr']), level: text(x['detail']), isActive: x['isActive'] === true };
  },
  educationLevel(x: Json): EducationLevel {
    return { id: text(x['id']), nameEn: text(x['name']), nameAr: text(x['nameAr']), isActive: x['isActive'] === true };
  },
  language(x: Json): Language {
    return { id: text(x['id']), name: text(x['name']), code: text(x['code']), isActive: x['isActive'] === true };
  },
  /** Subjects a teacher can apply to: active, with at least one active qualification topic. */
  openSubjectIds(topics: readonly QualificationTopic[]): ReadonlySet<string> {
    return new Set(topics.filter(t => t.isActive).map(t => t.subjectId));
  },
  nextOrder(orders: readonly number[]): number {
    return Math.min(10000, (orders.length ? Math.max(...orders) : 0) + 10);
  }
} as const;

// ---- drafts, validation and payloads ----

/** A problem is a translation key; the page shows it under the field. */
export type Problems<T> = Partial<Record<keyof T, string>>;
const required = (value: string) => value.trim().length > 0;
const between = (value: number | null, min: number, max: number) => value !== null && value >= min && value <= max;

export interface ServiceDraft {
  nameEn: string; nameAr: string; descriptionEn: string; descriptionAr: string; isLive: boolean;
  minPrice: number | null; defaultPrice: number | null; maxPrice: number | null;
  minDeliveryHours: number | null; defaultDeliveryHours: number | null; maxDeliveryHours: number | null;
  defaultRevisions: number | null; maxRevisions: number | null; durations: number[];
}

export const ServiceForm = {
  empty(isLive = false): ServiceDraft {
    return isLive
      ? { nameEn: '', nameAr: '', descriptionEn: '', descriptionAr: '', isLive, minPrice: 60, defaultPrice: 150, maxPrice: 600,
          minDeliveryHours: null, defaultDeliveryHours: null, maxDeliveryHours: null, defaultRevisions: 0, maxRevisions: 0, durations: [30, 60, 90, 120] }
      : { nameEn: '', nameAr: '', descriptionEn: '', descriptionAr: '', isLive, minPrice: 50, defaultPrice: 120, maxPrice: 800,
          minDeliveryHours: 12, defaultDeliveryHours: 48, maxDeliveryHours: 336, defaultRevisions: 2, maxRevisions: 5, durations: [] };
  },
  from(s: CatalogService): ServiceDraft {
    return { nameEn: s.nameEn, nameAr: s.nameAr, descriptionEn: s.descriptionEn, descriptionAr: s.descriptionAr, isLive: s.isLive,
      minPrice: s.minPrice, defaultPrice: s.defaultPrice, maxPrice: s.maxPrice,
      minDeliveryHours: s.minDeliveryHours, defaultDeliveryHours: s.defaultDeliveryHours, maxDeliveryHours: s.maxDeliveryHours,
      defaultRevisions: s.defaultRevisions, maxRevisions: s.maxRevisions, durations: [...s.durations] };
  },
  problems(d: ServiceDraft): Problems<ServiceDraft> {
    const p: Problems<ServiceDraft> = {};
    if (!required(d.nameEn)) p.nameEn = 'admin_problem_required';
    if (!required(d.nameAr)) p.nameAr = 'admin_problem_required';
    if (!required(d.descriptionEn)) p.descriptionEn = 'admin_problem_required';
    if (!required(d.descriptionAr)) p.descriptionAr = 'admin_problem_required';
    if (!between(d.minPrice, 0.01, 1_000_000)) p.minPrice = 'admin_problem_price';
    if (!between(d.maxPrice, 0.01, 1_000_000)) p.maxPrice = 'admin_problem_price';
    else if (d.minPrice !== null && d.maxPrice! < d.minPrice) p.maxPrice = 'admin_problem_max_below_min';
    if (!between(d.defaultPrice, d.minPrice ?? 0.01, d.maxPrice ?? 1_000_000)) p.defaultPrice = 'admin_problem_default_in_range';
    if (d.isLive) {
      if (!d.durations.length) p.durations = 'admin_problem_duration';
    } else {
      if (!between(d.minDeliveryHours, 1, 8760)) p.minDeliveryHours = 'admin_problem_hours';
      if (!between(d.maxDeliveryHours, 1, 8760)) p.maxDeliveryHours = 'admin_problem_hours';
      else if (d.minDeliveryHours !== null && d.maxDeliveryHours! < d.minDeliveryHours) p.maxDeliveryHours = 'admin_problem_max_below_min';
      if (!between(d.defaultDeliveryHours, d.minDeliveryHours ?? 1, d.maxDeliveryHours ?? 8760)) p.defaultDeliveryHours = 'admin_problem_default_in_range';
      if (!between(d.maxRevisions, 0, 20)) p.maxRevisions = 'admin_problem_revisions';
      if (!between(d.defaultRevisions, 0, d.maxRevisions ?? 20)) p.defaultRevisions = 'admin_problem_default_in_range';
    }
    return p;
  },
  /**
   * The full ServiceCatalogInput. The recommended price and delivery time are not asked for (DEC-01 set them
   * equal to the defaults): an existing one is kept while it still fits, otherwise it follows the default.
   */
  payload(d: ServiceDraft, existing: CatalogService | null, isActive: boolean, displayOrder: number): Json {
    const fits = (value: number | null, min: number | null, max: number | null) =>
      value !== null && min !== null && max !== null && value >= min && value <= max;
    const carry = existing?.carry ?? {
      code: null, categoryCode: d.isLive ? 'live_learning' : 'academic_support', iconCode: d.isLive ? 'live' : 'academic_support',
      orderType: d.isLive ? 'live_session' : 'async_request', qualificationPolicy: 'subject_qualification_required',
      currencyCode: 'SAR', displayOrder, isPublic: true, teacherSelectable: true
    };
    const recommendedPrice = existing && fits(existing.recommendedPrice, d.minPrice, d.maxPrice) ? existing.recommendedPrice : d.defaultPrice;
    const recommendedHours = existing && fits(existing.recommendedDeliveryHours, d.minDeliveryHours, d.maxDeliveryHours)
      ? existing.recommendedDeliveryHours : d.defaultDeliveryHours;
    return {
      ...carry,
      nameEn: d.nameEn.trim(), nameAr: d.nameAr.trim(), descriptionEn: d.descriptionEn.trim(), descriptionAr: d.descriptionAr.trim(),
      isActive,
      minimumPrice: d.minPrice, defaultPrice: d.defaultPrice, recommendedPrice, maximumPrice: d.maxPrice,
      minimumDeliveryHours: d.isLive ? null : d.minDeliveryHours,
      defaultDeliveryHours: d.isLive ? null : d.defaultDeliveryHours,
      recommendedDeliveryHours: d.isLive ? null : recommendedHours,
      maximumDeliveryHours: d.isLive ? null : d.maxDeliveryHours,
      defaultRevisions: d.isLive ? 0 : d.defaultRevisions, maximumRevisions: d.isLive ? 0 : d.maxRevisions,
      allowedDurations: d.isLive ? [...d.durations].sort((a, b) => a - b) : []
    };
  }
} as const;

export interface SubjectDraft { nameEn: string; nameAr: string; icon: string }
export const SubjectForm = {
  empty: (): SubjectDraft => ({ nameEn: '', nameAr: '', icon: '📘' }),
  from: (s: Subject): SubjectDraft => ({ nameEn: s.nameEn, nameAr: s.nameAr, icon: s.icon }),
  problems(d: SubjectDraft): Problems<SubjectDraft> {
    const p: Problems<SubjectDraft> = {};
    if (!required(d.nameEn)) p.nameEn = 'admin_problem_required';
    if (!required(d.nameAr)) p.nameAr = 'admin_problem_required';
    if (!required(d.icon)) p.icon = 'admin_problem_required';
    return p;
  },
  /** The update contract stores the icon in `detail` and blanks it when left out, so it is always sent. */
  update: (d: SubjectDraft, order: number): Json => ({ name: d.nameEn.trim(), nameAr: d.nameAr.trim(), detail: d.icon.trim(), displayOrder: order }),
  create: (d: SubjectDraft, order: number): Json => ({ name: d.nameEn.trim(), nameAr: d.nameAr.trim(), icon: d.icon.trim(), displayOrder: order })
} as const;

export interface QualificationDraft {
  subjectId: string; titleEn: string; titleAr: string; instructionsEn: string; instructionsAr: string;
  minSeconds: number | null; expectedSeconds: number | null; maxSeconds: number | null; guidanceEn: string; guidanceAr: string;
}
export const QualificationForm = {
  empty: (subjectId = ''): QualificationDraft => ({ subjectId, titleEn: '', titleAr: '', instructionsEn: '', instructionsAr: '',
    minSeconds: 60, expectedSeconds: 120, maxSeconds: 180, guidanceEn: '', guidanceAr: '' }),
  from: (t: QualificationTopic): QualificationDraft => ({ subjectId: t.subjectId, titleEn: t.titleEn, titleAr: t.titleAr,
    instructionsEn: t.instructionsEn, instructionsAr: t.instructionsAr, minSeconds: t.minSeconds, expectedSeconds: t.expectedSeconds,
    maxSeconds: t.maxSeconds, guidanceEn: t.guidanceEn, guidanceAr: t.guidanceAr }),
  problems(d: QualificationDraft, editing: boolean): Problems<QualificationDraft> {
    const p: Problems<QualificationDraft> = {};
    if (!editing && !d.subjectId) p.subjectId = 'admin_problem_required';
    if (!required(d.titleEn)) p.titleEn = 'admin_problem_required';
    if (!required(d.titleAr)) p.titleAr = 'admin_problem_required';
    if (!required(d.instructionsEn)) p.instructionsEn = 'admin_problem_required';
    if (!required(d.instructionsAr)) p.instructionsAr = 'admin_problem_required';
    if (!between(d.maxSeconds, 30, 600)) p.maxSeconds = 'admin_problem_seconds';
    if (!editing) {
      if (!between(d.minSeconds, 30, d.maxSeconds ?? 600)) p.minSeconds = 'admin_problem_seconds';
      if (!between(d.expectedSeconds, d.minSeconds ?? 30, d.maxSeconds ?? 600)) p.expectedSeconds = 'admin_problem_default_in_range';
    } else if (d.maxSeconds !== null && d.minSeconds !== null && d.maxSeconds < d.minSeconds) {
      p.maxSeconds = 'admin_problem_max_below_min';
    }
    return p;
  },
  create: (d: QualificationDraft, order: number): Json => ({
    subjectId: d.subjectId, name: d.titleEn.trim(), titleAr: d.titleAr.trim(),
    instructions: d.instructionsEn.trim(), instructionsAr: d.instructionsAr.trim(),
    minVideoSeconds: d.minSeconds, expectedVideoSeconds: d.expectedSeconds, maxVideoSeconds: d.maxSeconds,
    evaluationGuidance: d.guidanceEn.trim(), evaluationGuidanceAr: d.guidanceAr.trim(), displayOrder: order }),
  /** The update contract changes the title, the instructions and the longest allowed demo; the rest is fixed. */
  update: (d: QualificationDraft): Json => ({
    name: d.titleEn.trim(), nameAr: d.titleAr.trim(), detail: d.instructionsEn.trim(), instructionsAr: d.instructionsAr.trim(),
    maxVideoSeconds: d.maxSeconds })
} as const;

export interface TopicDraft { subjectId: string; nameEn: string; nameAr: string; level: string }
export const TopicForm = {
  empty: (subjectId = ''): TopicDraft => ({ subjectId, nameEn: '', nameAr: '', level: 'Standard' }),
  from: (t: Topic): TopicDraft => ({ subjectId: t.subjectId, nameEn: t.nameEn, nameAr: t.nameAr, level: t.level || 'Standard' }),
  problems(d: TopicDraft, editing: boolean): Problems<TopicDraft> {
    const p: Problems<TopicDraft> = {};
    if (!editing && !d.subjectId) p.subjectId = 'admin_problem_required';
    if (!required(d.nameEn)) p.nameEn = 'admin_problem_required';
    if (!required(d.nameAr)) p.nameAr = 'admin_problem_required';
    if (!required(d.level)) p.level = 'admin_problem_required';
    return p;
  },
  create: (d: TopicDraft): Json => ({ subjectId: d.subjectId, name: d.nameEn.trim(), nameAr: d.nameAr.trim(), difficulty: d.level }),
  update: (d: TopicDraft): Json => ({ name: d.nameEn.trim(), nameAr: d.nameAr.trim(), detail: d.level })
} as const;

export interface LevelDraft { nameEn: string; nameAr: string }
export const LevelForm = {
  empty: (): LevelDraft => ({ nameEn: '', nameAr: '' }),
  from: (l: EducationLevel): LevelDraft => ({ nameEn: l.nameEn, nameAr: l.nameAr }),
  problems(d: LevelDraft): Problems<LevelDraft> {
    const p: Problems<LevelDraft> = {};
    if (!required(d.nameEn)) p.nameEn = 'admin_problem_required';
    if (!required(d.nameAr)) p.nameAr = 'admin_problem_required';
    return p;
  },
  payload: (d: LevelDraft): Json => ({ name: d.nameEn.trim(), nameAr: d.nameAr.trim() })
} as const;

export interface LanguageDraft { name: string; code: string }
export const LanguageForm = {
  empty: (): LanguageDraft => ({ name: '', code: '' }),
  from: (l: Language): LanguageDraft => ({ name: l.name, code: l.code }),
  problems(d: LanguageDraft): Problems<LanguageDraft> {
    const p: Problems<LanguageDraft> = {};
    if (!required(d.name)) p.name = 'admin_problem_required';
    if (!/^[a-z]{2,3}$/.test(d.code.trim().toLowerCase())) p.code = 'admin_problem_language_code';
    return p;
  },
  payload: (d: LanguageDraft): Json => ({ name: d.name.trim(), detail: d.code.trim().toLowerCase() })
} as const;

export interface ResourceDraft { nameEn: string; nameAr: string; url: string }
export const ResourceForm = {
  empty: (): ResourceDraft => ({ nameEn: '', nameAr: '', url: '' }),
  problems(d: ResourceDraft): Problems<ResourceDraft> {
    const p: Problems<ResourceDraft> = {};
    if (!required(d.nameEn)) p.nameEn = 'admin_problem_required';
    if (!/^https:\/\/\S+$/i.test(d.url.trim())) p.url = 'admin_problem_url';
    return p;
  },
  payload: (d: ResourceDraft): Json => ({ displayName: d.nameEn.trim(), displayNameAr: d.nameAr.trim(), url: d.url.trim() })
} as const;
