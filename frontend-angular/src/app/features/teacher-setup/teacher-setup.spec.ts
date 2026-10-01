import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { problemMessage } from '@core/http/problem-message';
import { LocaleService } from '@core/i18n/locale.service';
import ar from '../../../../public/locale/ar.json';
import en from '../../../../public/locale/en.json';
import { DialogService } from '@shared/services/dialog.service';
import { Availability, RuleDraft } from './models/availability';
import { OnboardingState, Readiness } from './models/readiness';
import { ORDER_TYPE, Offering, ServiceOffer, ServiceType } from './models/service-offer';
import { CredentialForm, ProfileForm, WeeklyRule } from './models/teacher-profile';
import { TeacherPublicationPageComponent } from './pages/teacher-publication-page.component';
import { HttpTeacherSetupGateway, ownProfile, serviceType } from './services/http-teacher-setup.gateway';
import { TEACHER_SETUP_GATEWAY } from './services/teacher-setup.ports';

const table = (t: unknown) => t as Record<string, string>;
import {
  FormInvalid, LoadPublication, LoadSetupProgress, ManagePublicVideo, ManageAvailability, ManageServices, SaveTeacherProfile, SetPublication
} from './services/teacher-setup.use-cases';

const PHYSICS = 'a1111111-1111-1111-1111-111111111111';
const CHEMISTRY = 'b2222222-2222-2222-2222-222222222222';

const TYPE: ServiceType = serviceType({
  id: 'type-1', code: 'explain', nameEn: 'Explanation', orderType: ORDER_TYPE.ASYNC_REQUEST, currencyCode: 'SAR',
  minimumPrice: 20, defaultPrice: 100, maximumPrice: 500, minimumDeliveryHours: 2, defaultDeliveryHours: 48, maximumDeliveryHours: 240,
  defaultRevisions: 2, maximumRevisions: 5, canEnable: true, availabilityState: 'available',
  subjects: [
    { id: PHYSICS, name: 'Physics', isSubjectActive: true, isQualificationActive: true },
    { id: CHEMISTRY, name: 'Chemistry', isSubjectActive: true, isQualificationActive: false }
  ],
  offerings: []
});
const LIVE: ServiceType = { ...TYPE, id: 'type-2', orderType: ORDER_TYPE.LIVE_SESSION, maxRevisions: 0, minDeliveryHours: null, maxDeliveryHours: null };
const terms = { price: 150, deliveryHours: 24, revisions: 1, approachEn: '', approachAr: '' };

const state = (change: Partial<OnboardingState> = {}): OnboardingState => ({
  status: 10, emailConfirmed: true, approvedSubjectIds: [PHYSICS], profileComplete: true, hasActiveService: true,
  hasAvailability: true, hasPublicSample: false, isPublished: false, readyForPublication: true,
  blockingReasons: ['profile_not_published'], missingRequirements: [], ...change
});
const rule = (id: string, dayOfWeek: number, start: string, end: string): WeeklyRule =>
  ({ id, dayOfWeek, start, end, timeZoneId: 'Asia/Riyadh', slotMinutes: 60 });
const draft = (change: Partial<RuleDraft> = {}): RuleDraft =>
  ({ days: [1], start: '09:00', end: '12:00', timeZoneId: 'Asia/Riyadh', slotMinutes: 60, ...change });

describe('teacher profile form (J11-06)', () => {
  it('requires every field publication needs and keeps the API limits', () => {
    expect(ProfileForm.problems(ProfileForm.draft(null, 'Asia/Riyadh'))).toEqual({
      headline: 'required', bio: 'required', country: 'required', city: 'required', responseTimeMinutes: 'required'
    });
    const good = { headline: 'H', bio: 'B', country: 'SA', city: 'Riyadh', timeZoneId: 'Asia/Riyadh', responseTimeMinutes: 30 };
    expect(ProfileForm.problems(good)).toEqual({});
    expect(ProfileForm.problems({ ...good, headline: 'x'.repeat(201) }).headline).toBe('too_long');
    expect(ProfileForm.problems({ ...good, responseTimeMinutes: 43_201 }).responseTimeMinutes).toBe('out_of_range');
  });

  it('starts from the server’s values and sends trimmed fields', () => {
    const profile = ownProfile({ headline: ' Physics ', bio: 'Bio', country: 'SA', city: 'Riyadh', timeZoneId: 'Arab Standard Time', responseTimeMinutes: 15 });
    const form = ProfileForm.draft(profile, 'Asia/Riyadh');
    expect(form.timeZoneId).toBe('Arab Standard Time');
    expect(ProfileForm.input(form)).toEqual({ headline: 'Physics', bio: 'Bio', country: 'SA', city: 'Riyadh', timeZoneId: 'Arab Standard Time', responseTimeMinutes: 15 });
  });

  it('offers the device zone instead of the UTC an approval leaves on a profile nobody has written yet', () => {
    expect(ProfileForm.draft(ownProfile({ timeZoneId: 'UTC' }), 'Africa/Cairo').timeZoneId).toBe('Africa/Cairo');
    expect(ProfileForm.draft(ownProfile({ headline: 'H', timeZoneId: 'UTC' }), 'Africa/Cairo').timeZoneId).toBe('UTC');
  });

  it('checks credentials before adding them', () => {
    expect(CredentialForm.problems(CredentialForm.empty())).toEqual({ title: 'required', organization: 'required' });
    expect(CredentialForm.problems({ title: 'BSc', organization: 'KSU', from: '2020-01-01', to: '2019-01-01' })).toEqual({ to: 'before_start' });
  });
});

