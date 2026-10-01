import { disputeStatus } from '@shared/vocabulary/status-vocabulary';
import { CardBadge, CardField, CardFormat, DashboardCardView } from './dashboard-card';

type Row = Record<string, unknown>;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const view = (title: string, badges: CardBadge[], secondary: string, fields: (CardField | null)[], body = ''): DashboardCardView =>
  ({ title, badges, secondary, fields: fields.filter((f): f is CardField => f !== null), action: '', body });

/** An audit action code (`CatalogItemCreated`) as words, for the actions that have no translation yet. */
export function actionWords(action: string): string {
  const words = action.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : '';
}

/**
 * The server's English audit sentence without its internal words (UX-85): "Decision: RequestChanges." reads
 * "Decision: changes requested.", and "Held-escrow dispute opened." reads "Dispute opened on a paid purchase.".
 */
export function auditSummary(summary: string): string {
  const decisions: Readonly<Record<string, string>> = {
    Approve: 'approved', Approved: 'approved', Reject: 'rejected', Rejected: 'rejected', RequestChanges: 'changes requested'
  };
  return summary
    .replace(/Held-escrow dispute opened\./g, 'Dispute opened on a paid purchase.')
    .replace(/Decision: (\w+)\./g, (_m, code: string) => `Decision: ${decisions[code] ?? actionWords(code).toLowerCase()}.`)
    .replace(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g, word => actionWords(word).toLowerCase());
}

/**
 * The Admin lists whose rows the generic card cannot read: reviews, audit entries, withdrawals, payout
 * profiles and the two summaries (reviews, reconciliation). Each shows the facts the Admin decides on and
 * nothing else; ids and internal codes stay out of sight.
 */
