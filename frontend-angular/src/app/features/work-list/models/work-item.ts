/**
 * One list of everything a person has going on (UX-03): requests, orders and live sessions together,
 * filtered by what the item needs rather than by which table it came from.
 *
 * The three lists were three destinations, and the same order appeared in two of them. Here each item
 * keeps its own screen and its own `UX-04` words; this file only decides which chip it belongs under.
 */
export type Chip = 'all' | 'action' | 'active' | 'finished';

export type Row = Record<string, unknown>;

export const CHIPS: readonly Chip[] = ['all', 'action', 'active', 'finished'];

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const at = (value: unknown): number => Date.parse(String(value ?? ''));

/** Requests, orders and sessions that are over: nothing is expected of anyone. */
function finished(source: string, row: Row, viewer: 'student' | 'teacher'): boolean {
  const status = num(row['status']);
  if (source.startsWith('/learning-requests')) return status === 3 || status === 4 || status === 7 || status === 8;
  if (source.startsWith('/orders')) return status === 4 || status === 5;
  if (source.startsWith('/live-sessions')) return status === 2 || status === 3 || status === 4 || status === 5;
  return viewer === 'student' && status === null;
}

/**
 * Whether this item is waiting for *this* viewer. The rules are the ones the homes already use
 * (`UX-01` A1–A12 for the student, `UX-02` T1–T9 for the teacher), read from the same server states.
 */
function needsAction(source: string, row: Row, viewer: 'student' | 'teacher', now: number): boolean {
  const status = num(row['status']);
  const payment = num(row['paymentStatus']);
  if (source.startsWith('/learning-requests')) {
    if (viewer === 'teacher') return status === 0;
    if (status === 1) return true;                                            // the teacher asked a question
    if (status === 5 && (num(row['offerCount']) ?? 0) > 0) return true;        // offers waiting to be compared
    return status === 6 && at(row['paymentReservationExpiresAt']) > now;       // a hold worth paying
  }
  if (source.startsWith('/orders')) {
    if (viewer === 'student')
      return (status === 0 && payment === 0) || status === 2
        || (status === 4 && row['reviewCanSubmit'] === true && row['hasReview'] !== true)
        || row['canReportNonDelivery'] === true;
    return (status === 0 && payment === 1) || status === 3 || (status === 1 && row['isOverdue'] === true);
  }
  if (source.startsWith('/live-sessions')) {
    if (status === 0) return viewer === 'student';
    if (status === 6) return viewer === 'student';
    if (status === 7) return viewer === 'student';
    if (status === 8) return viewer === 'teacher';
    const ends = at(row['endsAt']);
    const starts = at(row['startsAt']);
    const window = 15 * 60_000;
    if (status === 1 && !Number.isNaN(starts) && !Number.isNaN(ends)) {
      if (now >= starts - window && now <= ends + window) return true;         // on now, for both
      if (viewer === 'teacher' && now > ends + window) return true;            // the teacher confirms what happened
    }
    return false;
  }
  return false;
}

/**
 * Which chip an item belongs under; every item has exactly one. What still wants something from this
 * viewer is asked about first: a completed order whose review has not been written is not finished
 * business, it is the last thing the student was asked for (`UX-01` A12).
 */
export function chipOf(row: Row, viewer: 'student' | 'teacher', now = Date.now()): Exclude<Chip, 'all'> {
  const source = String(row['_source'] ?? '').split('?')[0];
  if (needsAction(source, row, viewer, now)) return 'action';
  return finished(source, row, viewer) ? 'finished' : 'active';
}

/** Newest first; an item that needs the viewer is never buried under one that does not. */
export function sortItems(rows: readonly Row[], viewer: 'student' | 'teacher', now = Date.now()): readonly Row[] {
  const rank = (row: Row) => (chipOf(row, viewer, now) === 'action' ? 0 : 1);
  const when = (row: Row) => at(row['createdAt']) || at(row['startsAt']) || 0;
  return [...rows].sort((a, b) => rank(a) - rank(b) || when(b) - when(a));
}

/**
 * A request that became an order is the order from then on. Listing both showed the same job twice —
 * "Accepted — order created" next to the order itself — and left people unsure which one to open.
 * The request stays reachable from the order ("View the original request").
 */
export function withoutConvertedRequests(rows: readonly Row[]): readonly Row[] {
  const ordered = new Set(rows
    .filter(row => String(row['_source'] ?? '').startsWith('/orders') && row['learningRequestId'])
    .map(row => String(row['learningRequestId'])));
  return rows.filter(row => !(String(row['_source'] ?? '').startsWith('/learning-requests')
    && (row['status'] === 2 || row['status'] === 7) && ordered.has(String(row['id']))));
}

export function filterItems(
  rows: readonly Row[], chip: Chip, viewer: 'student' | 'teacher', now = Date.now()
): readonly Row[] {
  const sorted = sortItems(withoutConvertedRequests(rows), viewer, now);
  return chip === 'all' ? sorted : sorted.filter(row => chipOf(row, viewer, now) === chip);
}

/** An unknown or missing chip in a link is treated as "All". */
export function chipFrom(value: unknown): Chip {
  const chip = String(value ?? '').toLowerCase();
  return (CHIPS as readonly string[]).includes(chip) ? chip as Chip : 'all';
}
