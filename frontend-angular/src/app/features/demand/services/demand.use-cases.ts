import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, from } from 'rxjs';
import {
  CatalogOption, Demand, LearningRequest, Offer, OfferDraft, OpenRequest, OpenRequestDraft, SOURCING, MyOffer, OfferTerms, FileRefusal, SavedOpenDraft
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

  execute(draft: OpenRequestDraft, draftId: string | null = null, now = Date.now()): Promise<OpenRequest> {
    const problems = Demand.openProblems(draft, now);
    if (Object.keys(problems).length) return Promise.reject(new DraftInvalid(problems));
    return firstValueFrom(this.gateway.publish(Demand.openInput(draft, draftId)));
  }
}

/** A file the browser refused before sending it, with the reason in the model's words. */
export class FileRefused extends Error {
  constructor(readonly file: File, readonly reason: FileRefusal) { super(reason); }
}

/**
 * Upload first (Product Contract §7a): the student's own draft on the server. A file is checked here, then
 * uploaded and scanned by the server before it joins the draft; fields are kept as they are typed, so leaving,
 * refreshing or failing a later validation never loses a file that was already accepted.
 */
@Injectable()
export class OpenRequestDrafts {
  private readonly gateway = inject(DEMAND_GATEWAY);

  load(): Promise<SavedOpenDraft | null> {
    return firstValueFrom(this.gateway.currentDraft());
  }

  save(fields: OpenRequestDraft): Promise<SavedOpenDraft> {
    return firstValueFrom(this.gateway.saveDraft(fields));
  }

  upload(file: File, attachedCount: number): Promise<SavedOpenDraft> {
    const refusal = Demand.fileRefusal(file, attachedCount);
    if (refusal) return Promise.reject(new FileRefused(file, refusal));
    return firstValueFrom(this.gateway.uploadDraftFile(file));
  }

  remove(attachmentId: string): Promise<SavedOpenDraft> {
    return firstValueFrom(this.gateway.removeDraftFile(attachmentId));
  }
}

export interface RequestView {
  readonly request: LearningRequest;
  /** For an open request, the marketplace view with offer count and reservation. */
  readonly open: OpenRequest | null;
  /** The order this request became, when it became one. */
  readonly orderId: string;
  /** How long the teacher usually takes to reply, for a student waiting on them (UX-22). */
  readonly replyHours?: number | null;
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
    const waiting = isStudent && request.sourcing === SOURCING.DIRECT && request.teacherId
      && (request.status === 0 || request.status === 1);
    let replyMinutes: number | null = null;
    // Nice to know, never needed: a failed read leaves the page as it was.
    if (waiting) try { replyMinutes = await firstValueFrom(this.gateway.teacherReplyMinutes(request.teacherId)); } catch { replyMinutes = null; }
    // Said in whole hours or days; "within 1 hour" for anything under an hour.
    const replyHours = replyMinutes ? Math.max(1, Math.ceil(replyMinutes / 60)) : null;
    return { request, open, orderId: order?.id ?? '', order, replyHours };
  }
}

@Injectable()
export class ManageRequest {
  private readonly gateway = inject(DEMAND_GATEWAY);

  cancel(request: LearningRequest): Promise<void> {
    return firstValueFrom(this.gateway.cancel(request.id, request.version));
  }

  /**
   * The student's answer, with any files the teacher asked for (UX-24). Files go first, each against the
   * version the previous one left, so the answer the teacher reads already has its files beside it.
   */
  reply(request: LearningRequest, message: string, files: readonly File[] = []): Promise<void> {
    return this.message(message, text => from((async () => {
      let version = request.version;
      for (const file of files) {
        await firstValueFrom(this.gateway.attach(request.id, file, version));
        version = (await firstValueFrom(this.gateway.request(request.id))).version;
      }
      await firstValueFrom(this.gateway.replyToClarification(request.id, text, version));
    })()));
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

  /** The service's limits, so the form can say them; the form still works (and the server still checks) without. */
  async terms(serviceTypeId: string): Promise<OfferTerms | null> {
    try { return await firstValueFrom(this.gateway.offerTerms(serviceTypeId)); } catch { return null; }
  }

  /**
   * The teacher's own offer on a request they can no longer open (another teacher was chosen, or the student
   * closed it), so the page can say what happened instead of "not available" (UX-82).
   */
  async pastOffer(requestId: string): Promise<MyOffer | null> {
    try { return (await firstValueFrom(this.gateway.myOffers())).find(o => o.requestId === requestId) ?? null; } catch { return null; }
  }
}

/** The teacher's offers and what became of each (UX-82). */
@Injectable()
export class LoadMyOffers {
  private readonly gateway = inject(DEMAND_GATEWAY);

  execute(): Promise<readonly MyOffer[]> {
    return firstValueFrom(this.gateway.myOffers());
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
