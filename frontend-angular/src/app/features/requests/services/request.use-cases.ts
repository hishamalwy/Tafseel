import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  FileRejection, RequestDraft, RequestableService, requestableServices, validateFile
} from '../models/learning-request';
import {
  BriefSuggestion, CreatedRequest, DRAFT_STORE, LearningPreferences, MARKETPLACE_GATEWAY,
  NewRequest, Offer, OfferTerms, OpenRequest, REQUEST_GATEWAY
} from './request.ports';

export interface WizardContext {
  readonly services: readonly RequestableService[];
  readonly preferences: LearningPreferences | null;
  readonly preferencesFailed: boolean;
  readonly draft: RequestDraft | null;
  /** The teacher offers only scheduled services, so there is nothing to request. */
  readonly schedulingOnly: boolean;
}

/**
 * Everything the request wizard needs to open.
 *
 * Preferences and the saved draft are conveniences: a failure in either still
 * leaves a usable wizard, so neither is allowed to fail the load.
 */
@Injectable({ providedIn: 'root' })
export class OpenRequestWizard {
  private readonly requests = inject(REQUEST_GATEWAY);
  private readonly drafts = inject(DRAFT_STORE);

  async execute(teacherId: string, studentId: string): Promise<WizardContext> {
    const [allServices, preferencesResult] = await Promise.all([
      firstValueFrom(this.requests.teacherServices(teacherId)),
      firstValueFrom(this.requests.preferences())
        .then(preferences => ({ ok: true, preferences: preferences as LearningPreferences | null }))
        .catch(() => ({ ok: false, preferences: null as LearningPreferences | null }))
    ]);

    const services = requestableServices(allServices);
    return {
      services,
      preferences: preferencesResult.preferences,
      preferencesFailed: !preferencesResult.ok,
      draft: this.drafts.read(studentId, teacherId),
      schedulingOnly: allServices.length > 0 && services.length === 0
    };
  }
}

export interface SubmitOutcome {
  readonly request: CreatedRequest;
  /** Files the request was created without; the caller can offer a retry. */
  readonly failedFiles: readonly File[];
}

/**
 * Create the request, then attach files.
 *
 * The order matters and so does the error handling: the request is the thing
 * that must succeed. A failed upload is reported back rather than thrown, so a
 * student never loses a submitted brief because one attachment did not land.
 */
@Injectable({ providedIn: 'root' })
export class SubmitLearningRequest {
  private readonly requests = inject(REQUEST_GATEWAY);
  private readonly drafts = inject(DRAFT_STORE);

  async execute(
    request: NewRequest, files: readonly File[], studentId: string
  ): Promise<SubmitOutcome> {
    const created = await firstValueFrom(this.requests.create(request));

    const failedFiles: File[] = [];
    for (const file of files) {
      try {
        await firstValueFrom(this.requests.attach(created.id, file, created.version));
      } catch {
        failedFiles.push(file);
      }
    }

    this.drafts.clear(studentId, request.teacherId);
    return { request: created, failedFiles };
  }

  /** Retry only what failed, against the request that already exists. */
  async retryAttachments(
    created: CreatedRequest, files: readonly File[]
  ): Promise<readonly File[]> {
    const stillFailed: File[] = [];
    for (const file of files) {
      try {
        await firstValueFrom(this.requests.attach(created.id, file, created.version));
      } catch {
        stillFailed.push(file);
      }
    }
    return stillFailed;
  }
}

@Injectable({ providedIn: 'root' })
export class SaveRequestDraft {
  private readonly drafts = inject(DRAFT_STORE);

  execute(studentId: string, teacherId: string, draft: RequestDraft): void {
    // A draft without a teacher has nowhere to belong.
    if (!teacherId) return;
    this.drafts.write(studentId, teacherId, draft);
  }

  discard(studentId: string, teacherId: string): void {
    this.drafts.clear(studentId, teacherId);
  }
}

