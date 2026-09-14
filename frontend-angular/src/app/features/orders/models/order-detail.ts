import { PartyNameFields } from '@shared/models/display-name';

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
  readonly studentId: string;
  readonly teacherId: string;
  readonly price: number;
  readonly currency: string;
  readonly studentTotal: number;
  readonly agreedDeliveryAt: string;
  readonly revisionAllowance: number;
  readonly revisionsUsed: number;
  readonly status: number;
  readonly paymentStatus: number;
  readonly createdAt: string;
  readonly deliveries: readonly OrderDelivery[];
  readonly requestTitle?: string | null;
  readonly serviceNameEnglish?: string | null;
  readonly serviceNameArabic?: string | null;
  readonly isOverdue?: boolean;
}

export interface OrderTimelineEvent {
  readonly id: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly actorRole: string;
}

/** English wording for each status key, used when the locale table has not loaded. */
export const ORDER_STATUS_FALLBACK: Readonly<Record<string, string>> = {
  order_status_payment_required: 'Payment required',
  order_status_payment_confirmed: 'Payment confirmed',
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
export function orderStatusKey(order: Pick<OrderDetail, 'status' | 'paymentStatus'>): string {
  switch (order.status) {
    case OrderStatus.AwaitingPayment:
      return order.paymentStatus === OrderPaymentStatus.Paid ? 'order_status_payment_confirmed' : 'order_status_payment_required';
    case OrderStatus.InProgress: return 'order_status_in_progress';
    case OrderStatus.Delivered: return 'order_status_delivered';
    case OrderStatus.RevisionRequested: return 'order_status_revision';
    case OrderStatus.Completed: return 'order_status_completed';
    case OrderStatus.Cancelled: return 'order_status_cancelled';
    default: return 'order_status_unknown';
  }
}
