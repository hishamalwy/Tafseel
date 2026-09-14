/**
 * The qualification topic a teacher records their demo against, and the rules
 * that govern the recording.
 *
 * The duration bounds are the assignment's, not the page's: each topic publishes
 * how long its demo must run, and a demo outside that window is rejected by the
 * API. Checking it in the browser first is a courtesy, so the rules live where
 * both the check and the message can read them.
 */

export interface AssignmentResource {
  readonly displayName: string;
  readonly displayNameArabic: string;
  readonly fileName: string;
  readonly url: string;
  readonly contentType: string;
  readonly isFile: boolean;
  readonly isRequired: boolean;
}

export interface QualificationTopic {
  readonly id: string;
  readonly parentId: string;
  readonly name: string;
  readonly nameArabic: string;
  readonly titleArabic: string;
  readonly instructions: string;
  readonly instructionsArabic: string;
  readonly evaluationGuidance: string;
  readonly evaluationGuidanceArabic: string;
  readonly minVideoSeconds: number;
  readonly maxVideoSeconds: number;
  readonly expectedVideoSeconds: number;
  readonly resources: readonly AssignmentResource[];
}

/** What the API assumes when a topic publishes no bounds of its own. */
const DEFAULT_MIN_SECONDS = 30;
const DEFAULT_MAX_SECONDS = 600;

export interface DurationRange {
  readonly min: number;
  readonly max: number;
  readonly expected: number;
}

export const Assignment = {
  title(topic: QualificationTopic, isArabic: boolean): string {
    return isArabic ? (topic.titleArabic || topic.nameArabic || topic.name) : topic.name;
  },

  /** The same title in the other language, when it differs and exists. */
  alternateTitle(topic: QualificationTopic, isArabic: boolean): string {
    const other = isArabic ? topic.name : (topic.titleArabic || topic.nameArabic);
    return other && other !== Assignment.title(topic, isArabic) ? other : '';
  },

  instructions(topic: QualificationTopic, isArabic: boolean): string {
    return (isArabic && topic.instructionsArabic) ? topic.instructionsArabic : topic.instructions;
  },

  guidance(topic: QualificationTopic, isArabic: boolean): string {
    return (isArabic && topic.evaluationGuidanceArabic)
      ? topic.evaluationGuidanceArabic
      : topic.evaluationGuidance;
  },

  duration(topic: QualificationTopic | null): DurationRange {
    const min = topic?.minVideoSeconds || DEFAULT_MIN_SECONDS;
    const max = topic?.maxVideoSeconds || DEFAULT_MAX_SECONDS;
    return { min, max, expected: topic?.expectedVideoSeconds || max };
  },

  withinRange(seconds: number, range: DurationRange): boolean {
    return seconds >= range.min && seconds <= range.max;
  },

  /**
   * What to send when the browser could not read the video's duration.
   *
   * Clamped into the accepted window rather than guessed at zero: a browser that
   * cannot decode the container is not evidence about the recording, and sending
   * an out-of-range number would fail the upload for a reason that has nothing
   * to do with the teacher's demo.
   */
  fallbackSeconds(range: DurationRange): number {
    return Math.min(range.max, Math.max(range.min, range.expected || range.min));
  },

  resourceName(resource: AssignmentResource, isArabic: boolean): string {
    return (isArabic && resource.displayNameArabic)
      ? resource.displayNameArabic
      : resource.displayName;
  },

  /**
   * Only same-origin API paths and plain http(s) links are followed. A resource
   * URL arrives from the catalogue, so a `javascript:` or `data:` scheme in it
   * must not become a link the teacher can click.
   */
  safeUrl(value: string, base: string): string {
    if (!value) return '';
    if (value.startsWith('/api/')) return value;
    try {
      const parsed = new URL(value, base);
      return /^https?:$/.test(parsed.protocol) ? parsed.href : '';
    } catch {
      return '';
    }
  },

  /**
   * The API path behind a resource URL, which is what a credentialed fetch needs.
   * An absolute URL pointing anywhere else answers empty rather than being
   * rewritten into one.
   */
  apiPath(url: string, base: string): string {
    if (!url) return '';
    const prefix = '/api/v1';
    if (url.startsWith(`${prefix}/`)) return url.slice(prefix.length);
    try {
      const parsed = new URL(url, base);
      return parsed.pathname.startsWith(`${prefix}/`)
        ? parsed.pathname.slice(prefix.length) + parsed.search
        : '';
    } catch {
      return '';
    }
  }
} as const;

/** `m:ss`, the way a recording length is read. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** KB below a megabyte, MB above it — the resolution a person can act on. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The demo container formats the API accepts. */
export const DEMO_FILE_PATTERN = /\.(mp4|webm)$/i;
