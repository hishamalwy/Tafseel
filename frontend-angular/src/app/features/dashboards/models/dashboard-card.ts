/**
 * What a Student or Teacher dashboard card shows, per list it came from (UX-04).
 *
 * The generic dashboard used to print every row the same way: `row.status` as a badge (so
 * `0`, `1`, `2`), a title that fell back to an id or an email, and a field list of
 * "Currency", "Updated", "Total" and "Count". Here each source has a card with a product status
 * (`shared/vocabulary/status-vocabulary`), at most a few labelled facts, and one call to action.
 * A row this file does not recognise gets a safe title and nothing else; reference rows that are
 * not work (the languages list) are not shown.
 *
 * Pure: the page passes a formatter, so the same code is tested in Arabic and English.
 */
import {
  ACTIONS, LATE_BADGE, Label, NOTIFICATION_UNKNOWN, StatusView, Tone, Viewer, conversationScope,
  disputeStatus, notificationCopy, orderStatus, payoutStatus, qualificationState,
  requestStatus, rescheduleBadge, sessionStatus, withdrawalStatus
} from '@shared/vocabulary/status-vocabulary';

export interface CardFormat {
  readonly lang: 'ar' | 'en';
  t(key: string, fallback: string): string;
  format(key: string, values: Readonly<Record<string, string | number>>, fallback: string): string;
  /** Plain-text money: `150 ⃁`. */
  money(value: unknown, currency?: unknown): string;
  /** Date and time in the viewer's zone. */
  date(value: unknown): string;
  /** "2 hours ago" under a day, otherwise a date. */
  relative(value: unknown): string;
}

export interface CardBadge { readonly text: string; readonly tone: Tone }
export interface CardField { readonly label: string; readonly value: string }

export interface DashboardCardView {
  readonly title: string;
  readonly badges: readonly CardBadge[];
  readonly secondary: string;
  readonly fields: readonly CardField[];
  /** The text of the card's single link to its own screen. */
  readonly action: string;
  /** Notification body, only where it is in the reader's language. */
  readonly body: string;
}

export interface CardContext {
  readonly viewer: Viewer;
  readonly viewerId: string;
  readonly now: number;
  readonly fmt: CardFormat;
}

type Row = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const L = (labelKey: string, fallback: string): Label => ({ labelKey, fallback });

