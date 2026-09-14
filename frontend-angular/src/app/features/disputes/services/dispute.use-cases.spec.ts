import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dispute, isAcceptableEvidence } from '@features/disputes/models/dispute';
import {
  DISPUTE_ADMIN_GATEWAY, DISPUTE_GATEWAY, DisputeAdminGateway, DisputeGateway
} from './dispute.ports';
import {
  ListEligiblePurchases, OpenDispute, PostCaseMessage, ResolveDispute, UploadEvidence
} from './dispute.use-cases';

const CASE: Dispute = {
  id: 'd1', status: 'under-review', reason: 'Not delivered', createdAt: '2026-08-01T10:00:00Z',
  orderId: 'o-123456789', liveSessionBookingId: null,
  studentId: 's1', teacherId: 't1', version: 'v7', actionDueAt: null,
  messages: [], evidence: [], history: [], decisions: []
};

function configure(overrides: {
  gateway?: Partial<DisputeGateway>;
  admin?: Partial<DisputeAdminGateway>;
} = {}) {
  const gateway: DisputeGateway = {
    list: () => of({ items: [CASE], page: 1, totalCount: 1 }),
    byId: () => of(CASE),
    eligiblePurchases: () => of([]),
    open: () => of(CASE),
    postMessage: () => of(undefined),
    uploadEvidence: () => of(undefined),
    downloadEvidence: () => of(undefined),
    ...overrides.gateway
  };
  const admin: DisputeAdminGateway = {
    list: () => of({ items: [CASE], page: 1, totalCount: 1 }),
    byId: () => of(CASE),
    startReview: () => of(undefined),
    resolve: () => of(undefined),
    ...overrides.admin
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: DISPUTE_GATEWAY, useValue: gateway },
      { provide: DISPUTE_ADMIN_GATEWAY, useValue: admin }
    ]
  });
  return { gateway, admin };
}

describe('dispute domain rules', () => {
  it('closes a resolved case to further messages', () => {
    expect(Dispute.acceptsMessagesFrom({ ...CASE, status: 'resolved' }, false)).toBe(false);
    expect(Dispute.acceptsMessagesFrom({ ...CASE, status: 'resolved' }, true)).toBe(false);
  });

  it('lets a participant write to an open case but an admin only once review starts', () => {
    const open = { ...CASE, status: 'open' as const };
    expect(Dispute.acceptsMessagesFrom(open, false)).toBe(true);
    expect(Dispute.acceptsMessagesFrom(open, true)).toBe(false);
    expect(Dispute.acceptsMessagesFrom(CASE, true)).toBe(true);   // under-review
  });

  it('reads overdue against the action deadline', () => {
    const now = new Date('2026-08-10T00:00:00Z');
    expect(Dispute.isOverdue({ ...CASE, actionDueAt: '2026-08-09T00:00:00Z' }, now)).toBe(true);
    expect(Dispute.isOverdue({ ...CASE, actionDueAt: '2026-08-11T00:00:00Z' }, now)).toBe(false);
    expect(Dispute.isOverdue(CASE, now)).toBe(false);             // no deadline set
  });

  it('names the subject from whichever id the case carries', () => {
    expect(Dispute.subjectId(CASE)).toBe('o-123456789');
    expect(Dispute.subjectId({ ...CASE, orderId: null, liveSessionBookingId: 'b-9' })).toBe('b-9');
  });
});

describe('evidence limits', () => {
  it('accepts the four documented types under 50MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'application/pdf', 'text/plain']) {
      expect(isAcceptableEvidence({ size: 1024, type })).toBe(true);
    }
  });

  it('rejects anything else, and anything oversized', () => {
    expect(isAcceptableEvidence({ size: 1024, type: 'application/zip' })).toBe(false);
    expect(isAcceptableEvidence({ size: 50 * 1024 * 1024 + 1, type: 'application/pdf' })).toBe(false);
    expect(isAcceptableEvidence({ size: 50 * 1024 * 1024, type: 'application/pdf' })).toBe(true);
  });
});

