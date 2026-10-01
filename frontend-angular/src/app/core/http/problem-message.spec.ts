import { HttpErrorResponse } from '@angular/common/http';
import { afterEach, describe, expect, it } from 'vitest';
import ar from '../../../../public/locale/ar.json';
import { problemMessage } from './problem-message';

/** An Arabic reader must never be handed the server's English sentence. */
describe('problemMessage', () => {
  const table = ar as Record<string, string>;
  const arabic = (key: string, fallback: string) => table[key] ?? fallback;
  const refused = (error: unknown) => new HttpErrorResponse({ status: 400, error });

  afterEach(() => document.documentElement.setAttribute('lang', 'en'));

  it('translates a server code the Arabic table knows', () => {
    document.documentElement.setAttribute('lang', 'ar');
    expect(problemMessage(refused({ code: 'withdrawal_below_minimum', detail: 'Minimum withdrawal is 50 SAR.' }), arabic).text)
      .toBe('هذا المبلغ أقل من الحد الأدنى للسحب.');
  });

  it('gives an Arabic reader the generic Arabic line, not the English detail, for an unknown code', () => {
    document.documentElement.setAttribute('lang', 'ar');
    const message = problemMessage(refused({ code: 'not_a_code', detail: 'Something specific.', errors: { Price: ['Too low'] } }), arabic);
    expect(message.text).toBe(table['unexpected_error']);
    expect(message.fields).toEqual({ price: 'Too low' });
  });

  it('asks the reader to wait, in their language, when they were refused for trying too often', () => {
    document.documentElement.setAttribute('lang', 'ar');
    const tooMany = new HttpErrorResponse({ status: 429, error: null });
    expect(problemMessage(tooMany, arabic).text).toBe(table['auth_rate_limited']);
  });

  it('still shows an English reader the server sentence for an unknown code', () => {
    document.documentElement.setAttribute('lang', 'en');
    const english = (_key: string, fallback: string) => fallback;
    expect(problemMessage(refused({ code: 'not_a_code', detail: 'Something specific.' }), english).text).toBe('Something specific.');
  });
});
