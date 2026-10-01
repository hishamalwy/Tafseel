import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import ar from '../../../../public/locale/ar.json';
import en from '../../../../public/locale/en.json';
import { FormatService } from './format.service';
import { LocaleService } from './locale.service';

function formatter(lang: 'ar' | 'en') {
  const table = (lang === 'ar' ? ar : en) as Record<string, string>;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{
      provide: LocaleService,
      useValue: { lang: signal(lang), isRtl: signal(lang === 'ar'), t: (k: string, f = '') => table[k] ?? f }
    }]
  });
  return TestBed.inject(FormatService);
}

/** A person without an upload is shown as what they are on Tafseel, never as the letters of their name. */
describe('FormatService.avatarUrl', () => {
  it('uses the uploaded picture when there is one', () => {
    expect(formatter('en').avatarUrl('u-1', true, 3, 'teacher')).toBe('/api/v1/users/u-1/avatar?v=3');
  });

  it('falls back to the teacher picture for a teacher', () => {
    expect(formatter('ar').avatarUrl('u-1', false, null, 'teacher')).toContain('default-avatar-teacher.svg');
  });

  it('falls back to the student picture for a student', () => {
    expect(formatter('ar').avatarUrl('u-1', false, null, 'student')).toContain('default-avatar-student.svg');
  });

  it('never builds a monogram', () => {
    expect(formatter('en').avatarUrl('u-1', false)).not.toContain('data:image');
  });
});

/**
 * UX-06. Wherever a screen names the currency — a label above a price field, the accept dialog's
 * range, a plain-text amount — it uses the official riyal mark in both languages.
 */
describe('FormatService currency wording', () => {
  it('names SAR with the official mark on an Arabic screen', () => {
    expect(formatter('ar').currencyLabel('SAR')).toBe('\u20C1');
  });

  it('names SAR with the same official mark in English', () => {
    expect(formatter('en').currencyLabel('SAR')).toBe('\u20C1');
  });

  it('treats a missing or lower-case code as SAR, the only currency V1 prices in', () => {
    const fmt = formatter('ar');
    expect(fmt.currencyLabel(null)).toBe('\u20C1');
    expect(fmt.currencyLabel(' sar ')).toBe('\u20C1');
  });

  it('leaves any other currency as its code', () => {
    expect(formatter('ar').currencyLabel('USD')).toBe('USD');
  });

  it('writes a plain-text amount with Latin digits and the official mark', () => {
    expect(formatter('ar').money(853.2, 'SAR')).toBe('853.20 \u20C1');
    expect(formatter('en').money(853.2, 'SAR')).toBe('853.20 \u20C1');
  });
});

describe('FormatService.duration', () => {
  it('says hours, days and weeks the way a person would, in both languages', () => {
    const fmt = formatter('en');
    expect(fmt.duration(12)).toBe('12 hours');
    expect(fmt.duration(48)).toBe('2 days');
    expect(fmt.duration(168)).toBe('1 week');
    expect(fmt.duration(36)).toBe('1 day and 12 hours');
    const ar = formatter('ar');
    expect(ar.duration(48)).toBe('يومان');
    expect(ar.duration(72)).toContain('أيام');
  });
});