describe('service offers (J11-07)', () => {
  it('offers only subjects the server listed as eligible, active, and not already offered', () => {
    const eligible = new Set([PHYSICS, CHEMISTRY]);
    expect(ServiceOffer.sellableSubjects(TYPE, eligible).map(s => s.id)).toEqual([PHYSICS]);
    expect(ServiceOffer.sellableSubjects(TYPE, new Set())).toEqual([]);
    const offered = { ...TYPE, offerings: [{ subjectId: PHYSICS, isSuperseded: false } as Offering] };
    expect(ServiceOffer.sellableSubjects(offered, eligible)).toEqual([]);
    const superseded = { ...TYPE, offerings: [{ subjectId: PHYSICS, isSuperseded: true } as Offering] };
    expect(ServiceOffer.sellableSubjects(superseded, eligible).map(s => s.id)).toEqual([PHYSICS]);
  });

  it.each([
    [{ price: null }, 'price', 'required'], [{ price: 19.99 }, 'price', 'out_of_range'], [{ price: 501 }, 'price', 'out_of_range'],
    [{ price: 20.001 }, 'price', 'out_of_range'], [{ deliveryHours: 1 }, 'deliveryHours', 'out_of_range'],
    [{ deliveryHours: 241 }, 'deliveryHours', 'out_of_range'], [{ revisions: 6 }, 'revisions', 'out_of_range'],
    [{ approachEn: 'x'.repeat(1001) }, 'approachEn', 'too_long']
  ])('refuses %o', (change, field, problem) => {
    expect(ServiceOffer.problems(TYPE, { ...terms, ...change })).toEqual({ [field]: problem });
  });

  it('does not ask a live session for a delivery window and sends the catalog currency', () => {
    expect(ServiceOffer.problems(LIVE, { ...terms, deliveryHours: null, revisions: 0 })).toEqual({});
    expect(ServiceOffer.input(TYPE, PHYSICS, terms, true)).toEqual({
      subjectId: PHYSICS, serviceCatalogItemId: 'type-1', price: 150, currency: 'SAR', deliveryHours: 24, revisions: 1,
      approachEn: '', approachAr: '', isAvailable: true
    });
  });
});

