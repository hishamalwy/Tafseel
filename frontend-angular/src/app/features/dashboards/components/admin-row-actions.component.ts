import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import { AdminActionsGateway } from '../services/admin-actions.gateway';

type Row = Record<string, unknown>;

const ROLES = ['Student', 'Teacher', 'QualityReviewer', 'Finance', 'Admin'] as const;
const PEOPLE_TABS = ['users', 'teachers', 'students', 'reviewers'];

/**
 * The decisions an Admin takes on one list row (J13, J14, FIN-04/05/06, OPS): roles, refunds, the
 * outcome of a silent live session, review visibility, withdrawals and payout profiles. Every one asks for
 * the reason or reference the server records, and confirms before anything irreversible.
 */
@Component({
  selector: 'tf-admin-row-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (people()) {
      <button type="button" (click)="rolesOpen.set(!rolesOpen())" [attr.aria-expanded]="rolesOpen()" data-testid="admin-roles">{{ t('admin_roles_change', 'Roles') }}</button>
    }
    @if (row()['canRefund'] === true && row()['paymentId']) {
      <button type="button" class="is-danger" (click)="refund()" [disabled]="busy()" data-testid="admin-refund">{{ t('admin_refund', 'Refund') }}</button>
    }
    @if (tab() === 'sessions' && row()['canResolveSessionOutcome'] === true) {
      <button type="button" (click)="resolveSession('complete')" [disabled]="busy()">{{ t('admin_session_complete', 'Mark completed') }}</button>
      <button type="button" (click)="resolveSession('student-no-show')" [disabled]="busy()">{{ t('admin_session_student_no_show', 'Student did not attend') }}</button>
      <button type="button" (click)="resolveSession('teacher-no-show')" [disabled]="busy()">{{ t('admin_session_teacher_no_show', 'Teacher did not attend') }}</button>
      <button type="button" (click)="resolveSession('dispute')" [disabled]="busy()">{{ t('admin_session_dispute', 'Open a dispute') }}</button>
    }
    @if (tab() === 'reviews' && row()['id'] && row()['isVisible'] !== undefined) {
      <button type="button" (click)="moderate()" [disabled]="busy()" data-testid="admin-moderate">{{ row()['isVisible'] ? t('admin_review_hide', 'Hide review') : t('admin_review_show', 'Show review') }}</button>
    }
    @if (tab() === 'withdrawals' && row()['status'] === 0) {
      <button type="button" (click)="withdrawal(true)" [disabled]="busy()">{{ t('admin_withdrawal_approve', 'Mark as transferred') }}</button>
      <button type="button" class="is-danger" (click)="withdrawal(false)" [disabled]="busy()">{{ t('admin_reject', 'Reject') }}</button>
    }
    @if (tab() === 'payoutProfiles' && row()['status'] === 0) {
      <button type="button" (click)="payoutProfile(true)" [disabled]="busy()">{{ t('admin_payout_verify', 'Verify') }}</button>
      <button type="button" class="is-danger" (click)="payoutProfile(false)" [disabled]="busy()">{{ t('admin_reject', 'Reject') }}</button>
    }
    @if (rolesOpen()) {
      <fieldset class="tf-admin-roles" data-testid="admin-roles-panel">
        <legend>{{ t('admin_roles_title', 'What this person can do') }}</legend>
        @for (role of roles; track role) {
          <label class="tf-admin-check">
            <input type="checkbox" [checked]="hasRole(role)" [disabled]="busy() || (isSelf() && role === 'Admin')" (change)="toggleRole(role)">
            {{ t('admin_role_' + role, role) }}
          </label>
        }
        @if (isSelf()) { <small>{{ t('admin_roles_self', 'You cannot remove your own Admin role.') }}</small> }
      </fieldset>
    }
  `
})
export class AdminRowActionsComponent {
  private readonly gateway = inject(AdminActionsGateway);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly session = inject(SESSION_STORE);
  private readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);

  readonly row = input.required<Row>();
  readonly tab = input.required<string>();
  readonly changed = output<void>();
  readonly busy = signal(false);
  readonly rolesOpen = signal(false);
  readonly roles = ROLES;
  readonly people = computed(() => PEOPLE_TABS.includes(this.tab()) && typeof this.row()['email'] === 'string');
  readonly isSelf = computed(() => this.row()['id'] === this.session.current()?.userId);

  t(key: string, fallback: string): string { return this.locale.t(key, fallback); }
  hasRole(role: string): boolean { return Array.isArray(this.row()['roles']) && (this.row()['roles'] as unknown[]).includes(role); }

  async toggleRole(role: string): Promise<void> {
    const assigned = !this.hasRole(role);
    const who = String(this.row()['fullName'] || this.row()['email'] || '');
    const roleName = this.t('admin_role_' + role, role);
    const body = this.locale.format(assigned ? 'admin_roles_grant_body' : 'admin_roles_remove_body', { role: roleName, name: who },
      assigned ? 'Give {name} the {role} role?' : 'Remove the {role} role from {name}?');
    if (!await this.dialogs.confirm({ body, confirmLabel: this.t('common_confirm', 'Confirm'), cancelLabel: this.t('common_cancel', 'Cancel'), destructive: !assigned || role === 'Admin' })) {
      this.changed.emit();
      return;
    }
    await this.run(() => this.gateway.setRole(String(this.row()['id']), role, assigned), this.t('admin_roles_saved', 'Roles updated.'));
  }

  async refund(): Promise<void> {
    const amount = this.fmt.money(this.row()['amount'] as number, String(this.row()['currency'] ?? 'SAR'));
    const reason = await this.reason(this.locale.format('admin_refund_reason', { amount }, 'Refund {amount} in full to the student. Why?'));
    if (!reason) return;
    if (!await this.dialogs.confirm({
      body: this.locale.format('admin_refund_confirm', { amount }, 'Refund {amount}? This cannot be undone.'),
      confirmLabel: this.t('admin_refund', 'Refund'), cancelLabel: this.t('common_cancel', 'Cancel'), destructive: true
    })) return;
    const key = crypto.randomUUID();
    await this.run(() => this.gateway.refund(String(this.row()['paymentId']), reason, key), this.t('admin_refund_done', 'Refunded.'));
  }

  async resolveSession(outcome: 'complete' | 'student-no-show' | 'teacher-no-show' | 'dispute'): Promise<void> {
    const labels: Record<typeof outcome, [string, string]> = {
      complete: ['admin_session_complete', 'Mark completed'],
      'student-no-show': ['admin_session_student_no_show', 'Student did not attend'],
      'teacher-no-show': ['admin_session_teacher_no_show', 'Teacher did not attend'],
      dispute: ['admin_session_dispute', 'Open a dispute']
    };
    const reason = await this.reason(this.locale.format('admin_session_reason', { outcome: this.t(...labels[outcome]) },
      '{outcome}: what did you find? Both participants will see this.'));
    if (!reason) return;
    if (!await this.dialogs.confirm({
      body: this.locale.format('admin_session_confirm', { outcome: this.t(...labels[outcome]) },
        'Record “{outcome}” for this session? Both participants are told, and the payment follows this outcome.'),
      confirmLabel: this.t(...labels[outcome]), cancelLabel: this.t('common_cancel', 'Cancel'), destructive: outcome !== 'complete'
    })) return;
    const key = crypto.randomUUID();
    await this.run(() => this.gateway.resolveSession(String(this.row()['id']), outcome, reason, String(this.row()['version'] ?? ''), key),
      this.t('admin_session_resolved', 'Session outcome recorded.'));
  }

  async moderate(): Promise<void> {
    const visible = !this.row()['isVisible'];
    const reason = await this.reason(visible
      ? this.t('admin_review_show_reason', 'Show this review again. Why?')
      : this.t('admin_review_hide_reason', 'Hide this review from the public profile and the rating. Why?'));
    if (!reason) return;
    await this.run(() => this.gateway.moderateReview(String(this.row()['id']), visible, reason), this.t('admin_review_moderated', 'Review updated.'));
  }

  async withdrawal(approve: boolean): Promise<void> {
    const detail = await this.reason(approve
      ? this.t('admin_withdrawal_reference_prompt', 'Enter the bank transfer reference.')
      : this.t('admin_withdrawal_reject_prompt', 'Why is this withdrawal rejected? The amount returns to the teacher’s balance.'));
    if (!detail) return;
    // UX-85: the last step says what happens, in money and to whom, before it cannot be taken back.
    const amount = this.fmt.money(this.row()['amount'] as number, String(this.row()['currency'] ?? 'SAR'));
    if (!await this.dialogs.confirm({
      body: approve
        ? this.locale.format('admin_withdrawal_approve_confirm', { amount }, 'Mark {amount} as transferred to the teacher? Do this only after the bank transfer is done; it cannot be undone.')
        : this.locale.format('admin_withdrawal_reject_confirm', { amount }, 'Reject this withdrawal? {amount} goes back to the teacher’s available balance and they see your reason.'),
      confirmLabel: approve ? this.t('admin_withdrawal_approve_ok', 'Mark as transferred') : this.t('admin_withdrawal_reject_ok', 'Reject withdrawal'),
      cancelLabel: this.t('common_cancel', 'Cancel'), destructive: !approve
    })) return;
    const key = crypto.randomUUID();
    await this.run(() => this.gateway.processWithdrawal(String(this.row()['id']), approve, detail, String(this.row()['version'] ?? ''), key),
      approve ? this.t('admin_withdrawal_approved', 'Marked as transferred.') : this.t('admin_withdrawal_rejected_done', 'Withdrawal rejected.'));
  }

  async payoutProfile(approve: boolean): Promise<void> {
    let reason: string | null = null;
    if (approve) {
      if (!await this.dialogs.confirm({ body: this.t('admin_payout_verify_body', 'Verify these payout details? The teacher can then request withdrawals.'),
        confirmLabel: this.t('admin_payout_verify', 'Verify'), cancelLabel: this.t('common_cancel', 'Cancel') })) return;
    } else {
      reason = await this.reason(this.t('admin_payout_reject_prompt', 'What should the teacher correct?'));
      if (!reason) return;
    }
    await this.run(() => this.gateway.reviewPayoutProfile(String(this.row()['teacherId']), approve, reason, String(this.row()['version'] ?? '')),
      approve ? this.t('admin_payout_verified_done', 'Payout details verified.') : this.t('admin_payout_rejected_done', 'Payout details rejected.'));
  }

  /** A required reason; an empty answer is treated as a cancel, with a note. */
  private async reason(message: string): Promise<string | null> {
    const answer = await this.dialogs.prompt({ message, confirmLabel: this.t('common_continue', 'Continue'), cancelLabel: this.t('common_cancel', 'Cancel') });
    if (answer === null) return null;
    if (!answer.trim()) { this.toasts.show(this.t('admin_reason_required', 'A reason is required.')); return null; }
    return answer.trim();
  }

  private async run(action: () => Promise<unknown>, done: string): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.toasts.show(done);
      this.changed.emit();
    } catch (error) {
      this.toasts.show(problemMessage(error, (k, f) => this.t(k, f)).text || this.t('admin_action_failed', 'This could not be done.'));
      this.changed.emit();
    } finally {
      this.busy.set(false);
    }
  }
}
