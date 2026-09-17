import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  CatalogOption, Demand, LearningRequest, Offer, OfferDraft, OpenRequest, OpenRequestDraft, SOURCING
} from '../models/demand';
import { DEMAND_GATEWAY, OrderRef } from './demand.ports';

/** A form the page let through that the rules refuse; nothing was sent. */
export class DraftInvalid<P> extends Error {
  constructor(readonly problems: P) { super('The form has problems.'); }
}

/** The offer or request changed since it was read (409 on selection). */
export class OfferChanged extends Error {
  constructor() { super('The offer changed.'); }
}

export interface OpenRequestForm {
  readonly subjects: readonly CatalogOption[];
  readonly serviceTypes: readonly CatalogOption[];
}

@Injectable()
export class LoadOpenRequestForm {
  private readonly gateway = inject(DEMAND_GATEWAY);

  async execute(): Promise<OpenRequestForm> {
    const [subjects, serviceTypes] = await Promise.all([
      firstValueFrom(this.gateway.subjects()), firstValueFrom(this.gateway.openServiceTypes())
    ]);
    return { subjects, serviceTypes };
  }
}

@Injectable()
export class PublishOpenRequest {
  private readonly gateway = inject(DEMAND_GATEWAY);

  execute(draft: OpenRequestDraft, now = Date.now()): Promise<OpenRequest> {
    const problems = Demand.openProblems(draft, now);
    if (Object.keys(problems).length) return Promise.reject(new DraftInvalid(problems));
    return firstValueFrom(this.gateway.publish(Demand.openInput(draft)));
  }
}

export interface RequestView {
  readonly request: LearningRequest;
  /** For an open request, the marketplace view with offer count and reservation. */
  readonly open: OpenRequest | null;
  /** The order this request became, when it became one. */
  readonly orderId: string;
  /** That order's money, so the student can be shown what was agreed beside what they were quoted. */
  readonly order: OrderRef | null;
}

/** A request for its own student or assigned teacher, with its open-marketplace state and order. */
@Injectable()
export class LoadRequest {
  private readonly gateway = inject(DEMAND_GATEWAY);

  async execute(id: string, viewerId: string): Promise<RequestView> {
    const request = await firstValueFrom(this.gateway.request(id));
    const isStudent = request.studentId === viewerId;
    const [open, orders] = await Promise.all([
      request.sourcing === SOURCING.OPEN && isStudent ? firstValueFrom(this.gateway.openRequest(id)) : Promise.resolve(null),
      Demand.hasOrder(request.status) ? firstValueFrom(this.gateway.orders(!isStudent)) : Promise.resolve([])
    ]);
    const order = orders.find(o => o.learningRequestId === request.id) ?? null;
    return { request, open, orderId: order?.id ?? '', order };
  }
}

@Injectable()
export class ManageRequest {
  private readonly gateway = inject(DEMAND_GATEWAY);

  cancel(request: LearningRequest): Promise<void> {
    return firstValueFrom(this.gateway.cancel(request.id, request.version));
  }

  reply(request: LearningRequest, message: string): Promise<void> {
    return this.message(message, text => this.gateway.replyToClarification(request.id, text, request.version));
  }

  askClarification(request: LearningRequest, message: string): Promise<void> {
    return this.message(message, text => this.gateway.requestClarification(request.id, text, request.version));
  }

  decline(request: LearningRequest, reason: string): Promise<void> {
    return this.message(reason, text => this.gateway.decline(request.id, text, request.version));
  }

  private message(value: string, send: (text: string) => import('rxjs').Observable<void>): Promise<void> {
    const text = value.trim();
    if (!text || text.length > 2000) return Promise.reject(new DraftInvalid({ message: text ? 'too_long' : 'required' }));
    return firstValueFrom(send(text));
  }
}

export interface OffersView {
  readonly request: OpenRequest;
  readonly offers: readonly Offer[];
}

@Injectable()
export class LoadOffers {
  private readonly gateway = inject(DEMAND_GATEWAY);

  async execute(requestId: string): Promise<OffersView> {
    const [request, offers] = await Promise.all([
      firstValueFrom(this.gateway.openRequest(requestId)), firstValueFrom(this.gateway.offers(requestId))
    ]);
    return { request, offers };
  }
}

/**
 * Selecting reserves the request for payment of that offer; it does not create an order. Both
 * versions come from the last read, so an offer changed in the meantime is refused (409), and the
 * student is shown the new terms before they can select again.
 */
@Injectable()
export class SelectOffer {
  private readonly gateway = inject(DEMAND_GATEWAY);

  async execute(request: OpenRequest, offer: Offer): Promise<void> {
    try {
      await firstValueFrom(this.gateway.selectOffer(request, offer));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) throw new OfferChanged();
      throw error;
    }
  }

  cancel(request: OpenRequest): Promise<void> {
    return firstValueFrom(this.gateway.cancelSelection(request));
  }
}

@Injectable()
export class LoadOpportunity {
  private readonly gateway = inject(DEMAND_GATEWAY);

  execute(requestId: string): Promise<OpenRequest> {
    return firstValueFrom(this.gateway.opportunity(requestId));
  }
}

/** A teacher's offer: submitted once, changed or withdrawn while it is still only submitted. */
@Injectable()
export class ManageOffer {
  private readonly gateway = inject(DEMAND_GATEWAY);

  async save(requestId: string, current: Offer | null, draft: OfferDraft): Promise<Offer> {
    const problems = Demand.offerProblems(draft);
    if (Object.keys(problems).length) throw new DraftInvalid(problems);
    const input = Demand.offerInput(draft);
    return current && Demand.canEditOffer(current)
      ? firstValueFrom(this.gateway.updateOffer(current, input))
      : firstValueFrom(this.gateway.submitOffer(requestId, input));
  }

  withdraw(offer: Offer): Promise<void> {
    return firstValueFrom(this.gateway.withdrawOffer(offer));
  }
}