describe('UploadEvidence', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('refuses an unacceptable file without sending 50MB to the server', () => {
    const uploadEvidence = vi.fn(() => of(undefined));
    configure({ gateway: { uploadEvidence } });
    const big = { size: 60 * 1024 * 1024, type: 'application/pdf', name: 'x.pdf' } as File;

    expect(() => TestBed.inject(UploadEvidence).execute(CASE, big)).toThrow('unacceptable-evidence');
    expect(uploadEvidence).not.toHaveBeenCalled();
  });

  it('passes the case version through so a stale write is rejected', async () => {
    const uploadEvidence = vi.fn((_id: string, _f: File, _v: string) => of(undefined));
    configure({ gateway: { uploadEvidence } });
    const file = { size: 10, type: 'image/png', name: 'a.png' } as File;

    await TestBed.inject(UploadEvidence).execute(CASE, file);
    expect(uploadEvidence.mock.calls[0]![2]).toBe('v7');
  });
});

describe('PostCaseMessage', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('trims the body and sends the version as If-Match', async () => {
    const postMessage = vi.fn((_id: string, _b: string, _v: string) => of(undefined));
    configure({ gateway: { postMessage } });
    await TestBed.inject(PostCaseMessage).execute(CASE, '  hello  ');
    expect(postMessage.mock.calls[0]![1]).toBe('hello');
    expect(postMessage.mock.calls[0]![2]).toBe('v7');
  });

  it('refuses a whitespace-only message', () => {
    configure();
    expect(() => TestBed.inject(PostCaseMessage).execute(CASE, '   ')).toThrow();
  });
});

describe('ResolveDispute', () => {
  beforeEach(() => TestBed.resetTestingModule());

  /**
   * Resolving moves money. The key exists so a retry after a lost response
   * cannot pay out twice, which means it must be stable per attempt.
   */
  it('mints a key scoped to the case', () => {
    configure();
    const key = TestBed.inject(ResolveDispute).mintKey(CASE);
    expect(key.startsWith('dispute-d1-')).toBe(true);
  });

  it('sends the resolution as its wire code, with version and key', async () => {
    const resolve = vi.fn(
      (_id: string, _r: string, _rat: string, _v: string, _k: string) => of(undefined));
    configure({ admin: { resolve } });

    await TestBed.inject(ResolveDispute)
      .execute(CASE, 'release-teacher', '  because  ', 'key-1');

    const [id, resolution, rationale, version, key] = resolve.mock.calls[0]!;
    expect(id).toBe('d1');
    expect(resolution).toBe('release-teacher');
    expect(rationale).toBe('because');
    expect(version).toBe('v7');
    expect(key).toBe('key-1');
  });

  it('refuses to resolve without a rationale', () => {
    configure();
    expect(() => TestBed.inject(ResolveDispute).execute(CASE, 'no-action', '  ', 'k')).toThrow();
  });
});

describe('ListEligiblePurchases', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('does not call the endpoint for an admin, who has nothing to dispute', async () => {
    const eligiblePurchases = vi.fn(() => of([]));
    configure({ gateway: { eligiblePurchases } });
    await expect(TestBed.inject(ListEligiblePurchases).execute(true)).resolves.toEqual([]);
    expect(eligiblePurchases).not.toHaveBeenCalled();
  });

  it('asks for the list for anyone else', async () => {
    const eligiblePurchases = vi.fn(() => of([]));
    configure({ gateway: { eligiblePurchases } });
    await TestBed.inject(ListEligiblePurchases).execute(false);
    expect(eligiblePurchases).toHaveBeenCalled();
  });
});

describe('OpenDispute', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('sends an order target as an order and a session target as a session', async () => {
    const open = vi.fn((_c: { reason: string; target: { type: string; id: string } }) => of(CASE));
    configure({ gateway: { open } });
    const useCase = TestBed.inject(OpenDispute);

    await useCase.execute({ reason: 'a', target: { type: 'order', id: 'o1' } });
    await useCase.execute({ reason: 'b', target: { type: 'session', id: 's1' } });

    expect(open.mock.calls[0]![0].target).toEqual({ type: 'order', id: 'o1' });
    expect(open.mock.calls[1]![0].target).toEqual({ type: 'session', id: 's1' });
  });

  it('surfaces a gateway rejection rather than swallowing it', async () => {
    configure({ gateway: { open: () => throwError(() => new Error('409')) } });
    await expect(
      TestBed.inject(OpenDispute).execute({ reason: 'a', target: { type: 'order', id: 'o1' } })
    ).rejects.toThrow('409');
  });
});