describe('weekly availability (J11-08)', () => {
  const week = [rule('r1', 1, '09:00', '12:00'), rule('r2', 3, '13:00', '15:00')];

  it.each([
    [{ days: [] }, 'days_required'], [{ start: '12:00', end: '09:00' }, 'end_before_start'], [{ start: '9' }, 'time_required'],
    [{ slotMinutes: 10 }, 'slot_out_of_range'], [{ start: '09:00', end: '09:30', days: [0] }, 'slot_longer_than_window'],
    [{ days: [1], start: '11:00', end: '13:00' }, 'overlap'], [{ timeZoneId: ' ' }, 'zone_required']
  ])('refuses %o as %s', (change, problem) => {
    expect(Availability.ruleProblems(draft(change as Partial<RuleDraft>), week)).toContain(problem);
  });

  it('allows touching windows and a rule moving within its own time', () => {
    expect(Availability.ruleProblems(draft({ start: '12:00', end: '13:00' }), week)).toEqual([]);
    expect(Availability.ruleProblems(draft({ start: '10:00', end: '12:00' }), week, 'r1')).toEqual([]);
  });

  it('saves the whole week with times and zones exactly as entered', () => {
    expect(Availability.replacement(week, draft({ days: [5, 0], start: '16:00', end: '18:00', timeZoneId: 'Africa/Cairo' }))).toEqual([
      { dayOfWeek: 1, start: '09:00:00', end: '12:00:00', timeZoneId: 'Asia/Riyadh', slotMinutes: 60 },
      { dayOfWeek: 3, start: '13:00:00', end: '15:00:00', timeZoneId: 'Asia/Riyadh', slotMinutes: 60 },
      { dayOfWeek: 0, start: '16:00:00', end: '18:00:00', timeZoneId: 'Africa/Cairo', slotMinutes: 60 },
      { dayOfWeek: 5, start: '16:00:00', end: '18:00:00', timeZoneId: 'Africa/Cairo', slotMinutes: 60 }
    ]);
    expect(Availability.replacement(week, draft({ days: [3], start: '14:00', end: '16:00' }), 'r2').map(r => [r.dayOfWeek, r.start]))
      .toEqual([[1, '09:00:00'], [3, '14:00:00']]);
  });

  it('reads an exception in the browser zone and sends the instant', () => {
    expect(Availability.exceptionProblems({ startsAt: '2030-01-01T11:00', endsAt: '2030-01-01T10:00', reason: '' })).toEqual(['end_before_start']);
    expect(Availability.exceptionInput({ startsAt: '2030-01-01T11:00', endsAt: '2030-01-01T12:00', reason: ' ' })).toEqual({
      startsAt: new Date('2030-01-01T11:00').toISOString(), endsAt: new Date('2030-01-01T12:00').toISOString(), reason: null
    });
  });
});

describe('publication readiness (J11-09)', () => {
  it('shows every server blocker except the publish action itself, unknown codes included', () => {
    const blockers = Readiness.blockers(state({
      readyForPublication: false,
      blockingReasons: ['profile_incomplete', 'active_service_required', 'availability_required', 'something_new', 'profile_not_published']
    }));
    expect(blockers.map(b => [b.code, b.link])).toEqual([
      ['profile_incomplete', '/teacher/profile'], ['active_service_required', '/teacher/services'],
      ['availability_required', '/teacher/availability'], ['something_new', null]
    ]);
    expect(blockers[3]!.fallback).toBe('something_new');
  });

  it('enables publishing only when the server says ready and the profile is not yet public', () => {
    expect(Readiness.canPublish(state())).toBe(true);
    expect(Readiness.canPublish(state({ readyForPublication: false }))).toBe(false);
    expect(Readiness.canPublish(state({ isPublished: true, readyForPublication: false, blockingReasons: [] }))).toBe(false);
    expect(Readiness.switchedOn(state())).toBe(false);
    expect(Readiness.switchedOn(state({ blockingReasons: ['active_service_required'] }))).toBe(true);
  });
});

describe('problem messages', () => {
  const t = (key: string, fallback: string) => ({ err_availability_conflict: 'Overlaps.' } as Record<string, string>)[key] ?? fallback;
  it('prefers a translated code, then the server sentence, and collects field messages', () => {
    expect(problemMessage(new HttpErrorResponse({ status: 409, error: { code: 'availability_conflict', detail: 'x' } }), t).text).toBe('Overlaps.');
    const invalid = problemMessage(new HttpErrorResponse({ status: 400, error: { title: 'Invalid', errors: { '$.Price': ['Too low'], Headline: ['Required'] } } }), t);
    expect(invalid.fields).toEqual({ price: 'Too low', headline: 'Required' });
    expect(invalid.text).toBe('Too low');
    expect(problemMessage(new HttpErrorResponse({ status: 0 }), t).text).toMatch(/connection/);
  });
});

