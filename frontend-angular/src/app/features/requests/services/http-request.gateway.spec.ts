import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { preferredDeliveryAt } from '../models/learning-request';
import { HttpRequestGateway } from './http-request.gateway';

describe('HttpRequestGateway', () => {
  let gateway: HttpRequestGateway;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [HttpRequestGateway, provideHttpClient(), provideHttpClientTesting()] });
    gateway = TestBed.inject(HttpRequestGateway);
    backend = TestBed.inject(HttpTestingController);
  });

  it('creates a direct request with exactly the keys CreateLearningRequest binds (J3-02)', async () => {
    const created = firstValueFrom(gateway.create({
      teacherId: 'teacher-1', teacherServiceId: 'service-1', title: 'Limits', description: 'Explain limits',
      preferredDeliveryAt: '2030-01-02T20:59:00.000Z', budget: null
    }));
    const request = backend.expectOne('/api/v1/learning-requests');

    expect(request.request.method).toBe('POST');
    expect(Object.keys(request.request.body).sort())
      .toEqual(['budget', 'description', 'preferredDeliveryAt', 'teacherServiceId', 'title']);
    expect(request.request.body).toEqual({
      teacherServiceId: 'service-1', title: 'Limits', description: 'Explain limits',
      preferredDeliveryAt: '2030-01-02T20:59:00.000Z', budget: null
    });

    request.flush({ id: 'r1', version: 'v1' });
    await expect(created).resolves.toEqual({ id: 'r1', version: 'v1' });
    backend.verify();
  });

  it('sends a set budget as a number', async () => {
    const created = firstValueFrom(gateway.create({
      teacherId: 't', teacherServiceId: 's', title: 'x', description: 'y',
      preferredDeliveryAt: '2030-01-02T20:59:00.000Z', budget: 150
    }));
    const request = backend.expectOne('/api/v1/learning-requests');
    expect(request.request.body.budget).toBe(150);
    request.flush({ id: 'r1', version: 'v1' });
    await created;
  });

  it('reads whether the writing helper may be offered at all (UX-08)', async () => {
    const enabled = firstValueFrom(gateway.aiCapabilities());
    const request = backend.expectOne('/api/v1/ai/capabilities');
    expect(request.request.method).toBe('GET');
    request.flush({ requestAssistant: true });
    await expect(enabled).resolves.toEqual({ requestAssistant: true });
  });

  it('treats anything but an explicit yes as no', async () => {
    for (const body of [{ requestAssistant: false }, {}, null]) {
      const answer = firstValueFrom(gateway.aiCapabilities());
      backend.expectOne('/api/v1/ai/capabilities').flush(body);
      await expect(answer).resolves.toEqual({ requestAssistant: false });
    }
  });

  it('asks the request assistant with notes and maps a success to its suggested description (J3-04)', async () => {
    const answer = firstValueFrom(gateway.assist('I keep failing limits'));
    const request = backend.expectOne('/api/v1/ai/request-assistant');
    expect(request.request.body).toEqual({ notes: 'I keep failing limits' });

    request.flush({
      status: 'success', message: 'AI-assisted draft ready.',
      draft: { title: 'Limits', goal: 'g', difficultTopics: [], desiredOutcome: 'o', deadlineMentioned: null,
        missingInformation: [], suggestedDescription: 'I need limits explained step by step.' }
    });
    await expect(answer).resolves.toEqual({
      status: 'success', message: 'AI-assisted draft ready.', suggestion: 'I need limits explained step by step.'
    });
  });

  it('maps an unavailable assistant (AI disabled) to its message and no suggestion', async () => {
    const answer = firstValueFrom(gateway.assist('notes'));
    backend.expectOne('/api/v1/ai/request-assistant')
      .flush({ status: 'unavailable', message: 'AI assistance is not available right now.', draft: null });
    await expect(answer).resolves.toEqual({
      status: 'unavailable', message: 'AI assistance is not available right now.', suggestion: null
    });
  });
  it('names each requestable service from the public profile, whose fields are nameEn/nameAr, not serviceName*', async () => {
    const teacher = firstValueFrom(gateway.requestTeacher('teacher-1'));
    backend.expectOne('/api/v1/teachers/teacher-1').flush({ fullName: 'معلمة', fullNameEnglish: 'Teacher A', services: [{
      id: 's1', subjectId: 'sub', serviceCatalogCode: 'recorded_explanation', title: 'Custom recorded explanation',
      nameEn: 'Custom recorded explanation', nameAr: 'شرح مسجّل مخصص', price: 150, currency: 'SAR',
      deliveryHours: 48, canRequest: true, requiresScheduling: false
    }] });

    expect((await teacher).fullNameEnglish).toBe('Teacher A');
    expect((await teacher).services).toEqual([{
      id: 's1', subjectId: 'sub', serviceCatalogCode: 'recorded_explanation',
      serviceNameEnglish: 'Custom recorded explanation', serviceNameArabic: 'شرح مسجّل مخصص',
      price: 150, currency: 'SAR', deliveryDays: 2, canRequest: true, requiresScheduling: false
    }]);
  });
});

describe('preferredDeliveryAt', () => {
  const now = new Date(2030, 0, 10, 12, 0, 0);

  it('reads a day as the end of that day in local time', () => {
    expect(preferredDeliveryAt('2030-01-10', now)).toBe(new Date(2030, 0, 10, 23, 59).toISOString());
    expect(preferredDeliveryAt('2030-02-01', now)).toBe(new Date(2030, 1, 1, 23, 59).toISOString());
  });

  it('rejects a past, empty or impossible day', () => {
    expect(preferredDeliveryAt('2030-01-09', now)).toBeNull();
    expect(preferredDeliveryAt('', now)).toBeNull();
    expect(preferredDeliveryAt('2030-02-30', now)).toBeNull();
    expect(preferredDeliveryAt('10/01/2030', now)).toBeNull();
  });
});
