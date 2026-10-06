import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { describe, it, expect } from 'vitest';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { SignalSessionStore } from '@core/auth/services/session.store';
import { DialogService } from '@shared/services/dialog.service';
import { LiveSession, SESSION_STATUS } from '../models/live-session';
import { LiveSessionGateway } from '../services/live-session.gateway';
import { LiveSessionPageComponent } from './live-session-page.component';

async function open() {
  let booking: LiveSession = {
    id: 's1', studentId: 'student', teacherId: 'teacher', title: 'Calculus', notes: '',
    startsAt: new Date(Date.now() - 2 * 3600000).toISOString(), endsAt: new Date(Date.now() - 3600000).toISOString(),
    studentTimeZoneId: 'UTC', teacherTimeZoneId: 'UTC', totalPrice: 120, currency: 'SAR', cancellationWindowHours: 24,
    status: SESSION_STATUS.CONFIRMED, attachments: [], version: 'v1', studentName: 'Student', teacherName: 'Teacher',
    serviceName: 'Live session', serviceNameArabic: '', proposedStartsAt: '', rescheduleRequestedById: '',
    outcomeReviewDeadline: '', rescheduleCount: 0, hasReview: false
  };
  const response = new Subject<void>();
  const user = { userId: 'teacher', roles: ['Teacher'] };
  TestBed.configureTestingModule({ providers: [
    provideHttpClient(), provideHttpClientTesting(),
    provideRouter([{ path: 'live-sessions/:sessionId', component: LiveSessionPageComponent }]),
    { provide: LiveSessionGateway, useValue: { find: async () => booking, complete: () => response } },
    { provide: SESSION_STORE, useValue: { current: () => user } },
    { provide: SignalSessionStore, useValue: { current: signal(user), roles: signal(user.roles) } },
    { provide: DialogService, useValue: { confirm: async () => true } }
  ] });
  const harness = await RouterTestingHarness.create();
  const component = await harness.navigateByUrl('/live-sessions/s1', LiveSessionPageComponent);
  await new Promise(resolve => setTimeout(resolve)); harness.detectChanges();
  return { component, harness, response, pending: () => { booking = { ...booking, status: SESSION_STATUS.COMPLETION_PENDING, version: 'v2' }; } };
}

describe('live session operation feedback', () => {
  it('shows success only after the operation succeeds and says the student still needs to confirm', async () => {
    const { component, harness, response, pending } = await open();
    const operation = component.complete();
    await new Promise(resolve => setTimeout(resolve)); harness.detectChanges();
    expect(component.busy()).toBe('complete');
    expect(component.successNotice()).toBe('');
    expect(harness.routeNativeElement!.querySelector('[data-testid="complete-session"]')?.getAttribute('data-feedback')).toBe('busy');
    pending(); response.next(); response.complete(); await operation; harness.detectChanges();
    expect(component.busy()).toBe('');
    expect(component.successNotice()).toContain('confirmation');
    expect(harness.routeNativeElement!.querySelector('[data-testid="session-status"]')?.getAttribute('data-status')).toBe('6');
    expect(harness.routeNativeElement!.querySelector('tf-ui-state [data-state="success"]')).not.toBeNull();
  });

  it('returns the button to ready and keeps a refused operation out of success states', async () => {
    const { component, harness, response } = await open();
    const operation = component.complete();
    await new Promise(resolve => setTimeout(resolve));
    response.error(new HttpErrorResponse({ status: 409, error: { code: 'session_not_ended', detail: 'The session has not ended.' } }));
    await operation; harness.detectChanges();
    expect(component.busy()).toBe('');
    expect(component.successNotice()).toBe('');
    expect(component.actionError()).not.toBe('');
    expect(harness.routeNativeElement!.querySelector('tf-ui-state [data-state="success"]')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('[data-testid="session-error"]')).not.toBeNull();
  });
});
