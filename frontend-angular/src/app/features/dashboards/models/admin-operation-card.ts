import { LATE_BADGE, orderStatus, requestStatus, sessionStatus } from '@shared/vocabulary/status-vocabulary';
import { CardBadge, CardFormat, DashboardCardView } from './dashboard-card';

type Row = Record<string, unknown>;

/** The three operational queues share an API DTO, but each needs its own decisive facts. */
export function presentAdminOperation(row: Row, fmt: CardFormat, now: number): DashboardCardView | null {
  const source = String(row['_source'] ?? '').split('?')[0];
  const kind = source === '/admin/operations/requests' ? 'request'
    : source === '/admin/operations/orders' ? 'order'
    : source === '/admin/operations/sessions' ? 'session' : null;
  if (!kind) return null;

  const status = kind === 'request' ? requestStatus(row['status'])
    : kind === 'order' ? orderStatus(row['status'], undefined)
      : sessionStatus(row['status']);
  const badges: CardBadge[] = [{ text: fmt.t(status.labelKey, status.fallback), tone: status.tone }];
  const scheduled = Date.parse(String(row['scheduledAt'] ?? ''));
  if (kind === 'order' && (row['status'] === 1 || row['status'] === 3)
    && Number.isFinite(scheduled) && scheduled < now) {
    badges.push({ text: fmt.t(LATE_BADGE.labelKey, LATE_BADGE.fallback), tone: LATE_BADGE.tone });
  }
  if (kind === 'session' && row['passiveReviewRequired'] === true) {
    badges.push({ text: fmt.t('admin_filter_ses_admin_review', 'Needs Admin review'), tone: 'warning' });
  }

  const fields = [
    row['createdAt'] ? { label: fmt.t('field_created_at', 'Created'), value: fmt.date(row['createdAt']) } : null,
    row['scheduledAt'] ? {
      label: kind === 'request' ? fmt.t('field_deadline', 'Deadline')
        : kind === 'order' ? fmt.t('card_field_agreed_delivery', 'Agreed delivery')
          : fmt.t('field_scheduled_at', 'Scheduled'),
      value: fmt.date(row['scheduledAt'])
    } : null,
    typeof row['amount'] === 'number' ? {
      label: fmt.t('field_amount', 'Amount'), value: fmt.money(row['amount'], row['currency'])
    } : null
  ].filter((field): field is { label: string; value: string } => field !== null);
  const parties = [
    row['studentName'] ? `${fmt.t('demand_student', 'Student')}: ${row['studentName']}` : '',
    row['teacherName'] ? `${fmt.t('demand_teacher', 'Teacher')}: ${row['teacherName']}` : ''
  ].filter(Boolean).join(' · ');

  return {
    title: String(row['title'] || fmt.t('card_untitled', 'Untitled')),
    badges, secondary: parties, fields, action: '', body: ''
  };
}
