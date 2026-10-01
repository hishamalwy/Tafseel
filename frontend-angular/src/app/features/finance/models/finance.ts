/**
 * The Finance workspace's vocabulary (money duties only). The server decides every rule and every status;
 * these types shape its answers and the helpers turn its numbers into words.
 */

export type Json = Record<string, unknown>;

export interface FinanceAttention {
  readonly stuckPayments: number;
  readonly failedPaymentsLast24Hours: number;
  readonly payoutProfilesAwaitingReview: number;
  readonly withdrawalsAwaitingTransfer: number;
  readonly transfersAwaitingEvidence: number;
  readonly openReconciliationExceptions: number;
  readonly ledgerBalanced: boolean;
}

export interface FinancePayment {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: number;
  readonly provider: string;
  readonly providerReference: string;
  readonly createdAt: string;
  readonly purchaseKind: 'Order' | 'LiveSession' | 'OpenRequest' | string;
  readonly purchaseId: string | null;
  readonly purchaseTitle: string | null;
  readonly studentName: string | null;
  readonly studentEmail: string | null;
  readonly teacherName: string | null;
  readonly refunded: boolean;
  readonly stuck: boolean;
  readonly failedAttempts: number;
}

export interface FinancePaymentDetail {
  readonly payment: FinancePayment;
  readonly attempts: readonly { id: string; providerReference: string; status: number; failureCode: string | null; createdAt: string }[];
  readonly webhooks: readonly { id: string; provider: string; eventId: string; processedAt: string }[];
  readonly purchase: { kind: string; id: string; title: string | null; status: string; paymentStatus: string | null;
    price: number; currency: string; hasDispute: boolean; disputeId: string | null } | null;
  readonly escrow: readonly { type: number; amount: number; currency: string; createdAt: string }[];
  readonly refunds: readonly { id: string; amount: number; currency: string; actorName: string | null; createdAt: string }[];
  readonly ledger: readonly { businessKey: string; debitAccount: string; creditAccount: string; amount: number; currency: string; createdAt: string }[];
  readonly refundAvailable: boolean;
  readonly refundBlockedReason: string | null;
}

export interface FinanceWithdrawal {
  readonly id: string;
  readonly teacherId: string;
  readonly teacherName: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: number;
  readonly providerReference: string | null;
  readonly destinationLabel: string | null;
  readonly rejectionReason: string | null;
  readonly createdAt: string;
  readonly hasDestinationSnapshot: boolean;
  readonly initiationReference: string | null;
  readonly transferInitiatedAt: string | null;
  readonly transferredAt: string | null;
  readonly version: string;
}

/** The audited transfer instruction: shown on request, never listed, never cached. */
export interface TransferInstruction {
  readonly withdrawalId: string;
  readonly amount: number;
  readonly currency: string;
  readonly beneficiaryName: string;
  readonly bankName: string;
  readonly iban: string;
  readonly countryCode: string;
  readonly transferNote: string;
  readonly readyToSend: boolean;
  readonly providerMovesFunds: boolean;
  readonly version: string;
}

export interface PayoutProfileRow {
  readonly teacherId: string;
  readonly legalName: string;
  readonly countryCode: string;
  readonly destinationLabel: string;
  readonly identityLast4: string;
  readonly status: number;
  readonly rejectionReason: string | null;
  readonly submittedAt: string;
  readonly transferReady: boolean;
  readonly reenrollmentRequired: boolean;
  readonly version: string;
}

export interface ReconciliationCase {
  readonly id: string;
  readonly kind: string;
  readonly paymentId: string | null;
  readonly difference: number;
  readonly detail: string;
  readonly status: number;
  readonly firstDetectedAt: string;
  readonly lastDetectedAt: string;
  readonly detectedInLatestScan: boolean;
  readonly acknowledgedByName: string | null;
  readonly acknowledgedAt: string | null;
  readonly acknowledgementNote: string | null;
  readonly resolvedByName: string | null;
  readonly resolvedAt: string | null;
  readonly resolutionNote: string | null;
  readonly version: string;
}

export interface ReconciliationSummary {
  readonly balanced: boolean;
  readonly totalPayments: number;
  readonly escrowHeld: number;
  readonly escrowReleased: number;
  readonly refunded: number;
  readonly teacherAvailable: number;
  readonly pendingWithdrawals: number;
  readonly platformRevenue: number;
  readonly openExceptions: number;
  readonly acknowledgedExceptions: number;
  readonly newExceptions: number;
}