const LABELS = {
  untitledRequest: L('card_untitled_request', 'Untitled request'),
  untitledOrder: L('card_untitled_order', 'Untitled order'),
  untitledSession: L('card_untitled_session', 'Live session'),
  untitled: L('card_untitled', 'Untitled'),
  teacher: L('demand_teacher', 'Teacher'),
  student: L('demand_student', 'Student'),
  sent: L('card_field_sent', 'Sent'),
  budget: L('card_field_budget', 'Budget'),
  flexibleBudget: L('card_budget_flexible', 'Flexible budget'),
  amountDue: L('card_field_amount', 'Amount'),
  teacherNet: L('card_field_teacher_net', 'Your net earnings'),
  agreedDelivery: L('card_field_agreed_delivery', 'Agreed delivery'),
  when: L('card_field_when', 'When'),
  duration: L('card_field_duration', 'Duration'),
  deadline: L('card_field_deadline', 'Deadline'),
  offerSent: L('card_offer_sent', 'You sent an offer'),
  unread: L('card_field_unread', 'Unread'),
  rating: L('card_field_rating', 'Rating'),
  startingPrice: L('card_field_starting_price', 'From'),
  eligibleUntil: L('card_field_eligible_until', 'You can raise an objection until'),
  opened: L('card_field_opened', 'Opened'),
  disputeOrder: L('card_dispute_order', 'Objection about an order'),
  disputeSession: L('card_dispute_session', 'Objection about a live session'),
  balanceTitle: L('card_balance_title', 'Your balance'),
  available: L('earn_available', 'Available to withdraw'),
  clearing: L('earn_clearing', 'Clearing'),
  transferring: L('earn_transferring', 'Being transferred'),
  nextAvailable: L('card_field_next_available', 'Next amount available'),
  requested: L('card_field_requested', 'Requested'),
  payoutTitle: L('card_payout_title', 'Payout details'),
  policyTitle: L('card_withdrawal_policy_title', 'Withdrawals'),
  minimum: L('card_field_minimum_withdrawal', 'Minimum withdrawal'),
  settlement: L('card_field_settlement', 'Usually arrives within'),
  summaryTitle: L('card_summary_title', 'Your work at a glance'),
  newRequests: L('card_field_new_requests', 'New requests'),
  activeOrders: L('card_field_active_orders', 'Orders in progress'),
  activeSessions: L('card_field_active_sessions', 'Upcoming live sessions'),
  unreadMessages: L('card_field_unread_messages', 'Unread messages'),
  analyticsTitle: L('card_analytics_title', 'Your performance'),
  offersSent: L('card_field_offers_sent', 'Offers sent'),
  offersChosen: L('card_field_offers_chosen', 'Offers chosen'),
  ordersCompleted: L('card_field_orders_completed', 'Orders completed'),
  sessionsCompleted: L('card_field_sessions_completed', 'Live sessions completed'),
  netEarnings: L('card_field_net_earnings', 'Net earnings'),
  repeatStudents: L('card_field_repeat_students', 'Returning students'),
  approvedOn: L('card_field_approved_on', 'Approved on'),
  ratingTitle: L('card_rating_title', 'Your rating'),
  reviewCount: L('card_field_review_count', 'Reviews'),
  notificationsTitle: L('card_notification_prefs_title', 'Notifications'),
  inApp: L('card_field_in_app', 'In Tafseel'),
  email: L('card_field_email', 'Email'),
  on: L('card_value_on', 'On'),
  off: L('card_value_off', 'Off'),
  learningTitle: L('card_learning_prefs_title', 'Learning preferences'),
  teachingLanguage: L('card_field_teaching_language', 'Preferred teaching language'),
  notSet: L('card_value_not_set', 'Not set'),
  signInTitle: L('card_sign_in_title', 'Signed-in device'),
  thisDevice: L('card_this_device', 'This device'),
  signedIn: L('card_field_signed_in', 'Signed in'),
  expires: L('card_field_expires', 'Expires')
} as const satisfies Record<string, Label>;

const FORMATS = {
  openRequestOffers: L('card_open_request_offers', 'Open request · {n} offers'),
  minutes: L('card_minutes', '{n} min'),
  businessDays: L('card_business_days', '{n} business days'),
  ratingValue: L('card_rating_value', '{rating} ({count})'),
  ofTotal: L('card_of_total', '{done} of {total}')
} as const satisfies Record<string, Label>;

/** Sources whose rows are reference data, not something to act on. */
const HIDDEN_SOURCES = new Set(['/languages']);

export function presentCard(row: Row, context: CardContext): DashboardCardView | null {
  const source = str(row['_source']).split('?')[0];
  if (HIDDEN_SOURCES.has(source)) return null;
  const p = new Presenter(row, context);
  switch (source) {
    case '/learning-requests/mine': case '/learning-requests/assigned': return p.request();
    case '/orders/mine': case '/orders/assigned': return p.order();
    case '/live-sessions/mine': return p.session();
    case '/open-marketplace/opportunities': return p.opportunity();
    case '/notifications': return p.notification();
    case '/conversations': return p.conversation();
    case '/favorite-teachers': return p.favorite();
    case '/disputes/eligible': return p.eligibleDispute();
    case '/disputes/mine': return p.dispute();
    case '/withdrawals/balances': return p.balance();
    case '/withdrawals/mine': return p.withdrawal();
    case '/withdrawals/profile': return p.payoutProfile();
    case '/withdrawals/policy': return p.withdrawalPolicy();
    case '/teachers/me/business/home-summary': return p.homeSummary();
    case '/teachers/me/business/analytics': return p.analytics();
    case '/teachers/me/qualifications': return p.qualification();
    case '/teachers/me': return p.rating();
    case '/notification-preferences': return p.notificationPreferences();
    case '/students/me/learning-preferences': return p.learningPreferences();
    case '/auth/sessions': return p.signInSession();
    default: return p.generic();
  }
}

