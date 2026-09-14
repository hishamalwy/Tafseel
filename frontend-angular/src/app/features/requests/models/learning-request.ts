/**
 * A learning request: what a student needs, described well enough for a teacher
 * to price it.
 *
 * The heart of this file is `composeDescription`. The wizard collects the brief
 * in labelled pieces — goal, per-service prompts, topic, explanation style,
 * language, notes — but the API takes one description string. Composing it in
 * one deterministic place is what keeps a request readable to the teacher and
 * lets a saved draft be reconstructed exactly.
 */

export type ExplanationStyle = 'step_by_step' | 'concise' | 'visual' | 'worked_examples';

const EXPLANATION_STYLES: readonly ExplanationStyle[] =
  ['step_by_step', 'concise', 'visual', 'worked_examples'];

export function isExplanationStyle(value: unknown): value is ExplanationStyle {
  return typeof value === 'string' && (EXPLANATION_STYLES as readonly string[]).includes(value);
}

/** Prompt sets per service kind; the keys are also the composition order. */
const PROMPTS_BY_SERVICE: Readonly<Record<string, readonly string[]>> = {
  explanation: ['whatYouTried', 'whereStuck', 'deadlinePressure'],
  solution: ['problemSource', 'requiredMethod', 'showStepsLevel'],
  summary: ['sourceMaterial', 'lengthTarget', 'focusAreas'],
  review: ['workToReview', 'rubric', 'feedbackDepth'],
  default: ['whatYouTried', 'whereStuck']
};

export function promptsForService(serviceCode: string | null | undefined): readonly string[] {
  const code = String(serviceCode ?? '').trim().toLowerCase();
  return PROMPTS_BY_SERVICE[code] ?? PROMPTS_BY_SERVICE['default']!;
}

export interface RequestableService {
  readonly id: string;
  readonly subjectId: string | null;
  readonly serviceCatalogCode: string;
  readonly serviceNameEnglish: string;
  readonly serviceNameArabic: string;
  readonly price: number | null;
  readonly currency: string;
  readonly deliveryDays: number | null;
  readonly canRequest: boolean;
  readonly requiresScheduling: boolean;
}

/** A scheduled service is booked, not requested; the wizard must not offer it. */
export function isSchedulingService(service: RequestableService): boolean {
  return service.requiresScheduling
    || String(service.serviceCatalogCode ?? '').toLowerCase() === 'live_session';
}

export function requestableServices(
  services: readonly RequestableService[] | null | undefined
): readonly RequestableService[] {
  return (services ?? []).filter(s => s?.canRequest && !isSchedulingService(s));
}

export interface DescriptionInput {
  readonly goal: string;
  readonly prompts: Readonly<Record<string, string>>;
  readonly promptOrder: readonly string[];
  readonly topicLabel: string;
  readonly explanationStyle: string;
  readonly preferredTeachingLanguageLabel: string;
  readonly constraints: string;
}

export interface DescriptionLabels {
  readonly goal: string;
  readonly serviceDetails: string;
  readonly topic: string;
  readonly explanationPreference: string;
  readonly preferredTeachingLanguage: string;
  readonly additionalNotes: string;
  readonly prompt: Readonly<Record<string, string>>;
  readonly style: Readonly<Record<string, string>>;
}

/**
 * Build the description the teacher reads.
 *
 * Sections appear in a fixed order and empty ones are dropped, so two students
 * who filled the same fields produce the same brief and a half-finished wizard
 * never emits a heading with nothing under it.
 */
export function composeDescription(input: DescriptionInput, labels: DescriptionLabels): string {
  const sections: string[] = [];

  const goal = input.goal.trim();
  if (goal) sections.push(`${labels.goal}:\n${goal}`);

  const details = input.promptOrder
    .map(key => ({ key, value: (input.prompts[key] ?? '').trim() }))
    .filter(entry => entry.value)
    .map(entry => `- ${labels.prompt[entry.key] ?? entry.key}: ${entry.value}`);
  if (details.length) sections.push(`${labels.serviceDetails}:\n${details.join('\n')}`);

  const topic = input.topicLabel.trim();
  if (topic) sections.push(`${labels.topic}:\n${topic}`);

  if (isExplanationStyle(input.explanationStyle)) {
    const style = labels.style[input.explanationStyle] ?? input.explanationStyle;
    sections.push(`${labels.explanationPreference}:\n${style}`);
  }

  const language = input.preferredTeachingLanguageLabel.trim();
  if (language) sections.push(`${labels.preferredTeachingLanguage}:\n${language}`);

  const notes = input.constraints.trim();
  if (notes) sections.push(`${labels.additionalNotes}:\n${notes}`);

  return sections.join('\n\n').trim();
}

/** Attachment limits, mirroring what the endpoint accepts. */
/**
 * The wizard asks for a day; the API takes an instant that must be in the future
 * (`CreateLearningRequest.PreferredDeliveryAt`). The day means "by the end of it" in the
 * student's own time zone. Returns null for an empty, malformed or past day.
 */
export function preferredDeliveryAt(day: string, now: Date = new Date()): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? '');
  if (!match) return null;
  const endOfDay = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 0, 0);
  if (Number.isNaN(endOfDay.getTime()) || endOfDay.getDate() !== Number(match[3])) return null;
  return endOfDay.getTime() > now.getTime() ? endOfDay.toISOString() : null;
}

/** Today as a date input value, for its `min`. */
export function todayInputValue(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const REQUEST_FILE_LIMITS = {
  maxFiles: 5,
  maxBytes: 25 * 1024 * 1024,
  acceptedTypes: [
    'image/jpeg', 'image/png', 'application/pdf', 'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ] as const
} as const;

export type FileRejection = 'too-large' | 'wrong-type' | 'too-many';

export function validateFile(
  file: { size: number; type: string }, existingCount: number
): FileRejection | null {
  if (existingCount >= REQUEST_FILE_LIMITS.maxFiles) return 'too-many';
  if (file.size > REQUEST_FILE_LIMITS.maxBytes) return 'too-large';
  if (!(REQUEST_FILE_LIMITS.acceptedTypes as readonly string[]).includes(file.type)) {
    return 'wrong-type';
  }
  return null;
}

/** What a saved draft holds. `fileNames` only: the files themselves cannot persist. */
export interface RequestDraft {
  readonly wizardVersion: number;
  readonly serviceId: string;
  readonly step: number;
  readonly title: string;
  readonly goal: string;
  readonly constraints: string;
  readonly topicLabel: string;
  readonly explanationStyle: string;
  readonly preferredTeachingLanguageId: string;
  readonly prompts: Readonly<Record<string, string>>;
  readonly deliveryDate: string;
  readonly flexibleBudget: boolean;
  readonly budget: string;
  readonly fileNames: readonly string[];
  readonly agreed: boolean;
}

export const DRAFT_VERSION = 2;

export function draftKey(studentId: string, teacherId: string): string {
  return `tafseel-request-draft:${studentId || 'guest'}:${teacherId}`;
}
