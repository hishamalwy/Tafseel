import { describe, expect, it } from 'vitest';
import { DELIVERY_LIMITS, Order, OrderDetail, orderStatusKey } from './order-detail';

const order = (patch: Partial<OrderDetail> = {}): OrderDetail => ({
  id: 'o1', studentId: 's', teacherId: 't', price: 100, currency: 'SAR', studentTotal: 110,
  agreedDeliveryAt: '2026-09-20T12:00:00Z', revisionAllowance: 1, revisionsUsed: 0, status: 0, paymentStatus: 0,
  createdAt: '2026-09-10T09:00:00Z', deliveries: [], ...patch
});
const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });

describe('Order.actions', () => {
  it('follows the order aggregate: pay before work, start only after payment, deliver while working', () => {
    expect(Order.actions(order(), 's')).toEqual(['pay', 'cancel']);
    expect(Order.actions(order(), 't')).toEqual(['cancel']);
    expect(Order.actions(order({ paymentStatus: 1 }), 's')).toEqual([]);
    expect(Order.actions(order({ paymentStatus: 1 }), 't')).toEqual(['start']);
    expect(Order.actions(order({ status: 1, paymentStatus: 1 }), 't')).toEqual(['deliver']);
    expect(Order.actions(order({ status: 3, paymentStatus: 1 }), 't')).toEqual(['deliver']);
    expect(Order.actions(order({ status: 1, paymentStatus: 1 }), 's')).toEqual([]);
  });

  it('lets only the student decide on a delivery, within the revision allowance', () => {
    expect(Order.actions(order({ status: 2, paymentStatus: 1 }), 's')).toEqual(['revision', 'complete']);
    expect(Order.actions(order({ status: 2, paymentStatus: 1, revisionsUsed: 1 }), 's')).toEqual(['complete']);
    expect(Order.actions(order({ status: 2, paymentStatus: 1 }), 't')).toEqual([]);
  });

  it('offers a review only when the server says it can be submitted and none exists', () => {
    expect(Order.actions(order({ status: 4, paymentStatus: 1, reviewCanSubmit: true }), 's')).toEqual(['review']);
    expect(Order.actions(order({ status: 4, paymentStatus: 1, reviewCanSubmit: true, hasReview: true }), 's')).toEqual([]);
    expect(Order.actions(order({ status: 4, paymentStatus: 1 }), 's')).toEqual([]);
    expect(Order.actions(order({ status: 4, paymentStatus: 1, reviewCanSubmit: true }), 't')).toEqual([]);
  });

  it('gives a viewer who is neither participant nothing to do', () => {
    expect(Order.roleOf(order(), 'someone')).toBeNull();
    expect(Order.actions(order({ status: 2, paymentStatus: 1 }), 'someone')).toEqual([]);
    expect(Order.actions(order(), '')).toEqual([]);
  });
});

describe('order state wording', () => {
  it('distinguishes a paid order that has not started from one that still needs payment', () => {
    expect(orderStatusKey({ status: 0, paymentStatus: 0 })).toBe('order_status_payment_required');
    expect(orderStatusKey({ status: 0, paymentStatus: 1 })).toBe('order_status_payment_confirmed');
    expect(orderStatusKey({ status: 9, paymentStatus: 1 })).toBe('order_status_unknown');
  });

  it('never reports negative revisions left', () => {
    expect(Order.revisionsLeft({ revisionAllowance: 2, revisionsUsed: 1 })).toBe(1);
    expect(Order.revisionsLeft({ revisionAllowance: 1, revisionsUsed: 3 })).toBe(0);
  });
});

describe('Order.deliveryProblem', () => {
  it('checks count, type and size before an upload starts', () => {
    expect(Order.deliveryProblem([])).toBe('none');
    expect(Order.deliveryProblem(Array.from({ length: DELIVERY_LIMITS.files + 1 }, (_, i) => file(`${i}.pdf`, 'application/pdf')))).toBe('count');
    expect(Order.deliveryProblem([file('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')])).toBe('type');
    expect(Order.deliveryProblem([file('empty.pdf', 'application/pdf', 0)])).toBe('size');
    expect(Order.deliveryProblem([file('answers.pdf', 'application/pdf'), file('board.png', 'image/png')])).toBeNull();
  });
});

describe('Order.reviewProblems', () => {
  it('requires five ratings from 1 to 5 and a comment of at most 2000 characters', () => {
    expect(Order.reviewProblems(Order.emptyReview())).toEqual(['ratings', 'comment']);
    const rated = { ...Order.emptyReview(), explanationClarity: 5, subjectKnowledge: 4, communication: 5, onTimeDelivery: 4, valueForMoney: 5 };
    expect(Order.reviewProblems({ ...rated, comment: '  ' })).toEqual(['comment']);
    expect(Order.reviewProblems({ ...rated, comment: 'x'.repeat(2001) })).toEqual(['comment_too_long']);
    expect(Order.reviewProblems({ ...rated, valueForMoney: 6, comment: 'Clear.' })).toEqual(['ratings']);
    expect(Order.reviewProblems({ ...rated, comment: 'Clear.' })).toEqual([]);
  });
});