export interface FileAcceptance {
  readonly accepted: readonly File[];
  readonly rejected: readonly { readonly file: File; readonly reason: FileRejection }[];
}

@Injectable({ providedIn: 'root' })
export class AcceptFiles {
  /** Returns the files to keep and, for each rejection, why. */
  execute(incoming: readonly File[], existing: readonly File[]): FileAcceptance {
    const accepted: File[] = [];
    const rejected: { file: File; reason: FileRejection }[] = [];

    for (const file of incoming) {
      const reason = validateFile(file, existing.length + accepted.length);
      if (reason) rejected.push({ file, reason });
      else accepted.push(file);
    }
    return { accepted, rejected };
  }
}

@Injectable({ providedIn: 'root' })
export class AssistWithBrief {
  private readonly requests = inject(REQUEST_GATEWAY);

  /** The API accepts 3 to 4000 characters of notes. */
  execute(notes: string): Promise<BriefSuggestion> {
    const trimmed = notes.trim().slice(0, 4000);
    if (trimmed.length < 3) return Promise.reject(new Error('assist-needs-notes'));
    return firstValueFrom(this.requests.assist(trimmed));
  }
}

// ---- open marketplace ----

@Injectable({ providedIn: 'root' })
export class ListMarketplaceRequests {
  private readonly marketplace = inject(MARKETPLACE_GATEWAY);

  mine(): Promise<readonly OpenRequest[]> {
    return firstValueFrom(this.marketplace.myRequests());
  }

  opportunities(): Promise<readonly OpenRequest[]> {
    return firstValueFrom(this.marketplace.opportunities());
  }

  offers(requestId: string): Promise<readonly Offer[]> {
    return firstValueFrom(this.marketplace.offers(requestId));
  }
}

/** Offer terms as the SubmitTeacherOffer contract bounds them. */
export const OFFER_LIMITS = {
  maxDeliveryHours: 8760,
  maxRevisions: 20,
  minValidityHours: 1,
  maxValidityHours: 720,
  maxMessage: 2000
} as const;

@Injectable({ providedIn: 'root' })
export class SubmitOffer {
  private readonly marketplace = inject(MARKETPLACE_GATEWAY);

  /** Validates in the order the form shows the fields; the server re-checks catalog policy. */
  execute(requestId: string, terms: OfferTerms): Promise<void> {
    if (!(terms.amount > 0)) return Promise.reject(new Error('offer-needs-price'));
    if (!(Number.isInteger(terms.deliveryHours) && terms.deliveryHours >= 1 && terms.deliveryHours <= OFFER_LIMITS.maxDeliveryHours)) {
      return Promise.reject(new Error('offer-needs-delivery'));
    }
    if (!(Number.isInteger(terms.includedRevisions) && terms.includedRevisions >= 0 && terms.includedRevisions <= OFFER_LIMITS.maxRevisions)) {
      return Promise.reject(new Error('offer-needs-revisions'));
    }
    if (!(Number.isInteger(terms.validityHours) && terms.validityHours >= OFFER_LIMITS.minValidityHours && terms.validityHours <= OFFER_LIMITS.maxValidityHours)) {
      return Promise.reject(new Error('offer-needs-validity'));
    }
    const message = terms.message.trim();
    if (!message) return Promise.reject(new Error('offer-needs-message'));
    return firstValueFrom(this.marketplace.submitOffer(requestId, { ...terms, message: message.slice(0, OFFER_LIMITS.maxMessage) }));
  }
}

@Injectable({ providedIn: 'root' })
export class SelectOffer {
  private readonly marketplace = inject(MARKETPLACE_GATEWAY);

  /** Reserves the request for payment of this offer. No order exists until payment. */
  execute(request: Pick<OpenRequest, 'id' | 'version'>, offer: Pick<Offer, 'id' | 'version'>): Promise<void> {
    return firstValueFrom(this.marketplace.selectOffer(request, offer));
  }
}
