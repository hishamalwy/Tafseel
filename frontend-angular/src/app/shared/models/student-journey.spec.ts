import { describe, expect, it } from 'vitest';
import {
  LEARNING_REQUEST_STATUS, SOURCING_OPEN_MARKETPLACE, StudentRequestRow,
  projectStudentJourney, requestStatusKey, reservationMinutes
} from './student-journey';

const NOW = Date.parse('2026-03-01T12:00:00Z');

function row(overrides: Partial<StudentRequestRow> = {}): StudentRequestRow {
  return {
    id: 'r1',
    title: 'Thermodynamics chapter 3',
    status: LEARNING_REQUEST_STATUS.OPEN_FOR_OFFERS,
    sourcingMode: SOURCING_OPEN_MARKETPLACE,
    offerCount: 0,
    paymentReservationExpiresAt: '',
    preferredDeliveryAt: '',
    teacherDisplayName: '',
    teacherDisplayNameEnglish: '',
    selectedOfferId: '',
    ...overrides
  };
}

describe('projectStudentJourney', () => {
  it('drops terminal states, which are history rather than journey position', () => {
    const journey = projectStudentJourney([
      row({ id: 'declined', status: LEARNING_REQUEST_STATUS.DECLINED }),
      row({ id: 'cancelled', status: LEARNING_REQUEST_STATUS.CANCELLED }),
      row({ id: 'expired', status: LEARNING_REQUEST_STATUS.EXPIRED }),
      row({ id: 'converted', status: LEARNING_REQUEST_STATUS.CONVERTED_TO_ORDER }),
      row({ id: 'live' })
    ], NOW);

    expect(journey.items.map(x => x.id)).toEqual(['live']);
    expect(journey.total).toBe(1);
  });

  it('orders by action value: pay, then offers waiting, then gathering, then rest', () => {
    const journey = projectStudentJourney([
      row({ id: 'direct', sourcingMode: 0, status: LEARNING_REQUEST_STATUS.ACCEPTED }),
      row({ id: 'gathering', offerCount: 0 }),
      row({ id: 'has-offers', offerCount: 3 }),
      row({
        id: 'pay',
        status: LEARNING_REQUEST_STATUS.AWAITING_PAYMENT,
        paymentReservationExpiresAt: new Date(NOW + 20 * 60000).toISOString()
      })
    ], NOW);

    expect(journey.items.map(x => x.id)).toEqual(['pay', 'has-offers', 'gathering', 'direct']);
  });

  it('promotes only a reservation that is still running', () => {
    const journey = projectStudentJourney([
      row({
        id: 'live-reservation',
        status: LEARNING_REQUEST_STATUS.AWAITING_PAYMENT,
        paymentReservationExpiresAt: new Date(NOW + 5 * 60000).toISOString()
      })
    ], NOW);

    expect(journey.actionRequired?.id).toBe('live-reservation');
    expect(journey.actionRequired?.reservationExpired).toBe(false);
  });

  it('reports an elapsed reservation as expired rather than as remaining urgency', () => {
    const journey = projectStudentJourney([
      row({
        id: 'stale',
        status: LEARNING_REQUEST_STATUS.AWAITING_PAYMENT,
        paymentReservationExpiresAt: new Date(NOW - 60000).toISOString()
      })
    ], NOW);

    expect(journey.items[0]!.reservationExpired).toBe(true);
    // Expired means there is nothing to pay in time, so nothing is promoted.
    expect(journey.actionRequired).toBeNull();
  });

  it('carries no reservation clock for a request that is not awaiting payment', () => {
    const journey = projectStudentJourney([
      row({ paymentReservationExpiresAt: new Date(NOW + 60000).toISOString() })
    ], NOW);

    expect(journey.items[0]!.reservationMsRemaining).toBeNull();
    expect(journey.items[0]!.reservationExpired).toBe(false);
  });

  it('distinguishes open-marketplace sourcing from a direct request', () => {
    const journey = projectStudentJourney([
      row({ id: 'open', sourcingMode: SOURCING_OPEN_MARKETPLACE }),
      row({ id: 'direct', sourcingMode: 0, status: LEARNING_REQUEST_STATUS.ACCEPTED })
    ], NOW);

    expect(journey.items.find(x => x.id === 'open')!.sourcingKey).toBe('sd_sourcing_open');
    expect(journey.items.find(x => x.id === 'direct')!.sourcingKey).toBe('sd_sourcing_direct');
  });

  it('falls back to the English teacher name only when the primary one is missing', () => {
    const journey = projectStudentJourney([
      row({ teacherDisplayName: '', teacherDisplayNameEnglish: 'Sara Aldosari' })
    ], NOW);

    expect(journey.items[0]!.teacher).toBe('Sara Aldosari');
  });
});

describe('reservationMinutes', () => {
  it('rounds up, and never below one, so a live reservation never reads as zero', () => {
    const journey = projectStudentJourney([
      row({
        status: LEARNING_REQUEST_STATUS.AWAITING_PAYMENT,
        paymentReservationExpiresAt: new Date(NOW + 1500).toISOString()
      })
    ], NOW);

    expect(reservationMinutes(journey.items[0]!)).toBe(1);
  });

  it('is null when there is no reservation at all', () => {
    const journey = projectStudentJourney([row()], NOW);
    expect(reservationMinutes(journey.items[0]!)).toBeNull();
  });
});

describe('requestStatusKey', () => {
  it('maps each lifecycle status to its own translation key', () => {
    expect(requestStatusKey(LEARNING_REQUEST_STATUS.OPEN_FOR_OFFERS))
      .toBe('req_status_open_for_offers');
    expect(requestStatusKey(LEARNING_REQUEST_STATUS.AWAITING_PAYMENT))
      .toBe('req_status_awaiting_payment');
  });

  it('answers a safe key for a status this build does not know', () => {
    expect(requestStatusKey(99)).toBe('req_status_unknown');
  });
});
