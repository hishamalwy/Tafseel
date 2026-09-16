import { PartyNameFields } from '@shared/models/display-name';
import { Viewer, orderStatus } from '@shared/vocabulary/status-vocabulary';

/** `OrderStatus` as the API serializes it (numeric). */
export const enum OrderStatus { AwaitingPayment = 0, InProgress = 1, Delivered = 2, RevisionRequested = 3, Completed = 4, Cancelled = 5 }
/** `OrderPaymentStatus` as the API serializes it (numeric). */
export const enum OrderPaymentStatus { Pending = 0, Paid = 1, Failed = 2, Refunded = 3 }

export interface OrderDelivery {
  readonly id: string;
  readonly originalName: string;
  readonly contentType: string;
  readonly size: number;
  readonly message: string;
  readonly createdAt: string;
}

export interface OrderDetail extends PartyNameFields {
  readonly id: string;
  readonly learningRequestId?: string;
  readonly studentId: string;
  readonly teacherId: string;
  readonly price: number;
  readonly currency: string;
  readonly studentFeeAmount?: number;
  readonly studentTotal: number;
  readonly teacherNet?: number | null;
  readonly agreedDeliveryAt: string;
  readonly revisionAllowance: number;
  readonly revisionsUsed: number;
  readonly status: number;
  readonly paymentStatus: number;
  readonly createdAt: string;
  readonly deliveries: readonly OrderDelivery[];
  readonly version?: string;
  readonly requestTitle?: string | null;
  readonly serviceNameEnglish?: string | null;
  readonly serviceNameArabic?: string | null;
  readonly isOverdue?: boolean;
  readonly hasReview?: boolean;
  readonly reviewCanSubmit?: boolean;
  readonly reviewOverallScore?: number | null;
  readonly reviewComment?: string | null;
}

export interface OrderTimelineEvent {
  readonly id: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly actorRole: string;
  readonly metadata?: { readonly revisionSequence?: number | null; readonly originalName?: string | null } | null;
}

/** English wording for each status key, used when the locale table has not loaded. */
export const ORDER_STATUS_FALLBACK: Readonly<Record<string, string>> = {
  order_status_payment_required: 'Payment required',
  order_status_payment_confirmed: 'Paid — waiting for the teacher to start',
  order_status_awaiting_student_payment: 'Waiting for the student’s payment',
  order_status_paid_start: 'Paid — start the work',
  order_status_delivered_review: 'Delivered — review it',
  order_status_in_progress: 'In progress',
  order_status_delivered: 'Delivered',
  order_status_revision: 'Revision requested',
  order_status_completed: 'Completed',
  order_status_cancelled: 'Cancelled',
  order_status_unknown: 'Unknown'
};

/**
 * The locale key for an order's state, using the same vocabulary as the dashboards. A paid
 * order that has not started yet is the one state the API has no single field for.
 */
export function orderStatusKey(order: Pick<OrderDetail, 'status' | 'paymentStatus'>, viewer: Viewer = 'student'): string {
  const view = orderStatus(order.status, order.paymentStatus, viewer);
  return view.labelKey === 'status_unknown' ? 'order_status_unknown' : view.labelKey;
}

export type OrderRole = 'student' | 'teacher' | null;
export type OrderAction = 'pay' | 'start' | 'deliver' | 'revision' | 'complete' | 'review' | 'cancel';

export const DELIVERY_LIMITS = { files: 6, bytes: 50 * 1024 * 1024, message: 2000 } as const;
export const VIEWABLE_TYPE = /^(application\/pdf|image\/(png|jpeg|webp|gif)|video\/(mp4|webm)|audio\/(wav|mpeg|mp4|aac|ogg))$/i;

export interface ReviewDraft {
  readonly explanationClarity: number | null;
  readonly subjectKnowledge: number | null;
  readonly communication: number | null;
  readonly onTimeDelivery: number | null;
  readonly valueForMoney: number | null;
  readonly comment: string;
  readonly recommends: boolean;
}

export const REVIEW_CRITERIA = ['explanationClarity', 'subjectKnowledge', 'communication', 'onTimeDelivery', 'valueForMoney'] as const;

export const Order = {
  roleOf(order: Pick<OrderDetail, 'studentId' | 'teacherId'>, viewerId: string): OrderRole {
    return !viewerId ? null : order.studentId === viewerId ? 'student' : order.teacherId === viewerId ? 'teacher' : null;
  },

  /**
   * What this viewer can do now, from the order's own state - the same guards as the `Order`
   * aggregate. Nothing is offered on the strength of a role alone.
   */
  actions(order: OrderDetail, viewerId: string): readonly OrderAction[] {
    const role = Order.roleOf(order, viewerId);
    const actions: OrderAction[] = [];
    const awaiting = order.status === OrderStatus.AwaitingPayment;
    if (role === 'student') {
      if (awaiting && order.paymentStatus === OrderPaymentStatus.Pending) actions.push('pay', 'cancel');
      if (order.status === OrderStatus.Delivered) {
        if (order.revisionsUsed < order.revisionAllowance) actions.push('revision');
        actions.push('complete');
      }
      if (order.status === OrderStatus.Completed && order.reviewCanSubmit && !order.hasReview) actions.push('review');
    }
    if (role === 'teacher') {
      if (awaiting && order.paymentStatus === OrderPaymentStatus.Paid) actions.push('start');
      if (awaiting && order.paymentStatus === OrderPaymentStatus.Pending) actions.push('cancel');
      if (order.status === OrderStatus.InProgress || order.status === OrderStatus.RevisionRequested) actions.push('deliver');
    }
    return actions;
  },

  revisionsLeft(order: Pick<OrderDetail, 'revisionAllowance' | 'revisionsUsed'>): number {
    return Math.max(0, order.revisionAllowance - order.revisionsUsed);
  },

  /** Files a delivery may carry, checked before upload; the server validates again. */
  deliveryProblem(files: readonly File[]): 'none' | 'count' | 'type' | 'size' | null {
    if (!files.length) return 'none';
    if (files.length > DELIVERY_LIMITS.files) return 'count';
    if (files.some(file => !VIEWABLE_TYPE.test(file.type))) return 'type';
    if (files.some(file => file.size <= 0 || file.size > DELIVERY_LIMITS.bytes)) return 'size';
    return null;
  },

  emptyReview(): ReviewDraft {
    return { explanationClarity: null, subjectKnowledge: null, communication: null, onTimeDelivery: null, valueForMoney: null, comment: '', recommends: true };
  },

  /** `CreateReview`: five 1-5 ratings and a comment of up to 2000 characters. */
  reviewProblems(draft: ReviewDraft): readonly ('ratings' | 'comment' | 'comment_too_long')[] {
    const problems: ('ratings' | 'comment' | 'comment_too_long')[] = [];
    if (REVIEW_CRITERIA.some(key => { const v = draft[key]; return v === null || !Number.isInteger(v) || v < 1 || v > 5; })) problems.push('ratings');
    if (!draft.comment.trim()) problems.push('comment');
    else if (draft.comment.trim().length > 2000) problems.push('comment_too_long');
    return problems;
  }
} as const;