describe('HttpTeacherSetupGateway', () => {
  let gateway: HttpTeacherSetupGateway;
  let backend: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [HttpTeacherSetupGateway, provideHttpClient(), provideHttpClientTesting()] });
    gateway = TestBed.inject(HttpTeacherSetupGateway);
    backend = TestBed.inject(HttpTestingController);
  });

  async function expectCall(call: Promise<unknown>, method: string, url: string, body: unknown, ifMatch: string | null = null, reply: unknown = null) {
    const request = backend.expectOne(url);
    expect(request.request.method).toBe(method);
    expect(request.request.body).toEqual(body);
    expect(request.request.headers.get('If-Match')).toBe(ifMatch);
    request.flush(reply as object | null);
    return call;
  }

  it('carries each teaching language’s code, so the screen can name it in the reader’s language (UX-06)', async () => {
    // The server stores only an English name for a language ("Arabic", "English"); its code is what lets an
    // Arabic screen say «العربية» instead of printing the English word.
    const languages = await expectCall(firstValueFrom(gateway.languages()), 'GET', '/api/v1/languages', null, null,
      [{ id: 'l1', name: 'Arabic', code: 'ar' }, { id: 'l2', name: 'English', code: 'en' }]);
    expect(languages).toEqual([
      { id: 'l1', name: 'Arabic', nameArabic: '', code: 'ar' },
      { id: 'l2', name: 'English', nameArabic: '', code: 'en' }
    ]);
  });

  it('has an Arabic name shipped for every language the platform seeds', () => {
    // DependencyInjection.CanonicalLanguages seeds exactly these two.
    for (const code of ['ar', 'en']) {
      expect(table(ar)[`language_name_${code}`], `Arabic name for ${code}`).toMatch(/^[؀-ۿ\s]+$/);
      expect(table(en)[`language_name_${code}`], `English name for ${code}`).toBeTruthy();
    }
  });

  it('saves the profile with exactly the UpdateTeacherProfile keys', async () => {
    const input = { headline: 'H', bio: 'B', country: 'SA', city: 'Riyadh', timeZoneId: 'Asia/Riyadh', responseTimeMinutes: 30 };
    await expectCall(firstValueFrom(gateway.saveProfile(input)), 'PUT', '/api/v1/teachers/me', input);
  });

  it('replaces lists and manages credentials on the teacher’s own routes', async () => {
    await expectCall(firstValueFrom(gateway.setTopics(['t1'])), 'PUT', '/api/v1/teachers/me/topics', { ids: ['t1'] });
    await expectCall(firstValueFrom(gateway.setEducationLevels([])), 'PUT', '/api/v1/teachers/me/education-levels', { ids: [] });
    await expectCall(firstValueFrom(gateway.addCredential('experience', { title: ' Teacher ', organization: 'School', from: '', to: '' })),
      'POST', '/api/v1/teachers/me/experience', { title: 'Teacher', organization: 'School', from: null, to: null }, null, { id: 'c1', title: 'Teacher' });
    await expectCall(firstValueFrom(gateway.removeCredential('certifications', 'c1')), 'DELETE', '/api/v1/teachers/me/certifications/c1', null);
  });

  it('creates, updates and switches services with the offering version', async () => {
    const input = ServiceOffer.input(TYPE, PHYSICS, terms, null);
    await expectCall(firstValueFrom(gateway.createService(input)), 'POST', '/api/v1/teachers/me/services', input, null, { id: 's1' });
    await expectCall(firstValueFrom(gateway.updateService('s1', input, 'v1')), 'PUT', '/api/v1/teachers/me/services/s1', input, 'v1');
    await expectCall(firstValueFrom(gateway.setServiceActive('s1', false, 'v2')), 'PUT', '/api/v1/teachers/me/services/s1/active', { active: false }, 'v2');
  });

  it('replaces the week, removes a window, and adds and removes time off', async () => {
    const rules = Availability.replacement([], draft());
    const saved = await expectCall(firstValueFrom(gateway.replaceRules(rules)), 'PUT', '/api/v1/teachers/me/availability/rules', { rules },
      null, [{ id: 'r1', dayOfWeek: 1, start: '09:00:00', end: '12:00:00', timeZoneId: 'Asia/Riyadh', slotMinutes: 60 }]);
    expect(saved).toEqual([rule('r1', 1, '09:00', '12:00')]);
    await expectCall(firstValueFrom(gateway.removeRule('r1')), 'DELETE', '/api/v1/teachers/me/availability/rules/r1', null);
    const exception = { startsAt: '2030-01-01T08:00:00.000Z', endsAt: '2030-01-01T09:00:00.000Z', reason: null };
    await expectCall(firstValueFrom(gateway.addException(exception)), 'POST', '/api/v1/teachers/me/availability/exceptions', exception, null, { id: 'e1' });
    await expectCall(firstValueFrom(gateway.removeException('e1')), 'DELETE', '/api/v1/teachers/me/availability/exceptions/e1', null);
  });

  it('reads readiness and publishes', async () => {
    const read = firstValueFrom(gateway.onboarding());
    backend.expectOne('/api/v1/teachers/onboarding-status').flush({ status: 10, readyForPublication: true, blockingReasons: ['profile_not_published'], approvedSubjectIds: [PHYSICS] });
    expect(await read).toMatchObject({ readyForPublication: true, blockingReasons: ['profile_not_published'], approvedSubjectIds: [PHYSICS] });
    await expectCall(firstValueFrom(gateway.setPublished(true)), 'PUT', '/api/v1/teachers/me/publication', { published: true });
  });
});

