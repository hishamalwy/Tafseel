import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetailsDto } from './api.dto';

/** What a refused request said, in the reader's language where the vocabulary has it. */
export interface ProblemMessage {
  readonly status: number;
  readonly code: string;
  /** One sentence for an alert. */
  readonly text: string;
  /** Validation messages by camel-cased field name (`price`, `rules[0].end` → `rules`). */
  readonly fields: Readonly<Record<string, string>>;
}

type Translate = (key: string, fallback: string) => string;

/**
 * The API answers a refusal with a reason and often a stable `code`. A translated
 * `err_<code>` wins; otherwise the server's own sentence is shown, because an accurate
 * English reason beats a localised non-answer; the generic line is kept for failures
 * that carry neither, such as a dropped connection.
 */
export function problemMessage(error: unknown, t: Translate): ProblemMessage {
  const response = error instanceof HttpErrorResponse ? error : null;
  const body = (response?.error && typeof response.error === 'object' ? response.error : {}) as ProblemDetailsDto;
  const code = body.code ?? (response?.status === 409 ? 'concurrency_conflict' : '');
  const fields: Record<string, string> = {};
  for (const [key, messages] of Object.entries(body.errors ?? {})) {
    const name = fieldName(key);
    if (name && messages?.length && !fields[name]) fields[name] = messages[0];
  }
  const translated = code ? t(`err_${code}`, '') : '';
  const offline = response?.status === 0;
  const text = translated
    || (offline ? t('common_offline', 'Could not reach Tafseel. Check your connection and try again.') : '')
    || body.detail
    || Object.values(fields)[0]
    || body.title
    || t('unexpected_error', 'Something went wrong.');
  return { status: response?.status ?? 0, code, text, fields };
}

/** `$.Rules[2].End`, `Price` and `input.price` all name the field `rules` / `price`. */
function fieldName(key: string): string {
  const first = key.replace(/^\$\.?/, '').replace(/^input\./i, '').split(/[.[]/)[0] ?? '';
  return first ? first[0].toLowerCase() + first.slice(1) : '';
}
