import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  FinanceAttention, FinancePayment, FinancePaymentDetail, FinanceWithdrawal, FinancialAuditEntry, Json, Page,
  PayoutProfileRow, ReconciliationCase, ReconciliationSummary, TransferInstruction, num, opt, text
} from '../models/finance';

const page = <T>(row: Json, map: (item: Json) => T): Page<T> => ({
  items: (Array.isArray(row['items']) ? row['items'] as Json[] : []).map(map),
  total: num(row['totalCount'] ?? row['total']), page: num(row['page']) || 1, pageSize: num(row['pageSize']) || 25
});

const payment = (row: Json): FinancePayment => ({
  id: text(row['id']), amount: num(row['amount']), currency: text(row['currency']) || 'SAR', status: num(row['status']),
  provider: text(row['provider']), providerReference: text(row['providerReference']), createdAt: text(row['createdAt']),
  purchaseKind: text(row['purchaseKind']), purchaseId: opt(row['purchaseId']), purchaseTitle: opt(row['purchaseTitle']),
  studentName: opt(row['studentName']), studentEmail: opt(row['studentEmail']), teacherName: opt(row['teacherName']),
  refunded: row['refunded'] === true, stuck: row['stuck'] === true, failedAttempts: num(row['failedAttempts'])
});

const withdrawal = (row: Json): FinanceWithdrawal => ({
  id: text(row['id']), teacherId: text(row['teacherId']),
  teacherName: text(row['teacherDisplayNameEnglish']) || text(row['teacherDisplayName']),
  amount: num(row['amount']), currency: text(row['currency']) || 'SAR', status: num(row['status']),
  providerReference: opt(row['providerReference']), destinationLabel: opt(row['destinationLabel']),
  rejectionReason: opt(row['rejectionReason']), createdAt: text(row['createdAt']),
  hasDestinationSnapshot: row['hasDestinationSnapshot'] === true, initiationReference: opt(row['initiationReference']),
  transferInitiatedAt: opt(row['transferInitiatedAt']), transferredAt: opt(row['transferredAt']), version: text(row['version'])
});

const profile = (row: Json): PayoutProfileRow => ({
  teacherId: text(row['teacherId']), legalName: text(row['legalName']), countryCode: text(row['countryCode']),
  destinationLabel: text(row['destinationLabel']), identityLast4: text(row['identityLast4']), status: num(row['status']),
  rejectionReason: opt(row['rejectionReason']), submittedAt: text(row['submittedAt']),
  transferReady: row['transferReady'] === true, reenrollmentRequired: row['reenrollmentRequired'] === true,
  version: text(row['version'])
});

const exceptionCase = (row: Json): ReconciliationCase => ({
  id: text(row['id']), kind: text(row['kind']), paymentId: opt(row['paymentId']), difference: num(row['difference']),
  detail: text(row['detail']), status: num(row['status']), firstDetectedAt: text(row['firstDetectedAt']),
  lastDetectedAt: text(row['lastDetectedAt']), detectedInLatestScan: row['detectedInLatestScan'] === true,
  acknowledgedByName: opt(row['acknowledgedByName']), acknowledgedAt: opt(row['acknowledgedAt']),
  acknowledgementNote: opt(row['acknowledgementNote']), resolvedByName: opt(row['resolvedByName']),
  resolvedAt: opt(row['resolvedAt']), resolutionNote: opt(row['resolutionNote']), version: text(row['version'])
});

/**
 * The Finance API. Every call is authorized by the server per duty; a money-moving call carries the
 * Idempotency-Key the caller keeps for the whole attempt and the If-Match version it acted on.
 */
@Injectable({ providedIn: 'root' })
export class FinanceGateway {
  private readonly http = inject(HttpClient);

  async attention(): Promise<FinanceAttention> {
    const row = await firstValueFrom(this.http.get<Json>('/api/v1/finance/attention'));
    return {
      stuckPayments: num(row['stuckPayments']), failedPaymentsLast24Hours: num(row['failedPaymentsLast24Hours']),
      payoutProfilesAwaitingReview: num(row['payoutProfilesAwaitingReview']),
      withdrawalsAwaitingTransfer: num(row['withdrawalsAwaitingTransfer']),
      transfersAwaitingEvidence: num(row['transfersAwaitingEvidence']),
      openReconciliationExceptions: num(row['openReconciliationExceptions']), ledgerBalanced: row['ledgerBalanced'] === true
    };
  }

