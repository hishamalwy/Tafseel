import { describe, expect, it } from 'vitest';
import ar from '../../../../../public/locale/ar.json';
import en from '../../../../../public/locale/en.json';
import {
  ALL_PROMPT_KEYS, PROMPT_LABELS, composeDescription, promptsForService
} from './learning-request';

const table = (t: unknown) => t as Record<string, string>;

/**
 * UX-06. The wizard asks its questions by key — `whatYouTried`, `whereStuck`. A student must never meet one
 * of those keys, and never the word "undefined" where an answer they did not give would be.
 */
describe('request brief prompts', () => {
  it('asks something for every service kind, and nothing unnamed', () => {
    expect(ALL_PROMPT_KEYS.length).toBeGreaterThan(0);
    for (const key of ALL_PROMPT_KEYS) {
      expect(PROMPT_LABELS[key], `English wording for ${key}`).toBeTruthy();
    }
  });

  it('has Arabic and English wording shipped for every prompt it can ask', () => {
    for (const key of ALL_PROMPT_KEYS) {
      expect(table(ar)[`req_prompt_${key}`], `Arabic label for ${key}`).toBeTruthy();
      expect(table(en)[`req_prompt_${key}`], `English label for ${key}`).toBeTruthy();
    }
  });

  it('never presents a key as if it were a question', () => {
    for (const key of ALL_PROMPT_KEYS) {
      // A label that is the key back again is the defect this ticket exists to remove.
      expect(table(ar)[`req_prompt_${key}`]).not.toBe(key);
      expect(table(en)[`req_prompt_${key}`]).not.toBe(key);
      expect(table(ar)[`req_prompt_${key}`]).not.toMatch(/[A-Za-z]/);
    }
  });

  it('falls back to a real question when no service is known', () => {
    const keys = promptsForService(null);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(PROMPT_LABELS[key]).toBeTruthy();
  });
});

describe('composeDescription', () => {
  const labels = {
    goal: 'Goal', serviceDetails: 'Details', topic: 'Topic', explanationPreference: 'Preference',
    preferredTeachingLanguage: 'Language', additionalNotes: 'Notes',
    prompt: {} as Record<string, string>, style: {} as Record<string, string>
  };
  const input = {
    goal: 'Explain chapter three.', prompts: {} as Record<string, string>,
    promptOrder: ['whatYouTried', 'whereStuck'], topicLabel: '', explanationStyle: '',
    preferredTeachingLanguageLabel: '', constraints: ''
  };

  it('writes an answered question with its own wording', () => {
    const text = composeDescription(
      { ...input, prompts: { whatYouTried: 'The worked examples' } },
      { ...labels, prompt: { whatYouTried: 'What have you tried so far?' } });

    expect(text).toContain('What have you tried so far?: The worked examples');
    expect(text).not.toContain('whatYouTried');
  });

  it('leaves out a question the student did not answer', () => {
    const text = composeDescription({ ...input, prompts: { whereStuck: '   ' } }, labels);

    expect(text).not.toContain('whereStuck');
    expect(text).not.toContain('undefined');
    expect(text).toContain('Explain chapter three.');
  });

  it('writes the answer without a label rather than with an identifier', () => {
    // Even with no labels supplied at all, nothing internal reaches the teacher.
    const text = composeDescription({ ...input, prompts: { whatYouTried: 'Chapter three' } },
                                    { ...labels, prompt: {} });

    expect(text).toContain('Chapter three');
    expect(text).not.toContain('whatYouTried');
  });

  it('never emits the word undefined for a brief with nothing in it', () => {
    expect(composeDescription({ ...input, goal: '' }, labels)).toBe('');
  });
});
