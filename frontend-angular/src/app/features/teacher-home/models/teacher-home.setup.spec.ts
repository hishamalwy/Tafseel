import { describe, expect, it } from 'vitest';
import ar from '../../../../../public/locale/ar.json';
import en from '../../../../../public/locale/en.json';
import { OnboardingState } from '@features/teacher-setup/models/readiness';
import { ONBOARDING, SetupCard, awaitingQualification, setupCard } from './setup-card';

const table = (lang: 'ar' | 'en') => (lang === 'ar' ? ar : en) as Record<string, string>;
const say = (card: SetupCard | null, lang: 'ar' | 'en' = 'en') => ({
  title: card ? table(lang)[card.title.labelKey] : null,
  body: card?.body ? table(lang)[card.body.labelKey] : null,
  cta: card?.cta ? table(lang)[card.cta.label.labelKey] : null,
  link: card?.cta?.link ?? null,
  stepsLeft: card?.stepsLeft ?? 0,
  ready: card?.ready ?? false
});

const state = (over: Partial<OnboardingState> = {}): OnboardingState => ({
  status: ONBOARDING.ApprovedButNotPublished, emailConfirmed: true, approvedSubjectIds: ['s1'],
  profileComplete: true, hasActiveService: true, hasAvailability: true, hasPublicSample: false,
  isPublished: false, readyForPublication: false, blockingReasons: [], missingRequirements: [], ...over
});

describe('UX-02 setup card', () => {
  it('shows nothing when students can already find the teacher', () => {
    expect(setupCard(state({ isPublished: true, blockingReasons: [] }))).toBeNull();
  });

  it('shows only the first blocking reason the server gave, and how many are left', () => {
    const card = setupCard(state({
      status: ONBOARDING.ApprovedButProfileIncomplete,
      blockingReasons: ['profile_incomplete', 'active_service_required', 'profile_not_published']
    }));
    expect(say(card)).toEqual({
      title: 'Complete your profile',
      body: 'Add your headline, bio, country and city.',
      cta: 'Complete profile',
      link: '/teacher/profile',
      // Being unpublished is what the publish screen fixes, so it is not a step of its own.
      stepsLeft: 2,
      ready: false
    });
  });

  it('never reorders the server’s reasons', () => {
    const card = setupCard(state({ blockingReasons: ['availability_required', 'profile_incomplete', 'profile_not_published'] }));
    expect(say(card).title).toBe('Set your weekly availability');
    expect(say(card).link).toBe('/teacher/availability');
  });

  it('tells a teacher who has cleared everything that they are ready to be seen', () => {
    const card = setupCard(state({ readyForPublication: true, blockingReasons: ['profile_not_published'] }));
    expect(say(card)).toEqual({
      title: 'Your profile is ready for students',
      body: 'Review your profile, then make it visible.',
      cta: 'Review and go visible',
      link: '/teacher/publication',
      stepsLeft: 1,
      ready: true
    });
  });

  it('words a missing qualification by where the application has got to', () => {
    const applying = (status: number) => say(setupCard(state({ status, approvedSubjectIds: [], blockingReasons: ['qualification_required', 'profile_not_published'] })));
    expect(applying(ONBOARDING.ApplicationRequired)).toMatchObject({ title: 'Apply to teach your subject', cta: 'Start application', link: '/teach/apply' });
    expect(applying(ONBOARDING.DemoRequired)).toMatchObject({ title: 'Finish your application', cta: 'Continue' });
    expect(applying(ONBOARDING.ReadyToSubmit)).toMatchObject({ title: 'Finish your application' });
    expect(applying(ONBOARDING.PendingReview)).toMatchObject({ title: 'Your application is being reviewed', cta: 'View application' });
    expect(applying(ONBOARDING.UnderReview)).toMatchObject({ title: 'Your application is being reviewed' });
    expect(applying(ONBOARDING.ChangesRequested)).toMatchObject({ title: 'Your application needs changes', cta: 'Update application' });
    expect(applying(ONBOARDING.Rejected)).toMatchObject({ title: 'Your application wasn’t approved', cta: 'Apply again' });
  });

  it('offers no way out of a suspension, because there is none on this screen', () => {
    const card = setupCard(state({ status: ONBOARDING.Suspended, blockingReasons: ['account_suspended', 'profile_not_published'] }));
    expect(say(card)).toMatchObject({
      title: 'Your account is suspended', body: 'Contact Tafseel support to find out why.', cta: null, link: null
    });
  });

  it('asks for an email confirmation and a service by their own screens', () => {
    expect(say(setupCard(state({ status: ONBOARDING.EmailUnconfirmed, emailConfirmed: false, blockingReasons: ['email_unconfirmed'] }))))
      .toMatchObject({ title: 'Confirm your email', link: '/auth/confirm-email' });
    for (const code of ['active_service_required', 'eligible_active_service_required'])
      expect(say(setupCard(state({ blockingReasons: [code] })))).toMatchObject({
        title: 'Turn on at least one service', cta: 'Go to my services', link: '/teacher/services'
      });
  });

  it('falls back to the setup screen for a code it does not know, and never prints the code', () => {
    const card = setupCard(state({ blockingReasons: ['some_new_server_rule', 'profile_not_published'] }));
    expect(say(card)).toMatchObject({ title: 'Finish setting up your profile', cta: 'My teaching setup', link: '/teacher/publication' });
    expect(JSON.stringify(say(card))).not.toContain('some_new_server_rule');
  });

  it('ignores a missing public sample, which does not block anything in V1', () => {
    const card = setupCard(state({
      hasPublicSample: false, readyForPublication: true,
      blockingReasons: ['profile_not_published'], missingRequirements: ['add_public_sample', 'ready_for_publication']
    }));
    expect(card?.ready).toBe(true);
    expect(card?.stepsLeft).toBe(1);
  });

  it('reads in Arabic', () => {
    const card = setupCard(state({ blockingReasons: ['active_service_required', 'profile_not_published'] }));
    expect(say(card, 'ar')).toMatchObject({
      title: 'فعّل خدمة واحدة على الأقل',
      body: 'اختر من خدمات تفصيل في مادة مقبول فيها وحدّد سعرك.',
      cta: 'اذهب إلى خدماتي'
    });
  });

  it('knows when there is nothing else worth asking the server for', () => {
    expect(awaitingQualification(state({ approvedSubjectIds: [], blockingReasons: ['qualification_required'] }))).toBe(true);
    expect(awaitingQualification(state({ blockingReasons: ['profile_incomplete'] }))).toBe(false);
  });
});