class Presenter {
  private readonly fmt: CardFormat;
  private readonly student: boolean;

  constructor(private readonly row: Row, private readonly context: CardContext) {
    this.fmt = context.fmt;
    this.student = context.viewer === 'student';
  }

  // ---- work ----

  request(): DashboardCardView {
    const r = this.row;
    const status = requestStatus(r['status'], this.context.viewer, num(r['offerCount']));
    const open = r['sourcingMode'] === 1;
    const secondary = open
      ? this.fmt.format(FORMATS.openRequestOffers.labelKey, { n: num(r['offerCount']) ?? 0 }, FORMATS.openRequestOffers.fallback)
      : this.party(this.student ? 'teacher' : 'student');
    const budget = num(r['budget']);
    return this.card({
      title: str(r['title']) || this.serviceName() || this.text(LABELS.untitledRequest),
      badges: [this.badge(status)],
      secondary: [secondary, this.serviceName()].filter(Boolean).join(' · '),
      fields: [
        this.field(LABELS.sent, this.fmt.relative(r['createdAt'])),
        this.field(LABELS.budget, budget !== null ? this.fmt.money(budget) : this.text(LABELS.flexibleBudget))
      ],
      action: status.action
    });
  }

  order(): DashboardCardView {
    const r = this.row;
    const status = orderStatus(r['status'], r['paymentStatus'], this.context.viewer, {
      isOverdue: r['isOverdue'] === true, reviewCanSubmit: r['reviewCanSubmit'] === true, hasReview: r['hasReview'] === true
    });
    const badges = [this.badge(status)];
    if (r['isOverdue'] === true) badges.push(this.badge(LATE_BADGE));
    const fields: (CardField | null)[] = [];
    if (this.student && r['status'] === 0 && r['paymentStatus'] === 0)
      fields.push(this.field(LABELS.amountDue, this.fmt.money(r['studentTotal'], r['currency'])));
    if (!this.student && num(r['teacherNet']) !== null)
      fields.push(this.field(LABELS.teacherNet, this.fmt.money(r['teacherNet'], r['currency'])));
    if (r['status'] === 1 || r['status'] === 3)
      fields.push(this.field(LABELS.agreedDelivery, this.fmt.date(r['agreedDeliveryAt'])));
    return this.card({
      title: str(r['requestTitle']) || this.serviceName() || this.text(LABELS.untitledOrder),
      badges,
      secondary: [this.party(this.student ? 'teacher' : 'student'), this.serviceName()].filter(Boolean).join(' · '),
      fields,
      action: status.action
    });
  }

  session(): DashboardCardView {
    const r = this.row;
    const status = sessionStatus(r['status'], this.context.viewer, { startsAt: r['startsAt'], endsAt: r['endsAt'], now: this.context.now });
    const reschedule = rescheduleBadge(r['proposedStartsAt'], r['rescheduleRequestedById'], this.context.viewerId, r['status']);
    const badges = [this.badge(status)];
    if (reschedule) badges.push(this.badge(reschedule));
    const starts = Date.parse(str(r['startsAt'])), ends = Date.parse(str(r['endsAt']));
    const minutes = Number.isNaN(starts) || Number.isNaN(ends) ? null : Math.round((ends - starts) / 60_000);
    return this.card({
      title: str(r['title']) || this.serviceName() || this.text(LABELS.untitledSession),
      badges,
      secondary: [this.party(this.student ? 'teacher' : 'student'), this.serviceName()].filter(Boolean).join(' · '),
      fields: [
        this.field(LABELS.when, this.fmt.date(r['startsAt'])),
        minutes && minutes > 0 ? this.field(LABELS.duration, this.fmt.format(FORMATS.minutes.labelKey, { n: minutes }, FORMATS.minutes.fallback)) : null
      ],
      action: status.action ?? reschedule?.action
    });
  }

