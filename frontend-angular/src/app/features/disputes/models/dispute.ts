/**
 * A protected case opened against an order or a finished live session.
 *
 * `status` and `resolution` arrive from the API as integers. They are named here
 * so nothing above this file compares against a magic number — the legacy page
 * carried `Number(d.status) === 2` in eleven places.
 */
export type DisputeStatus = 'open' | 'under-review' | 'resolved';
export type DisputeResolution = 'refund-student' | 'release-teacher' | 'no-action';

/** Wire values, kept next to the names they map to. */
export const DISPUTE_STATUS_BY_CODE: Readonly<Record<number, DisputeStatus>> = {
  0: 'open', 1: 'under-review', 2: 'resolved'
};
export const RESOLUTION_CODE: Readonly<Record<DisputeResolution, number>> = {
  'refund-student': 0, 'release-teacher': 1, 'no-action': 2
};

export interface DisputeMessage {
  readonly id: string;
  readonly senderId: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface DisputeEvidence {
  readonly id: string;
  readonly fileName: string;
}

export interface DisputeHistoryEntry {
  readonly nextStatus: DisputeStatus;
  readonly createdAt: string;
}

export interface DisputeDecision {
  readonly rationale: string;
}

export interface Dispute {
  readonly id: string;
  readonly status: DisputeStatus;
  readonly reason: string;
  readonly createdAt: string;
  readonly orderId: string | null;
  readonly liveSessionBookingId: string | null;
  readonly studentId: string;
  readonly teacherId: string;
  /** Who reported it; the other participant reads it as something to answer. */
  readonly openedById?: string | null;
  /** ETag for optimistic concurrency; every mutation must echo it as If-Match. */
  readonly version: string;
  readonly actionDueAt: string | null;
  readonly messages: readonly DisputeMessage[];
  readonly evidence: readonly DisputeEvidence[];
  readonly history: readonly DisputeHistoryEntry[];
  readonly decisions: readonly DisputeDecision[];
}

/** A purchase currently inside its dispute window. */
export interface EligiblePurchase {
  readonly type: 'order' | 'session';
  readonly id: string;
  readonly title: string;
  readonly titleArabic: string;
  readonly amount: number;
  readonly currency: string;
  readonly otherPartyName: string | null;
  readonly otherPartyNameEnglish: string | null;
  readonly eligibleUntil: string;
}

export const Dispute = {
  isClosed: (d: Dispute): boolean => d.status === 'resolved',
  /** Both parties may add to a live case; an admin only once review has started. */
  acceptsMessagesFrom: (d: Dispute, isAdmin: boolean): boolean =>
    d.status !== 'resolved' && (!isAdmin || d.status === 'under-review'),
  isOverdue: (d: Dispute, now: Date = new Date()): boolean =>
    d.actionDueAt !== null && new Date(d.actionDueAt) < now,
  /** What the case is about, for a one-line label. */
  subjectId: (d: Dispute): string => d.orderId ?? d.liveSessionBookingId ?? ''
} as const;

/** Evidence upload limits, mirroring what the endpoint accepts. */
export const EVIDENCE_LIMITS = {
  maxBytes: 50 * 1024 * 1024,
  acceptedTypes: ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'] as const
} as const;

export function isAcceptableEvidence(file: { size: number; type: string }): boolean {
  return file.size <= EVIDENCE_LIMITS.maxBytes
    && (EVIDENCE_LIMITS.acceptedTypes as readonly string[]).includes(file.type);
}
