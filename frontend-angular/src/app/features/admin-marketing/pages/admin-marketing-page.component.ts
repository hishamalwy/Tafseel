import { SkeletonComponent } from '@shared/components/skeleton.component';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PromotionContentComponent } from '@shared/components/promotion-content.component';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { LocaleService } from '@core/i18n/locale.service';
import { ToastService } from '@shared/services/toast.service';
import { ToastComponent } from '@shared/components/toast.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { AdminMarketing } from '../services/admin-marketing.use-cases';
import { CouponDraft, CouponRecord, PromotionDraft, PromotionRecord } from '../services/admin-marketing.ports';

const EMPTY_COUPON: CouponDraft = { name: '', code: '', discountType: 0, discountValue: 10, expiresAt: null };
const EMPTY_PROMOTION: PromotionDraft = {
  kind: 2, titleEn: '', titleAr: '', bodyEn: '', bodyAr: '', couponCode: '', endsAt: null
};

@Component({
  selector: 'tf-admin-marketing-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SkeletonComponent, PromotionContentComponent, RouterLink, WorkspaceShellComponent, ToastComponent],
  templateUrl: './admin-marketing-page.component.html',
  styleUrl: './admin-marketing-page.component.css'
})
export class AdminMarketingPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly manage = inject(AdminMarketing);
  private readonly toasts = inject(ToastService);
  readonly locale = inject(LocaleService);
  get tab(): 'promotions' | 'coupons' { return this.route.snapshot.paramMap.get('tab') === 'promotions' ? 'promotions' : 'coupons'; }
  readonly previewLanguage = signal<'ar' | 'en'>('ar');
  private loadId = 0;
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly coupons = signal<readonly CouponRecord[]>([]);
  readonly promotions = signal<readonly PromotionRecord[]>([]);
  readonly coupon = signal<CouponDraft>(EMPTY_COUPON);
  readonly promotion = signal<PromotionDraft>(EMPTY_PROMOTION);
  readonly usableCoupons = computed(() => this.coupons().filter(x =>
    x.isActive && (!x.expiresAt || Date.parse(x.expiresAt) > Date.now())));

  constructor() { this.route.paramMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => void this.load()); }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  patchCoupon(change: Partial<CouponDraft>): void { this.coupon.update(value => ({ ...value, ...change })); }
  patchPromotion(change: Partial<PromotionDraft>): void { this.promotion.update(value => ({ ...value, ...change })); }
  previewTitle(): string {
    return (this.previewLanguage() === 'ar' ? this.promotion().titleAr : this.promotion().titleEn)
      || (this.previewLanguage() === 'ar' ? this.t('craft_preview_ar_title', 'عنوان الرسالة') : this.t('craft_preview_en_title', 'Message title'));
  }
  previewBody(): string {
    return (this.previewLanguage() === 'ar' ? this.promotion().bodyAr : this.promotion().bodyEn)
      || (this.previewLanguage() === 'ar' ? this.t('craft_preview_ar_body', 'الوصف هيظهر هنا أثناء الكتابة.') : this.t('craft_preview_en_body', 'Your description appears here as you type.'));
  }
  date(value: string | null): string { return value ? new Date(value).toLocaleDateString(this.locale.lang() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US') : '—'; }
  expiry(value: string): string | null { return value ? new Date(value).toISOString() : null; }

  async load(): Promise<void> {
    const id = ++this.loadId, tab = this.tab;
    this.loading.set(true); this.error.set('');
    try {
      if (tab === 'coupons') { const coupons = await this.manage.coupons(); if (id === this.loadId) this.coupons.set(coupons); }
      else {
        const [promotions, coupons] = await Promise.all([this.manage.promotions(), this.manage.coupons()]);
        if (id === this.loadId) { this.promotions.set(promotions); this.coupons.set(coupons); }
      }
    } catch (error) { if (id === this.loadId) this.error.set(this.message(error)); }
    finally { if (id === this.loadId) this.loading.set(false); }
  }

  async createCoupon(): Promise<void> {
    const draft = this.coupon();
    if (this.busy() || !draft.name.trim() || !draft.code.trim() || draft.discountValue <= 0) return;
    this.busy.set(true); this.error.set('');
    try {
      await this.manage.createCoupon({ ...draft, name: draft.name.trim(), code: draft.code.trim().toUpperCase() });
      this.coupon.set(EMPTY_COUPON);
      this.coupons.set(await this.manage.coupons());
      this.toasts.show(this.t('marketing_coupon_created', 'Coupon created.'));
    } catch (error) { this.error.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  async createPromotion(): Promise<void> {
    const draft = this.promotion();
    if (this.busy() || !draft.titleEn.trim() || !draft.titleAr.trim()
      || (draft.kind === 0 && !draft.couponCode)) return;
    this.busy.set(true); this.error.set('');
    try {
      await this.manage.createPromotion(draft);
      this.promotion.set(EMPTY_PROMOTION);
      this.promotions.set(await this.manage.promotions());
      this.toasts.show(this.t('marketing_promotion_created', 'Promotion created.'));
    } catch (error) { this.error.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  async toggleCoupon(coupon: CouponRecord): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await this.manage.setCouponActive(coupon.id, !coupon.isActive); this.coupons.set(await this.manage.coupons()); }
    catch (error) { this.error.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  async togglePromotion(promotion: PromotionRecord): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await this.manage.setPromotionActive(promotion.id, !promotion.isActive); this.promotions.set(await this.manage.promotions()); }
    catch (error) { this.error.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  private message(error: unknown): string {
    return problemMessage(error, (k, f) => this.t(k, f)).text || this.t('unexpected_error', 'Something went wrong.');
  }
}