  async payments(query: string, status: string, pageNumber: number): Promise<Page<FinancePayment>> {
    let params = new HttpParams().set('page', pageNumber).set('pageSize', 25);
    if (query.trim()) params = params.set('query', query.trim());
    if (status) params = params.set('status', status);
    return page(await firstValueFrom(this.http.get<Json>('/api/v1/finance/payments', { params })), payment);
  }

  async payment(id: string): Promise<FinancePaymentDetail> {
    const row = await firstValueFrom(this.http.get<Json>(`/api/v1/finance/payments/${encodeURIComponent(id)}`));
    const list = (value: unknown): Json[] => (Array.isArray(value) ? value as Json[] : []);
    const purchase = row['purchase'] as Json | null;
    return {
      payment: payment(row['payment'] as Json),
      attempts: list(row['attempts']).map(a => ({ id: text(a['id']), providerReference: text(a['providerReference']),
        status: num(a['status']), failureCode: opt(a['failureCode']), createdAt: text(a['createdAt']) })),
      webhooks: list(row['webhooks']).map(w => ({ id: text(w['id']), provider: text(w['provider']), eventId: text(w['eventId']),
        processedAt: text(w['processedAt']) })),
      purchase: purchase ? { kind: text(purchase['kind']), id: text(purchase['id']), title: opt(purchase['title']),
        status: text(purchase['status']), paymentStatus: opt(purchase['paymentStatus']), price: num(purchase['price']),
        currency: text(purchase['currency']) || 'SAR', hasDispute: purchase['hasDispute'] === true,
        disputeId: opt(purchase['disputeId']) } : null,
      escrow: list(row['escrow']).map(e => ({ type: num(e['type']), amount: num(e['amount']), currency: text(e['currency']),
        createdAt: text(e['createdAt']) })),
      refunds: list(row['refunds']).map(r => ({ id: text(r['id']), amount: num(r['amount']), currency: text(r['currency']),
        actorName: opt(r['actorName']), createdAt: text(r['createdAt']) })),
      ledger: list(row['ledger']).map(l => ({ businessKey: text(l['businessKey']), debitAccount: text(l['debitAccount']),
        creditAccount: text(l['creditAccount']), amount: num(l['amount']), currency: text(l['currency']),
        createdAt: text(l['createdAt']) })),
      refundAvailable: row['refundAvailable'] === true, refundBlockedReason: opt(row['refundBlockedReason'])
    };
  }

  refund(paymentId: string, reason: string, key: string): Promise<{ providerStatus: string }> {
    return firstValueFrom(this.http.post<{ providerStatus: string }>(`/api/v1/payments/${encodeURIComponent(paymentId)}/refund`, { reason },
      { headers: new HttpHeaders({ 'Idempotency-Key': key }) }));
  }

  async withdrawals(status: number | null, pageNumber: number): Promise<Page<FinanceWithdrawal>> {
    let params = new HttpParams().set('page', pageNumber).set('pageSize', 25);
    if (status !== null) params = params.set('status', status);
    return page(await firstValueFrom(this.http.get<Json>('/api/v1/admin/withdrawals', { params })), withdrawal);
  }

  /** Every call is recorded in the financial audit; the answer is kept on screen only while it is open. */
  async instruction(id: string): Promise<TransferInstruction> {
    const row = await firstValueFrom(this.http.post<Json>(`/api/v1/admin/withdrawals/${encodeURIComponent(id)}/transfer-instruction`, {}));
    return {
      withdrawalId: text(row['withdrawalId']), amount: num(row['amount']), currency: text(row['currency']) || 'SAR',
      beneficiaryName: text(row['beneficiaryName']), bankName: text(row['bankName']), iban: text(row['iban']),
      countryCode: text(row['countryCode']), transferNote: text(row['transferNote']), readyToSend: row['readyToSend'] === true,
      providerMovesFunds: row['providerMovesFunds'] === true, version: text(row['version'])
    };
  }

