import { describe, expect, it } from 'vitest';
import { Teacher, TeacherService } from './teacher';

const service = (patch: Partial<TeacherService>): TeacherService => ({
  id: 's1', subjectId: null, serviceCatalogItemId: null, serviceCatalogCode: 'recorded_explanation',
  serviceNameEnglish: 'Recorded', serviceNameArabic: '', descriptionEnglish: '', descriptionArabic: '',
  price: 100, currency: 'SAR', deliveryDays: null, deliveryHours: null, revisionAllowance: 1,
  canRequest: true, canBook: false, requiresScheduling: false, allowedDurations: [], ...patch
});

/**
 * Wave 3A observed a public card reading "Recorded · 1 days" for a live service: its placeholder
 * one-hour delivery was rounded up to a day, and it was labelled by whether it could be booked
 * right now instead of by its type.
 */
describe('Teacher service delivery wording', () => {
  it('describes a scheduled service by its session length, never by a delivery window', () => {
    const live = service({ serviceCatalogCode: 'live_session', deliveryHours: 1, deliveryDays: 1, allowedDurations: [30, 60] });
    expect(Teacher.isScheduled(live)).toBe(true);
    expect(Teacher.deliveryWording(live)).toEqual({ kind: 'duration', minutes: [30, 60] });
    expect(Teacher.isScheduled(service({ requiresScheduling: true }))).toBe(true);
  });

  it('keeps a delivery under a day in hours instead of rounding it to "1 days"', () => {
    expect(Teacher.deliveryWording(service({ deliveryHours: 12, deliveryDays: 1 }))).toEqual({ kind: 'hours', value: 12 });
    expect(Teacher.deliveryWording(service({ deliveryHours: 72, deliveryDays: 3 }))).toEqual({ kind: 'days', value: 3 });
    expect(Teacher.deliveryWording(service({}))).toEqual({ kind: 'flexible' });
  });

  it('labels a live service as live even when it cannot be booked at the moment', () => {
    const unbookable = service({ serviceCatalogCode: 'live_session', canBook: false });
    expect(Teacher.isScheduled(unbookable)).toBe(true);
    expect(Teacher.isLiveService(unbookable)).toBe(false);
  });
});