  opportunity(): DashboardCardView {
    const r = this.row;
    const mine = r['myOffer'] && typeof r['myOffer'] === 'object';
    const status = requestStatus(r['status'], 'teacher');
    const badges = [this.badge(status)];
    if (mine) badges.push({ text: this.text(LABELS.offerSent), tone: 'info' });
    const min = num(r['budgetMin']), max = num(r['budgetMax']);
    const subject = this.fmt.lang === 'ar' ? str(r['subjectNameArabic']) || str(r['subjectName']) : str(r['subjectName']);
    const service = this.fmt.lang === 'ar' ? str(r['serviceNameArabic']) || str(r['serviceName']) : str(r['serviceName']);
    return this.card({
      title: str(r['title']) || this.text(LABELS.untitledRequest),
      badges,
      secondary: [service, subject].filter(Boolean).join(' · '),
      fields: [
        this.field(LABELS.deadline, this.fmt.date(r['deadline'])),
        this.field(LABELS.budget, min !== null && max !== null
          ? `${this.fmt.money(min, r['currency'])} – ${this.fmt.money(max, r['currency'])}`
          : this.text(LABELS.flexibleBudget))
      ],
      action: mine ? undefined : status.action
    });
  }

  notification(): DashboardCardView {
    const r = this.row;
    const copy = notificationCopy(r['type']);
    const serverTitle = str(r['title']);
    const title = copy
      ? this.text(copy)
      : this.fmt.lang === 'en' && serverTitle ? serverTitle : this.text(NOTIFICATION_UNKNOWN);
    return {
      title,
      badges: [],
      secondary: this.fmt.relative(r['createdAt']),
      fields: [],
      action: this.text(ACTIONS.open),
      // The server writes notification text in English; an Arabic reader gets the product sentence only.
      body: this.fmt.lang === 'en' ? str(r['body']) : ''
    };
  }

  conversation(): DashboardCardView {
    const r = this.row;
    const participants = Array.isArray(r['participants']) ? r['participants'] as Row[] : [];
    const other = participants.find(x => x && x['userId'] !== this.context.viewerId);
    const name = other ? this.pickName(other['displayName'], other['displayNameEnglish']) : '';
    const unread = num(r['unreadCount']) ?? 0;
    return this.card({
      title: name || this.text(conversationScope(r['scope'])),
      badges: [],
      secondary: this.text(conversationScope(r['scope'])),
      fields: [unread > 0 ? this.field(LABELS.unread, String(unread)) : null]
    });
  }

  favorite(): DashboardCardView {
    const r = this.row;
    const rating = num(r['rating']);
    const price = num(r['startingPrice']);
    return this.card({
      title: this.pickName(r['fullName'], r['fullNameEnglish']) || this.text(LABELS.teacher),
      badges: [],
      secondary: str(r['headline']),
      fields: [
        rating !== null ? this.field(LABELS.rating, this.fmt.format(FORMATS.ratingValue.labelKey,
          { rating: rating.toFixed(1), count: num(r['ratingCount']) ?? 0 }, FORMATS.ratingValue.fallback)) : null,
        price !== null ? this.field(LABELS.startingPrice, this.fmt.money(price, r['currency'])) : null
      ]
    });
  }

  eligibleDispute(): DashboardCardView {
    const r = this.row;
    return this.card({
      title: (this.fmt.lang === 'ar' ? str(r['titleArabic']) || str(r['title']) : str(r['title'])) || this.text(LABELS.untitled),
      badges: [],
      secondary: this.pickName(r['otherPartyName'], r['otherPartyNameEnglish']),
      fields: [
        this.field(LABELS.amountDue, this.fmt.money(r['amount'], r['currency'])),
        this.field(LABELS.eligibleUntil, this.fmt.date(r['eligibleUntil']))
      ]
    });
  }

  dispute(): DashboardCardView {
    const r = this.row;
    return this.card({
      title: this.text(r['liveSessionBookingId'] ? LABELS.disputeSession : LABELS.disputeOrder),
      badges: [this.badge(disputeStatus(r['status']))],
      secondary: '',
      fields: [this.field(LABELS.opened, this.fmt.relative(r['createdAt']))]
    });
  }