  async initiate(id: string, version: string, key: string): Promise<FinanceWithdrawal> {
    return withdrawal(await firstValueFrom(this.http.post<Json>(`/api/v1/withdrawals/${encodeURIComponent(id)}/transfer-initiation`, {},
      { headers: new HttpHeaders({ 'If-Match': version, 'Idempotency-Key': key }) })));
  }

  async confirmTransfer(id: string, evidence: { bankReference: string; sourceInstitution: string; transferredAt: string;
    amount: number; currency: string; confirmedAgainstBankRecord: boolean }, version: string, key: string): Promise<FinanceWithdrawal> {
    return withdrawal(await firstValueFrom(this.http.post<Json>(`/api/v1/withdrawals/${encodeURIComponent(id)}/transfer-confirmation`,
      evidence, { headers: new HttpHeaders({ 'If-Match': version, 'Idempotency-Key': key }) })));
  }

  reject(id: string, reason: string, confirmNoTransferSent: boolean, version: string, key: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`/api/v1/withdrawals/${encodeURIComponent(id)}/process`,
      { approve: false, providerReference: null, rejectionReason: reason, confirmNoTransferSent },
      { headers: new HttpHeaders({ 'If-Match': version, 'Idempotency-Key': key }) }));
  }

  async payoutProfiles(status: number | null, pageNumber: number): Promise<Page<PayoutProfileRow>> {
    let params = new HttpParams().set('page', pageNumber).set('pageSize', 25);
    if (status !== null) params = params.set('status', status);
    return page(await firstValueFrom(this.http.get<Json>('/api/v1/admin/payout-profiles', { params })), profile);
  }

  reviewPayoutProfile(teacherId: string, approve: boolean, reason: string | null, version: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`/api/v1/admin/payout-profiles/${encodeURIComponent(teacherId)}/review`,
      { approve, rejectionReason: reason }, { headers: new HttpHeaders({ 'If-Match': version }) }));
  }

  async scan(): Promise<ReconciliationSummary> {
    const row = await firstValueFrom(this.http.post<Json>('/api/v1/finance/reconciliation/scan', {}));
    const report = (row['report'] ?? {}) as Json;
    return {
      balanced: report['isBalanced'] === true, totalPayments: num(report['totalPayments']), escrowHeld: num(report['escrowHeld']),
      escrowReleased: num(report['escrowReleased']), refunded: num(report['refunded']),
      teacherAvailable: num(report['teacherAvailable']), pendingWithdrawals: num(report['pendingWithdrawals']),
      platformRevenue: num(report['platformRevenue']), openExceptions: num(row['openExceptions']),
      acknowledgedExceptions: num(row['acknowledgedExceptions']), newExceptions: num(row['newExceptions'])
    };
  }

  async exceptions(status: number | null): Promise<Page<ReconciliationCase>> {
    let params = new HttpParams().set('page', 1).set('pageSize', 100);
    if (status !== null) params = params.set('status', status);
    return page(await firstValueFrom(this.http.get<Json>('/api/v1/finance/reconciliation/exceptions', { params })), exceptionCase);
  }

  async annotate(id: string, action: 'acknowledge' | 'resolve', note: string, version: string): Promise<ReconciliationCase> {
    const headers = new HttpHeaders({ 'If-Match': version });
    const request = action === 'acknowledge'
      ? this.http.post<Json>(`/api/v1/finance/reconciliation/exceptions/${encodeURIComponent(id)}/acknowledge`, { note }, { headers })
      : this.http.post<Json>(`/api/v1/finance/reconciliation/exceptions/${encodeURIComponent(id)}/resolve`, { note }, { headers });
    return exceptionCase(await firstValueFrom(request));
  }

  async audit(query: string, pageNumber: number): Promise<Page<FinancialAuditEntry>> {
    let params = new HttpParams().set('page', pageNumber).set('pageSize', 50);
    if (query.trim()) params = params.set('query', query.trim());
    return page(await firstValueFrom(this.http.get<Json>('/api/v1/finance/audit', { params })), row => ({
      id: text(row['id']), action: text(row['action']), actorName: opt(row['actorName']), actorId: text(row['actorId']),
      entityType: text(row['entityType']), entityId: text(row['entityId']), correlationKey: text(row['correlationKey']),
      createdAt: text(row['createdAt'])
    }));
  }
}