export function presentAdminCard(row: Row, fmt: CardFormat): DashboardCardView | null {
  const source = String(row['_source'] ?? '').split('?')[0];
  const name = (native: unknown, english: unknown) =>
    (fmt.lang === 'ar' ? text(native) || text(english) : text(english) || text(native)) || fmt.t('admin_card_unknown_person', 'Unknown');

  switch (source) {
    case '/admin/disputes': {
      const status = disputeStatus(row['status']);
      return {
        ...view(row['liveSessionBookingId'] ? fmt.t('admin_dispute_session', 'Live session dispute') : fmt.t('admin_dispute_order', 'Order dispute'),
          [{ text: fmt.t(status.labelKey, status.fallback), tone: status.tone }], text(row['reason']),
          [
            { label: fmt.t('admin_dispute_opened', 'Opened'), value: fmt.date(row['createdAt']) },
            row['actionDueAt'] ? { label: fmt.t('admin_dispute_due', 'Decide by'), value: fmt.date(row['actionDueAt']) } : null
          ]),
        action: fmt.t('admin_dispute_open', 'Open the case')
      };
    }
    case '/admin/reviews': {
      const visible = row['isVisible'] !== false;
      return view(name(row['teacherDisplayName'], row['teacherDisplayNameEnglish']),
        [{ text: visible ? fmt.t('admin_review_visible', 'Public') : fmt.t('admin_review_state_hidden', 'Hidden'), tone: visible ? 'success' : 'neutral' }],
        text(row['serviceName']),
        [
          { label: fmt.t('admin_review_score', 'Rating'), value: `${num(row['overallScore'])?.toFixed(1) ?? '—'} / 5` },
          { label: fmt.t('admin_review_recommends', 'Recommends'), value: row['recommends'] ? fmt.t('common_yes', 'Yes') : fmt.t('common_no', 'No') },
          { label: fmt.t('field_created_at', 'Created'), value: fmt.date(row['createdAt']) },
          row['lastModerationReason'] ? { label: fmt.t('admin_review_moderation', 'Moderation note'), value: text(row['lastModerationReason']) } : null
        ],
        text(row['commentExcerpt']));
    }
    case '/admin/reviews/summary':
      return view(fmt.t('admin_review_summary', 'All reviews'), [], '', [
        { label: fmt.t('admin_review_visible', 'Public'), value: String(num(row['visible']) ?? 0) },
        { label: fmt.t('admin_review_state_hidden', 'Hidden'), value: String(num(row['hidden']) ?? 0) }
      ]);
    case '/admin/audit': {
      const action = text(row['action']);
      // An action with no translation yet reads as words in English and as a neutral label in Arabic.
      const fallback = fmt.lang === 'ar' ? fmt.t('admin_audit_other', 'Recorded action') : actionWords(action);
      return view(fmt.t(`audit_action_${action}`, fallback), [],
        text(row['actorName']) || text(row['actorNameEnglish'])
          ? name(row['actorName'], row['actorNameEnglish']) : fmt.t('admin_audit_system', 'System'),
        [
          { label: fmt.t('admin_audit_what', 'Record'), value: fmt.t(`audit_entity_${text(row['entityType'])}`, fmt.lang === 'ar' ? '—' : actionWords(text(row['entityType']))) },
          { label: fmt.t('admin_audit_when', 'When'), value: fmt.date(row['createdAt']) }
        ],
        // The summary is the server's English sentence; Arabic readers get the translated title instead.
        fmt.lang === 'ar' ? '' : auditSummary(text(row['summary'])));
    }
    case '/admin/withdrawals': {
      const status = num(row['status']);
      return view(name(row['teacherDisplayName'], row['teacherDisplayNameEnglish']),
        [status === 0 ? { text: fmt.t('admin_withdrawal_pending', 'Awaiting your decision'), tone: 'warning' }
          : status === 1 ? { text: fmt.t('admin_withdrawal_done', 'Transferred'), tone: 'success' }
          : { text: fmt.t('admin_withdrawal_rejected', 'Rejected'), tone: 'danger' }],
        fmt.money(row['amount'], row['currency']),
        [
          row['payoutMethod'] ? { label: fmt.t('admin_payout_method', 'Method'), value: text(row['payoutMethod']) } : null,
          row['destinationLabel'] ? { label: fmt.t('admin_payout_destination', 'Destination'), value: text(row['destinationLabel']) } : null,
          { label: fmt.t('admin_withdrawal_requested', 'Requested'), value: fmt.date(row['createdAt']) },
          row['providerReference'] ? { label: fmt.t('admin_withdrawal_reference', 'Transfer reference'), value: text(row['providerReference']) } : null,
          row['rejectionReason'] ? { label: fmt.t('admin_rejection_reason', 'Reason'), value: text(row['rejectionReason']) } : null
        ]);
    }
    case '/admin/payout-profiles': {
      const status = num(row['status']);
      return view(text(row['legalName']) || fmt.t('admin_card_unknown_person', 'Unknown'),
        [status === 0 ? { text: fmt.t('admin_payout_pending', 'Awaiting verification'), tone: 'warning' }
          : status === 1 ? { text: fmt.t('admin_payout_verified', 'Verified'), tone: 'success' }
          : { text: fmt.t('admin_withdrawal_rejected', 'Rejected'), tone: 'danger' }],
        '',
        [
          { label: fmt.t('admin_payout_method', 'Method'), value: text(row['payoutMethod']) },
          { label: fmt.t('admin_payout_destination', 'Destination'), value: text(row['destinationLabel']) },
          { label: fmt.t('admin_payout_country', 'Country'), value: text(row['countryCode']) },
          { label: fmt.t('admin_payout_identity', 'ID ends in'), value: text(row['identityLast4']) },
          { label: fmt.t('admin_payout_submitted', 'Submitted'), value: fmt.date(row['submittedAt']) },
          row['rejectionReason'] ? { label: fmt.t('admin_rejection_reason', 'Reason'), value: text(row['rejectionReason']) } : null
        ]);
    }
    case '/admin/finance/reconciliation': {
      const balanced = row['isBalanced'] === true;
      const anomalies = Array.isArray(row['anomalies']) ? (row['anomalies'] as unknown[]).map(a => (typeof a === 'string' ? a : JSON.stringify(a))) : [];
      const money = (key: string) => fmt.money(row[key], 'SAR');
      return view(balanced ? fmt.t('admin_recon_title_balanced', 'The ledger balances') : fmt.t('admin_recon_unbalanced', 'The ledger needs attention'),
        [{ text: balanced ? fmt.t('admin_recon_ok', 'Balanced') : fmt.format('admin_recon_issues', { n: anomalies.length }, '{n} issues'), tone: balanced ? 'success' : 'danger' }],
        '',
        [
          { label: fmt.t('admin_recon_payments', 'Payments received'), value: money('totalPayments') },
          { label: fmt.t('admin_recon_released', 'Released to teachers'), value: money('escrowReleased') },
          { label: fmt.t('admin_recon_refunded', 'Refunded'), value: money('refunded') },
          { label: fmt.t('admin_recon_pending', 'Teacher earnings clearing'), value: money('teacherPendingClearance') },
          { label: fmt.t('admin_recon_available', 'Teacher earnings available'), value: money('teacherAvailable') },
          { label: fmt.t('admin_recon_withdrawals', 'Withdrawals in progress'), value: money('pendingWithdrawals') },
          { label: fmt.t('admin_recon_revenue', 'Platform revenue'), value: money('platformRevenue') }
        ],
        anomalies.join(' · '));
    }
    default:
      return null;
  }
}