  // ---- money ----

  balance(): DashboardCardView {
    const r = this.row;
    const next = str(r['nextClearanceAt']);
    return this.card({
      title: this.text(LABELS.balanceTitle),
      badges: [],
      secondary: '',
      fields: [
        this.field(LABELS.available, this.fmt.money(r['available'], r['currency'])),
        this.field(LABELS.clearing, this.fmt.money(r['pendingClearance'] ?? 0, r['currency'])),
        (num(r['pendingWithdrawal']) ?? 0) > 0 ? this.field(LABELS.transferring, this.fmt.money(r['pendingWithdrawal'], r['currency'])) : null,
        next ? this.field(LABELS.nextAvailable, this.fmt.date(next)) : null
      ]
    });
  }

  withdrawal(): DashboardCardView {
    const r = this.row;
    return this.card({
      title: this.fmt.money(r['amount'], r['currency']),
      badges: [this.badge(withdrawalStatus(r['status']))],
      secondary: str(r['rejectionReason']),
      fields: [this.field(LABELS.requested, this.fmt.relative(r['createdAt']))]
    });
  }

  payoutProfile(): DashboardCardView {
    const r = this.row;
    return this.card({
      title: this.text(LABELS.payoutTitle),
      badges: [this.badge(payoutStatus(r['status']))],
      secondary: [str(r['destinationLabel']), str(r['rejectionReason'])].filter(Boolean).join(' · '),
      fields: []
    });
  }

  withdrawalPolicy(): DashboardCardView {
    const r = this.row;
    const days = num(r['expectedSettlementBusinessDays']);
    return this.card({
      title: this.text(LABELS.policyTitle),
      badges: [],
      secondary: '',
      fields: [
        this.field(LABELS.minimum, this.fmt.money(r['minimumAmount'], r['currency'])),
        days !== null ? this.field(LABELS.settlement, this.fmt.format(FORMATS.businessDays.labelKey, { n: days }, FORMATS.businessDays.fallback)) : null
      ]
    });
  }

  // ---- teacher business and setup ----

  homeSummary(): DashboardCardView {
    const r = this.row;
    const count = (key: string) => String(num(r[key]) ?? 0);
    return this.card({
      title: this.text(LABELS.summaryTitle),
      badges: [],
      secondary: '',
      fields: [
        this.field(LABELS.newRequests, count('directRequests')),
        this.field(LABELS.activeOrders, count('activeOrders')),
        this.field(LABELS.activeSessions, count('activeSessions')),
        this.field(LABELS.unreadMessages, count('unreadMessages'))
      ]
    });
  }

  analytics(): DashboardCardView {
    const r = this.row;
    const of = (done: string, total: string) => this.fmt.format(FORMATS.ofTotal.labelKey,
      { done: num(r[done]) ?? 0, total: num(r[total]) ?? 0 }, FORMATS.ofTotal.fallback);
    return this.card({
      title: this.text(LABELS.analyticsTitle),
      badges: [],
      secondary: '',
      fields: [
        this.field(LABELS.offersSent, String(num(r['offersSubmitted']) ?? 0)),
        this.field(LABELS.offersChosen, String(num(r['offersSelected']) ?? 0)),
        this.field(LABELS.ordersCompleted, of('ordersCompleted', 'ordersTotal')),
        this.field(LABELS.sessionsCompleted, of('sessionsCompleted', 'sessionsTotal')),
        this.field(LABELS.netEarnings, this.fmt.money(r['netEarnings'])),
        this.field(LABELS.repeatStudents, String(num(r['repeatStudents']) ?? 0))
      ]
    });
  }

  qualification(): DashboardCardView {
    const r = this.row;
    const status = qualificationState(r['state']);
    const approved = str(r['approvedAt']);
    return this.card({
      title: this.pickName(r['subjectNameAr'], r['subjectName'], true) || this.text(LABELS.untitled),
      badges: [this.badge(status)],
      secondary: '',
      fields: [approved ? this.field(LABELS.approvedOn, this.fmt.date(approved)) : null]
    });
  }

