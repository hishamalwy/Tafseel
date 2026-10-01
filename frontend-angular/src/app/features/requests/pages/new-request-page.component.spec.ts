import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { LocaleService } from '@core/i18n/locale.service';
import { ToastService } from '@shared/services/toast.service';
import {
  AcceptFiles, AssistWithBrief, OpenRequestWizard, SaveRequestDraft, SubmitLearningRequest
} from '../services/request.use-cases';
import { NewRequestPageComponent } from './new-request-page.component';

const SERVICE = {
  id: 's1', subjectId: 'sub1', serviceCatalogCode: 'recorded_explanation',
  serviceNameEnglish: 'Recorded explanation', serviceNameArabic: 'شرح مسجل',
  price: 100, currency: 'SAR', deliveryDays: 2, canRequest: true, requiresScheduling: false
};

const CONTEXT = {
  services: [SERVICE], preferences: null, preferencesFailed: false, draft: null, schedulingOnly: false
};

interface Options {
  /** What the server says about the writing helper, or a failure. */
  readonly capability?: () => Promise<boolean>;
  readonly lang?: 'ar' | 'en';
}

async function render(options: Options = {}) {
  const lang = options.lang ?? 'en';
  const assistCalls: string[] = [];
  const capabilityCalls = { count: 0 };
  const isAvailable = vi.fn(async () => {
    capabilityCalls.count++;
    return options.capability ? options.capability() : true;
  });

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [NewRequestPageComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      // The wizard is opened from a teacher's profile; without that it renders its own "pick a teacher" state.
      { provide: ActivatedRoute, useValue: {
        snapshot: { queryParamMap: convertToParamMap({ teacherId: 't1', teacherServiceId: 's1' }) }
      } },
      { provide: LocaleService, useValue: { lang: signal(lang), isRtl: signal(lang === 'ar'), t: (_: string, f = '') => f, format: (_: string, __: unknown, f = '') => f, toggle: () => {} } },
      { provide: SignalSessionStore, useValue: { roles: signal(['Student']), isAuthenticated: signal(true), value: signal({ userId: 'u1', fullName: 'Sara' }), current: signal({ userId: 'u1', fullName: 'Sara' }) } },
      { provide: SESSION_STORE, useValue: { current: () => ({ userId: 'u1', fullName: 'Sara' }) } },
      { provide: OpenRequestWizard, useValue: { execute: vi.fn(async () => CONTEXT) } },
      { provide: SubmitLearningRequest, useValue: { execute: vi.fn() } },
      { provide: SaveRequestDraft, useValue: { execute: vi.fn(), load: () => null, save: vi.fn(), clear: vi.fn() } },
      { provide: AcceptFiles, useValue: { execute: (files: File[]) => ({ accepted: files, rejected: [] }) } },
      { provide: AssistWithBrief, useValue: {
        isAvailable,
        execute: vi.fn(async (notes: string) => { assistCalls.push(notes); return { status: 'success', message: '', suggestion: 'draft' }; })
      } },
      { provide: ToastService, useValue: { show: vi.fn(), message: signal('') } }
    ]
  });
  const fixture = TestBed.createComponent(NewRequestPageComponent);
  fixture.detectChanges();
  await new Promise(resolve => setTimeout(resolve));
  fixture.detectChanges();
  // The helper sits beside the goal field on step 2, so the wizard is walked to it.
  const component = fixture.componentInstance;
  component.requestTitle.set('Chain rule');
  component.step.set(2);
  fixture.detectChanges();
  return { page: fixture.nativeElement as HTMLElement, component, assistCalls, capabilityCalls, isAvailable };
}

const helper = (page: HTMLElement) => page.querySelector('[data-testid="ai-help"]');

describe('UX-08 the writing helper appears only when it works', () => {
  it('shows the helper when the server says the capability is available', async () => {
    const { page } = await render({ capability: async () => true });
    expect(helper(page)).not.toBeNull();
    expect(helper(page)?.textContent).toContain('Help me write this');
  });

  it('shows no helper at all when AI is disabled', async () => {
    const { page, assistCalls } = await render({ capability: async () => false });
    expect(helper(page)).toBeNull();
    expect(page.querySelector('[data-testid="ai-draft"]')).toBeNull();
    // Nothing tells the student about a feature they cannot use.
    expect(page.textContent).not.toContain('Help me write this');
    expect(page.textContent).not.toMatch(/unavailable|coming soon/i);
    // And no AI work is requested.
    expect(assistCalls).toEqual([]);
  });

  it('hides the helper when availability cannot be established, and leaves the page usable', async () => {
    const { page, assistCalls } = await render({ capability: async () => { throw new Error('500'); } });
    expect(helper(page)).toBeNull();
    expect(assistCalls).toEqual([]);
    expect(page.textContent).not.toContain('500');
    // The wizard itself still works: the goal field the helper sat beside is there, and so is its label.
    expect(page.querySelector('#req-goal')).not.toBeNull();
    expect(page.textContent).toContain('What do you want to achieve?');
  });

  it('asks the capability question once per page', async () => {
    const { capabilityCalls } = await render();
    expect(capabilityCalls.count).toBe(1);
  });

  it('keeps the Arabic wizard whole when the helper is hidden', async () => {
    const { page } = await render({ capability: async () => false, lang: 'ar' });
    expect(helper(page)).toBeNull();
    expect(page.querySelector('#req-goal')).not.toBeNull();
    // No empty action row is left where the button was.
    for (const field of [...page.querySelectorAll('.tf-field')])
      expect(field.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect([...page.querySelectorAll<HTMLTextAreaElement>('textarea[id^="req-prompt-"]')]
      .map(input => input.value)).toEqual(['', '']);
  });
});

describe('A sent request is no longer a draft', () => {
  it('does not save the brief again after the request was created', async () => {
    const { component } = await render();
    const save = TestBed.inject(SaveRequestDraft).execute as ReturnType<typeof vi.fn>;
    component.created.set({ id: 'r1' } as never);
    save.mockClear();
    component.goal.set('Changed after sending');
    TestBed.tick();
    await new Promise(resolve => setTimeout(resolve, 600));
    expect(save).not.toHaveBeenCalled();
  });
});
