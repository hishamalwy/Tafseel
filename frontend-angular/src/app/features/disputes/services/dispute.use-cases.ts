import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Dispute, DisputeResolution, EligiblePurchase, isAcceptableEvidence
} from '@features/disputes/models/dispute';
import {
  DISPUTE_ADMIN_GATEWAY, DISPUTE_GATEWAY, OpenDisputeCommand, Page
} from './dispute.ports';

export const DISPUTE_PAGE_SIZE = 20;

/** Reading the case list, for either audience. */
@Injectable({ providedIn: 'root' })
export class ListDisputes {
  private readonly cases = inject(DISPUTE_GATEWAY);
  private readonly admin = inject(DISPUTE_ADMIN_GATEWAY);

  execute(isAdmin: boolean, page: number): Promise<Page<Dispute>> {
    const gateway = isAdmin ? this.admin : this.cases;
    return firstValueFrom(gateway.list(page, DISPUTE_PAGE_SIZE));
  }

  byId(isAdmin: boolean, id: string): Promise<Dispute> {
    const gateway = isAdmin ? this.admin : this.cases;
    return firstValueFrom(gateway.byId(id));
  }
}

@Injectable({ providedIn: 'root' })
export class ListEligiblePurchases {
  private readonly gateway = inject(DISPUTE_GATEWAY);

  /**
   * An admin has nothing to open a case against, and the endpoint is not theirs
   * to call, so this answers empty rather than making the caller remember.
   */
  async execute(isAdmin: boolean): Promise<readonly EligiblePurchase[]> {
    if (isAdmin) return [];
    return firstValueFrom(this.gateway.eligiblePurchases());
  }
}

@Injectable({ providedIn: 'root' })
export class OpenDispute {
  private readonly gateway = inject(DISPUTE_GATEWAY);

  execute(command: OpenDisputeCommand): Promise<Dispute> {
    const reason = command.reason.trim();
    if (!reason) throw new Error('A dispute needs a reason.');
    return firstValueFrom(this.gateway.open({ ...command, reason }));
  }
}

@Injectable({ providedIn: 'root' })
export class PostCaseMessage {
  private readonly gateway = inject(DISPUTE_GATEWAY);

  execute(dispute: Dispute, body: string): Promise<void> {
    const trimmed = body.trim();
    if (!trimmed) throw new Error('A message needs a body.');
    return firstValueFrom(this.gateway.postMessage(dispute.id, trimmed, dispute.version));
  }
}

@Injectable({ providedIn: 'root' })
export class UploadEvidence {
  private readonly gateway = inject(DISPUTE_GATEWAY);

  /**
   * Type and size are checked before the request. The server checks too — this
   * exists so a 50MB upload is not sent only to be rejected.
   */
  execute(dispute: Dispute, file: File): Promise<void> {
    if (!isAcceptableEvidence(file)) throw new Error('unacceptable-evidence');
    return firstValueFrom(this.gateway.uploadEvidence(dispute.id, file, dispute.version));
  }
}

@Injectable({ providedIn: 'root' })
export class OpenEvidence {
  private readonly gateway = inject(DISPUTE_GATEWAY);

  execute(evidenceId: string, fileName: string): Promise<void> {
    return firstValueFrom(this.gateway.downloadEvidence(evidenceId, fileName));
  }
}

@Injectable({ providedIn: 'root' })
export class StartDisputeReview {
  private readonly admin = inject(DISPUTE_ADMIN_GATEWAY);

  execute(dispute: Dispute): Promise<void> {
    return firstValueFrom(this.admin.startReview(dispute.id, dispute.version));
  }
}

@Injectable({ providedIn: 'root' })
export class ResolveDispute {
  private readonly admin = inject(DISPUTE_ADMIN_GATEWAY);

  /**
   * The key is minted per case-and-attempt and handed back to the caller so a
   * retry after a network failure reuses it. Resolving moves money; doing it
   * twice because a response was lost is the failure this prevents.
   */
  mintKey(dispute: Dispute): string {
    const unique = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
    return `dispute-${dispute.id}-${unique}`;
  }

  execute(
    dispute: Dispute, resolution: DisputeResolution, rationale: string, idempotencyKey: string
  ): Promise<void> {
    const trimmed = rationale.trim();
    if (!trimmed) throw new Error('A resolution needs a rationale.');
    return firstValueFrom(
      this.admin.resolve(dispute.id, resolution, trimmed, dispute.version, idempotencyKey)
    );
  }
}
