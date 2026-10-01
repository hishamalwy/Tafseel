import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { HttpCatalogGateway, HttpTeacherGateway } from './http-teacher.gateway';
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
      providers: [HttpTeacherGateway, HttpCatalogGateway, provideHttpClient(), provideHttpClientTesting()]
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

  it('uses the API filter names and keeps the primary offer for the card CTA', async () => {
    const promise = new Promise<Teacher>(resolve => gateway.search({
      q: 'physics', serviceId: 'catalog-1', minRating: 4, maxPrice: 200, sort: 'rating'
    }).subscribe(page => resolve(page.items[0])));
    const request = http.expectOne(req => req.url.startsWith('/api/v1/teachers?'));
    const params = new URL(request.request.url, 'http://localhost').searchParams;
    expect(params.get('search')).toBe('physics');
    expect(params.get('serviceTypeId')).toBe('catalog-1');
    expect(params.get('minimumRating')).toBe('4');
    expect(params.get('maximumPrice')).toBe('200');
    expect(params.get('sort')).toBe('highest-rated');
    request.flush({ items: [{ teacherId: 't1', startingPrice: 120, contextOffer: {
      id: 'svc-1', subjectId: 'sub-1', serviceCatalogItemId: 'catalog-1', serviceCode: 'recorded_explanation',
      serviceName: 'Recorded explanation', serviceNameAr: 'شرح مسجل', price: 120, currency: 'SAR',
      deliveryHours: 48, revisions: 2, canRequest: true, canBook: false, requiresScheduling: false
    } }], page: 1, totalCount: 1 });
    const teacher = await promise;
    expect(teacher.services[0]).toMatchObject({
      id: 'svc-1', serviceNameEnglish: 'Recorded explanation', serviceNameArabic: 'شرح مسجل',
      canRequest: true, price: 120
    });
  });

  it('maps catalog names into labels the dropdowns can display', async () => {
    const promise = new Promise<{ subjects: readonly { nameArabic: string }[] }>(resolve =>
      TestBed.inject(HttpCatalogGateway).all().subscribe(resolve));
    for (const path of ['subjects', 'topics', 'services', 'education-levels', 'languages']) {
      http.expectOne(`/api/v1/${path}`).flush([{ id: path, name: 'Physics', nameAr: 'الفيزياء' }]);
    }
    expect((await promise).subjects[0].nameArabic).toBe('الفيزياء');
  });

  it('uses the comparison endpoint’s ids and teachers shape', async () => {
    const promise = new Promise<readonly Teacher[]>(resolve => gateway.compare(['t1', 't2']).subscribe(resolve));
    http.expectOne('/api/v1/teachers/compare?ids=t1&ids=t2').flush({
      requestedCount: 2,
      unavailableCount: 0,
      teachers: [{
        teacherId: 't1', fullName: 'Teacher A', startingPrice: 125, startingCurrency: 'SAR',
        sampleCount: 2, subjects: [{ id: 's1', name: 'Mathematics', nameAr: 'الرياضيات' }]
      }, { teacherId: 't2', fullName: 'Teacher B', sampleCount: 0 }]
    });
    const teachers = await promise;
    expect(teachers.map(teacher => teacher.id)).toEqual(['t1', 't2']);
    expect(teachers[0].subjects).toEqual(['Mathematics']);
    expect(teachers[0].startingPrice).toBe(125);
    expect(teachers[0].currency).toBe('SAR');
    expect(teachers[0].sampleCount).toBe(2);
  });
});