export interface FinancialAuditEntry {
  readonly id: string;
  readonly action: string;
  readonly actorName: string | null;
  readonly actorId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly correlationKey: string;
  readonly createdAt: string;
}

export interface Page<T> { readonly items: readonly T[]; readonly total: number; readonly page: number; readonly pageSize: number }

export const text = (value: unknown): string => (typeof value === 'string' ? value : '');
export const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
export const opt = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

export interface Words { readonly labelKey: string; readonly fallback: string; readonly tone: string }

export const FinanceWords = {
  payment(status: number, stuck = false): Words {
    if (stuck) return { labelKey: 'fin_payment_stuck', fallback: 'Stuck at checkout', tone: 'warning' };
    switch (status) {
      case 0: return { labelKey: 'fin_payment_pending', fallback: 'Awaiting the provider', tone: 'info' };
      case 1: return { labelKey: 'fin_payment_confirmed', fallback: 'Paid', tone: 'success' };
      case 2: return { labelKey: 'fin_payment_failed', fallback: 'Failed', tone: 'danger' };
      case 3: return { labelKey: 'fin_payment_refunded', fallback: 'Refunded', tone: 'neutral' };
      default: return { labelKey: 'status_unknown', fallback: 'Unknown', tone: 'neutral' };
    }
  },
  withdrawal(status: number): Words {
    switch (status) {
      case 0: return { labelKey: 'fin_withdrawal_to_send', fallback: 'To send', tone: 'warning' };
      case 3: return { labelKey: 'fin_withdrawal_started', fallback: 'Transfer started — evidence needed', tone: 'info' };
      case 1: return { labelKey: 'fin_withdrawal_transferred', fallback: 'Transferred', tone: 'success' };
      case 2: return { labelKey: 'fin_withdrawal_rejected', fallback: 'Rejected — returned to the teacher', tone: 'neutral' };
      default: return { labelKey: 'status_unknown', fallback: 'Unknown', tone: 'neutral' };
    }
  },
  payoutProfile(status: number): Words {
    switch (status) {
      case 0: return { labelKey: 'fin_payout_pending', fallback: 'Awaiting verification', tone: 'warning' };
      case 1: return { labelKey: 'fin_payout_verified', fallback: 'Verified', tone: 'success' };
      case 2: return { labelKey: 'fin_payout_rejected', fallback: 'Returned to the teacher', tone: 'danger' };
      default: return { labelKey: 'status_unknown', fallback: 'Unknown', tone: 'neutral' };
    }
  },
  exception(status: number): Words {
    switch (status) {
      case 0: return { labelKey: 'fin_exception_open', fallback: 'Open', tone: 'warning' };
      case 1: return { labelKey: 'fin_exception_acknowledged', fallback: 'Being investigated', tone: 'info' };
      case 2: return { labelKey: 'fin_exception_resolved', fallback: 'Resolved', tone: 'success' };
      default: return { labelKey: 'status_unknown', fallback: 'Unknown', tone: 'neutral' };
    }
  },
  purchase(kind: string): { labelKey: string; fallback: string } {
    switch (kind) {
      case 'Order': return { labelKey: 'fin_purchase_order', fallback: 'Explanation order' };
      case 'LiveSession': return { labelKey: 'fin_purchase_session', fallback: 'Live session' };
      default: return { labelKey: 'fin_purchase_open_request', fallback: 'Open request' };
    }
  },
  attempt(status: number): { labelKey: string; fallback: string } {
    switch (status) {
      case 1: return { labelKey: 'fin_attempt_succeeded', fallback: 'Succeeded' };
      case 2: return { labelKey: 'fin_attempt_failed', fallback: 'Failed' };
      default: return { labelKey: 'fin_attempt_created', fallback: 'Started' };
    }
  },
  escrow(type: number): { labelKey: string; fallback: string } {
    switch (type) {
      case 0: return { labelKey: 'fin_escrow_held', fallback: 'Held' };
      case 1: return { labelKey: 'fin_escrow_released', fallback: 'Released to the teacher' };
      default: return { labelKey: 'fin_escrow_refunded', fallback: 'Refunded to the student' };
    }
  }
} as const;
