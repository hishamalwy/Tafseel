import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminMarketingGateway, CouponDraft, CouponRecord, PromotionDraft, PromotionRecord
} from './admin-marketing.ports';

@Injectable()
export class HttpAdminMarketingGateway implements AdminMarketingGateway {
  private readonly http = inject(HttpClient);

  coupons(): Observable<readonly CouponRecord[]> {
    return this.http.get<CouponRecord[]>('/api/v1/admin/coupons');
  }

  createCoupon(draft: CouponDraft): Observable<CouponRecord> {
    return this.http.post<CouponRecord>('/api/v1/admin/coupons', draft);
  }

  setCouponActive(id: string, isActive: boolean): Observable<void> {
    return this.http.patch<void>(`/api/v1/admin/coupons/${encodeURIComponent(id)}/active`, { isActive });
  }

  promotions(): Observable<readonly PromotionRecord[]> {
    return this.http.get<PromotionRecord[]>('/api/v1/admin/promotions');
  }

  createPromotion(draft: PromotionDraft): Observable<PromotionRecord> {
    return this.http.post<PromotionRecord>('/api/v1/admin/promotions', {
      ...draft, ctaLabelEn: draft.kind === 0 ? '' : 'Find a teacher',
      ctaLabelAr: draft.kind === 0 ? '' : 'تصفح المعلمين',
      ctaHref: draft.kind === 0 ? '' : '/teachers',
      displayOrder: 0
    });
  }

  setPromotionActive(id: string, isActive: boolean): Observable<void> {
    return this.http.patch<void>(`/api/v1/admin/promotions/${encodeURIComponent(id)}/active`, { isActive });
  }
}
