import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

export interface CouponRecord {
  id: string; name: string; code: string; discountType: number; discountValue: number;
  expiresAt: string | null; isActive: boolean; version: string;
}

export interface CouponDraft {
  name: string; code: string; discountType: number; discountValue: number; expiresAt: string | null;
}

export interface PromotionRecord {
  id: string; kind: number; titleEn: string; titleAr: string; bodyEn: string; bodyAr: string;
  couponCode: string; isActive: boolean; isLive: boolean; endsAt: string | null; version: string;
}

export interface PromotionDraft {
  kind: number; titleEn: string; titleAr: string; bodyEn: string; bodyAr: string;
  couponCode: string; endsAt: string | null;
}

export interface AdminMarketingGateway {
  coupons(): Observable<readonly CouponRecord[]>;
  createCoupon(draft: CouponDraft): Observable<CouponRecord>;
  setCouponActive(id: string, isActive: boolean): Observable<void>;
  promotions(): Observable<readonly PromotionRecord[]>;
  createPromotion(draft: PromotionDraft): Observable<PromotionRecord>;
  setPromotionActive(id: string, isActive: boolean): Observable<void>;
}

export const ADMIN_MARKETING_GATEWAY = new InjectionToken<AdminMarketingGateway>('AdminMarketingGateway');