  rating(): DashboardCardView {
    const r = this.row;
    const rating = num(r['rating']);
    return this.card({
      title: this.text(LABELS.ratingTitle),
      badges: [],
      secondary: '',
      fields: [
        this.field(LABELS.rating, rating !== null ? rating.toFixed(1) : this.text(LABELS.notSet)),
        this.field(LABELS.reviewCount, String(num(r['ratingCount']) ?? 0))
      ]
    });
  }

  // ---- account ----

  notificationPreferences(): DashboardCardView {
    const r = this.row;
    const onOff = (value: unknown) => this.text(value ? LABELS.on : LABELS.off);
    return this.card({
      title: this.text(LABELS.notificationsTitle),
      badges: [],
      secondary: '',
      fields: [this.field(LABELS.inApp, onOff(r['inAppEnabled'])), this.field(LABELS.email, onOff(r['emailEnabled']))]
    });
  }

  learningPreferences(): DashboardCardView {
    const language = this.row['preferredTeachingLanguage'] as Row | null | undefined;
    const name = language ? this.pickName(language['nameAr'], language['name'], true) : '';
    return this.card({
      title: this.text(LABELS.learningTitle),
      badges: [],
      secondary: '',
      fields: [this.field(LABELS.teachingLanguage, name || this.text(LABELS.notSet))]
    });
  }

  signInSession(): DashboardCardView {
    const r = this.row;
    return this.card({
      title: this.text(r['isCurrent'] ? LABELS.thisDevice : LABELS.signInTitle),
      badges: [],
      secondary: '',
      fields: [this.field(LABELS.signedIn, this.fmt.date(r['createdAt'])), this.field(LABELS.expires, this.fmt.date(r['expiresAt']))]
    });
  }

  /** A row from a source with no card of its own: a readable title if it has one, and nothing raw. */
  generic(): DashboardCardView {
    const r = this.row;
    const nested = r['currentVersion'] as Row | undefined;
    return this.card({
      title: str(r['title']) || str(nested?.['title']) || this.pickName(r['name'], r['fullName']) || str(r['subjectName']) || this.text(LABELS.untitled),
      badges: [],
      secondary: '',
      fields: []
    });
  }

  // ---- helpers ----

  private card(parts: { title: string; badges: CardBadge[]; secondary: string; fields: (CardField | null)[]; action?: Label | undefined }): DashboardCardView {
    return {
      title: parts.title,
      badges: parts.badges,
      secondary: parts.secondary,
      fields: parts.fields.filter((f): f is CardField => !!f && !!f.value),
      action: this.text(parts.action ?? ACTIONS.open),
      body: ''
    };
  }

  private text(label: Label): string { return this.fmt.t(label.labelKey, label.fallback); }
  private badge(status: StatusView): CardBadge { return { text: this.text(status), tone: status.tone }; }
  private field(label: Label, value: string): CardField { return { label: this.text(label), value }; }

  private serviceName(): string {
    const r = this.row;
    return this.fmt.lang === 'ar'
      ? str(r['serviceNameArabic']) || str(r['serviceNameEnglish'])
      : str(r['serviceNameEnglish']) || str(r['serviceNameArabic']);
  }

  private party(role: 'student' | 'teacher'): string {
    const r = this.row;
    const name = this.pickName(r[`${role}DisplayName`], r[`${role}DisplayNameEnglish`]);
    return name || this.text(role === 'teacher' ? LABELS.teacher : LABELS.student);
  }

  /** The name in the reader's language when there is one. `arabicFirst` says the first value is the Arabic one. */
  private pickName(primary: unknown, secondary: unknown, arabicFirst = false): string {
    const a = str(primary), b = str(secondary);
    if (arabicFirst) return this.fmt.lang === 'ar' ? a || b : b || a;
    // `primary` is the name as written (often Arabic); `secondary` its English form.
    return this.fmt.lang === 'en' ? b || a : a || b;
  }
}
