import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { HttpFavouritesGateway, HttpTeacherGateway, toAvailability } from './http-teacher.gateway';
import { FAVOURITES_GATEWAY, FavouritesGateway, TEACHER_GATEWAY, TeacherGateway } from './teacher.ports';
import { LoadTeacherProfile } from './teacher.use-cases';
import { Teacher } from '../models/teacher';

const TEACHER_ID = '3f1c6a52-4b8e-4d7a-9c3e-2a1b0c9d8e7f';

describe('teacher availability (J1-04)', () => {
  let gateway: HttpTeacherGateway;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [HttpTeacherGateway, provideHttpClient(), provideHttpClientTesting()] });
    gateway = TestBed.inject(HttpTeacherGateway);
    backend = TestBed.inject(HttpTestingController);
  });

  it('asks the live-session summary endpoint, not /teachers/availability', async () => {
    const summaries = firstValueFrom(gateway.availability([TEACHER_ID], 'service-1'));
    const request = backend.expectOne(r => r.url.startsWith('/api/v1/live-sessions/availability-summaries?'));
    const params = new URL(request.request.url, 'https://x').searchParams;

    expect(request.request.method).toBe('GET');
    expect(params.getAll('teacherIds')).toEqual([TEACHER_ID]);
    expect(params.get('teacherServiceId')).toBe('service-1');
    expect(params.get('viewerTimeZoneId')).toBeTruthy();
    backend.expectNone(r => r.url.includes('/teachers/availability'));

    request.flush({ requestedCount: 1, unavailableCount: 0, summaries: [{
      teacherId: TEACHER_ID, teacherServiceId: 'service-1', state: 'next_available',
      nextSlotStartUtc: '2030-01-02T09:00:00Z', nextSlotEndUtc: '2030-01-02T10:00:00Z', durationMinutes: 60,
      searchHorizonEndUtc: '2030-02-01T00:00:00Z', viewerTimeZoneId: 'Asia/Riyadh', timeZoneFallbackUsed: false
    }] });
    expect(await summaries).toEqual([{
      teacherId: TEACHER_ID, teacherServiceId: 'service-1', state: 'next_available',
      nextAvailableAt: '2030-01-02T09:00:00Z', durationMinutes: 60
    }]);
  });

  it('maps a teacher without a schedule to no next slot', () => {
    expect(toAvailability({
      teacherId: TEACHER_ID, teacherServiceId: null, state: 'no_schedule_configured',
      nextSlotStartUtc: null, nextSlotEndUtc: null, durationMinutes: null
    })).toEqual({ teacherId: TEACHER_ID, teacherServiceId: null, state: 'no_schedule_configured', nextAvailableAt: null, durationMinutes: null });
  });
});

describe('the profile view carries the mapped availability', () => {
  it('puts the summary for this teacher into the profile the page renders', async () => {
    const summary = { teacherId: TEACHER_ID, teacherServiceId: null, state: 'available_today' as const,
      nextAvailableAt: '2030-01-01T15:00:00Z', durationMinutes: 45 };
    const teachers: Partial<TeacherGateway> = {
      byId: () => of({ id: TEACHER_ID, services: [] } as unknown as Teacher),
      reviews: () => of([]),
      availability: ids => of(ids[0] === TEACHER_ID ? [summary] : [])
    };
    const favourites: Partial<FavouritesGateway> = { mine: () => of([TEACHER_ID]) };
    TestBed.configureTestingModule({ providers: [
      { provide: TEACHER_GATEWAY, useValue: teachers }, { provide: FAVOURITES_GATEWAY, useValue: favourites }
    ] });

    const view = await TestBed.inject(LoadTeacherProfile).execute(TEACHER_ID, true);
    expect(view.availability).toEqual(summary);
    expect(view.availabilityFailed).toBe(false);
    expect(view.isFavourite).toBe(true);
  });
});

describe('favourite teachers (J1-07)', () => {
  let gateway: HttpFavouritesGateway;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [HttpFavouritesGateway, provideHttpClient(), provideHttpClientTesting()] });
    gateway = TestBed.inject(HttpFavouritesGateway);
    backend = TestBed.inject(HttpTestingController);
  });

  it('adds with PUT /favorite-teachers/{teacherId} and no body', async () => {
    const added = firstValueFrom(gateway.add(TEACHER_ID), { defaultValue: undefined });
    const request = backend.expectOne(`/api/v1/favorite-teachers/${TEACHER_ID}`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' });
    await added;
    backend.expectNone(r => r.method === 'POST');
  });

  it('lists TeacherCardDto[] by each card’s teacherId', async () => {
    const ids = firstValueFrom(gateway.mine());
    const request = backend.expectOne('/api/v1/favorite-teachers');
    expect(request.request.method).toBe('GET');
    request.flush([
      { teacherId: TEACHER_ID, fullName: 'A', headline: '', country: 'SA', verified: true, rating: null, ratingCount: 0,
        completedOrders: null, responseTimeMinutes: null, startingPrice: 100, currency: 'SAR', subjects: [], languages: [] },
      { teacherId: 'second', fullName: 'B' }
    ]);
    expect(await ids).toEqual([TEACHER_ID, 'second']);
  });

  it('removes with DELETE /favorite-teachers/{teacherId}', async () => {
    const removed = firstValueFrom(gateway.remove(TEACHER_ID), { defaultValue: undefined });
    const request = backend.expectOne(`/api/v1/favorite-teachers/${TEACHER_ID}`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await removed;
  });
});
