import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ADMIN_MARKETING_GATEWAY, CouponDraft, PromotionDraft
} from './admin-marketing.ports';

@Injectable()
export class AdminMarketing {
  private readonly gateway = inject(ADMIN_MARKETING_GATEWAY);

  coupons() { return firstValueFrom(this.gateway.coupons()); }
  promotions() { return firstValueFrom(this.gateway.promotions()); }
  createCoupon(draft: CouponDraft) { return firstValueFrom(this.gateway.createCoupon(draft)); }
  createPromotion(draft: PromotionDraft) { return firstValueFrom(this.gateway.createPromotion(draft)); }
  setCouponActive(id: string, active: boolean) { return firstValueFrom(this.gateway.setCouponActive(id, active)); }
  setPromotionActive(id: string, active: boolean) { return firstValueFrom(this.gateway.setPromotionActive(id, active)); }
}
