import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { HttpTeacherGateway } from './http-teacher.gateway';
import { Teacher, TeacherReview } from '../models/teacher';

/**
 * The wire names, pinned.
 *
 * The gateway read `serviceNameEnglish`, `deliveryDays` and `revisionAllowance`
 * while the API sends `nameEn`, `deliveryHours` and `revisions`, and passed
 * `languages` through untouched while the API sends objects. Nothing failed —
 * every screen simply rendered nameless services, "Flexible" delivery and
 * "[object Object]" languages. These assertions are what makes that loud.
 */
describe('teacher wire mapping', () => {
  let gateway: HttpTeacherGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpTeacherGateway, provideHttpClient(), provideHttpClientTesting()]
    });
    gateway = TestBed.inject(HttpTeacherGateway);
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(HttpClient);
  });

  it('reads a public review’s score and comment from the names the API sends (J7-01)', async () => {
    const promise = new Promise<readonly TeacherReview[]>(resolve => gateway.reviews('t1', 50).subscribe(resolve));
    http.expectOne('/api/v1/teachers/t1/reviews?pageSize=50').flush({
      items: [{
        id: 'r1', teacherId: 't1', explanationClarity: 5, subjectKnowledge: 5, communication: 4, onTimeDelivery: 5,
        valueForMoney: 5, overallScore: 4.8, originalComment: 'Clear worked steps', recommends: true, createdAt: '2026-09-15T08:00:00Z'
      }],
      page: 1, pageSize: 50, totalCount: 1
    });
    const [review] = await promise;
    expect(review.rating).toBe(4.8);
    expect(review.body).toBe('Clear worked steps');
    expect(review.createdAt).toBe('2026-09-15T08:00:00Z');
    // The public endpoint does not disclose the student; nothing is invented in their place.
    expect(review.studentDisplayName).toBeNull();
    expect(review.studentDisplayNameEnglish).toBeNull();
  });

  it('reads the names the API actually sends', async () => {
    const promise = new Promise<Teacher>(resolve => gateway.byId('t1').subscribe(resolve));

    http.expectOne('/api/v1/teachers/t1').flush({
      teacherId: 't1',
      fullName: 'معلم',
      languages: [{ id: 'l1', name: 'Arabic', nameAr: 'العربية' }],
      subjects: [{ id: 's1', name: 'Physics', nameAr: 'الفيزياء' }],
      ratingCount: 7,
      services: [{
        id: 'svc1',
        nameEn: 'Recorded explanation',
        nameAr: 'شرح مسجّل',
        descriptionEn: 'Step by step',
        deliveryHours: 48,
        revisions: 2,
        price: 170,
        currency: 'SAR'
      }]
    });

    const teacher = await promise;
    const service = teacher.services[0];

    expect(service.serviceNameEnglish).toBe('Recorded explanation');
    expect(service.descriptionEnglish).toBe('Step by step');
    // 48 hours is two days; the screens speak in days.
    expect(service.deliveryDays).toBe(2);
    expect(service.revisionAllowance).toBe(2);
    expect(service.price).toBe(170);
    // Named items become names, never "[object Object]".
    expect(teacher.languages).toEqual(['Arabic']);
    expect(teacher.subjects).toEqual(['Physics']);
    expect(teacher.reviewCount).toBe(7);
  });

  it('takes browse’s starting price, which sends no services at all', async () => {
    const promise = new Promise<Teacher>(resolve =>
      gateway.search({}).subscribe(page => resolve(page.items[0])));

    http.expectOne(request => request.url.startsWith('/api/v1/teachers')).flush({
      items: [{
        teacherId: 't2',
        fullName: 'معلمة',
        startingPrice: 220,
        currency: 'SAR',
        subjects: ['Physics'],
        languages: ['Arabic']
      }],
      page: 1, totalCount: 1, totalPages: 1
    });

    const teacher = await promise;
    expect(Teacher.fromPrice(teacher)).toEqual({ amount: 220, currency: 'SAR' });
    // Browse sends plain strings where the profile sends objects.
    expect(teacher.subjects).toEqual(['Physics']);
    expect(teacher.languages).toEqual(['Arabic']);
  });
});