describe('teacher setup use cases', () => {
  const gateway = {
    saveProfile: vi.fn(() => of(undefined)), createService: vi.fn(() => of(undefined)), replaceRules: vi.fn(() => of([]))
  };
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [SaveTeacherProfile, ManageServices, ManageAvailability, { provide: TEACHER_SETUP_GATEWAY, useValue: gateway }]
    });
  });

  it('sends nothing for an incomplete profile', async () => {
    await expect(TestBed.inject(SaveTeacherProfile).execute(ProfileForm.draft(null, 'UTC'))).rejects.toBeInstanceOf(FormInvalid);
    expect(gateway.saveProfile).not.toHaveBeenCalled();
  });

  it('refuses to create a service in a subject the server did not list as eligible', async () => {
    const services = TestBed.inject(ManageServices);
    await expect(services.create({ types: [TYPE], eligibleSubjects: [] }, TYPE, PHYSICS, terms)).rejects.toMatchObject({ problems: { subject: 'not_sellable' } });
    await expect(services.create({ types: [TYPE], eligibleSubjects: [{ id: CHEMISTRY, name: 'C', nameArabic: '' }] }, TYPE, CHEMISTRY, terms))
      .rejects.toBeInstanceOf(FormInvalid);
    expect(gateway.createService).not.toHaveBeenCalled();
    await services.create({ types: [TYPE], eligibleSubjects: [{ id: PHYSICS, name: 'P', nameArabic: '' }] }, TYPE, PHYSICS, terms);
    expect(gateway.createService).toHaveBeenCalledWith(ServiceOffer.input(TYPE, PHYSICS, terms, true));
  });

  it('refuses an overlapping window without calling the server', async () => {
    const availability = TestBed.inject(ManageAvailability);
    await expect(availability.saveRule([rule('r1', 1, '09:00', '12:00')], draft({ start: '10:00', end: '11:00' }))).rejects.toBeInstanceOf(FormInvalid);
    expect(gateway.replaceRules).not.toHaveBeenCalled();
  });
});

async function settle(done: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !done(); i++) await new Promise(resolve => setTimeout(resolve));
  expect(done()).toBe(true);
}

describe('TeacherPublicationPageComponent', () => {
  async function render(onboarding: OnboardingState, setPublished = vi.fn(() => of(undefined))) {
    TestBed.configureTestingModule({
      imports: [TeacherPublicationPageComponent],
      providers: [
        provideRouter([]), LoadPublication, SetPublication, LoadSetupProgress, ManagePublicVideo,
        { provide: TEACHER_SETUP_GATEWAY, useValue: { onboarding: vi.fn(() => of(onboarding)), profile: () => of(ownProfile({ teacherId: 't1' })), setPublished, introVideo: () => of({ source: null, isPublic: false, fileName: null, consentedAt: null, version: null, applicationVideos: [], consentStatement: '' }) } },
        { provide: SESSION_STORE, useValue: { current: () => ({ fullName: 'T', userId: 't1' }) } },
        { provide: DialogService, useValue: { confirm: async () => true } },
        { provide: LocaleService, useValue: { t: (_: string, f: string) => f, format: (_: string, __: unknown, f: string) => f, isRtl: () => false, lang: () => 'en' } }
      ]
    });
    const fixture = TestBed.createComponent(TeacherPublicationPageComponent);
    fixture.detectChanges();
    await settle(() => !fixture.componentInstance.loading());
    fixture.detectChanges();
    return { fixture, setPublished };
  }

  it('lists the blockers, links each to its screen and keeps publish disabled', async () => {
    const { fixture } = await render(state({ readyForPublication: false, blockingReasons: ['availability_required', 'profile_not_published'] }));
    const element: HTMLElement = fixture.nativeElement;
    expect([...element.querySelectorAll('[data-testid=readiness-blockers] li')].map(li => li.getAttribute('data-code'))).toEqual(['availability_required']);
    expect(element.querySelector('[data-code=availability_required] a')?.getAttribute('href')).toBe('/teacher/availability');
    expect((element.querySelector('[data-testid=publish]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('publishes when ready and shows the server’s refusal', async () => {
    const refused = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 400, error: { code: 'x', detail: 'Create an active service first.' } })));
    const { fixture, setPublished } = await render(state(), refused);
    (fixture.nativeElement.querySelector('[data-testid=publish]') as HTMLButtonElement).click();
    await settle(() => setPublished.mock.calls.length > 0 && !fixture.componentInstance.busy());
    fixture.detectChanges();
    expect(setPublished).toHaveBeenCalledWith(true);
    expect(fixture.nativeElement.querySelector('[data-testid=publication-error]').textContent).toContain('Create an active service first.');
  });
});
