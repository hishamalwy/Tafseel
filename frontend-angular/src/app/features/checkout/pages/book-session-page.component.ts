import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { timeZoneLabel } from '@features/teacher-setup/models/availability';
import { ToastService } from '@shared/services/toast.service';
import { ToastComponent } from '@shared/components/toast.component';
import { PriceComponent } from '@shared/components/price.component';
import { WorkflowHeaderComponent } from '@shared/layouts/workflow-header.component';
import { BOOKING_GATEWAY, BookableTeacher } from '../services/checkout.ports';
import { BookableService, Booking, Slot, toLocalIsoString } from '../models/booking';

/**
 * Book a live session — ported from `Tafseel-Book-Session.dc.html`.
 *
 * Pick a duration, a timezone, and a slot from the coming week, then confirm.
 * Confirming creates the booking and hands off to checkout; the optional
 * attachment is uploaded after, and a failure there does not undo the booking.
 */
@Component({
  selector: 'tf-book-session-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, WorkflowHeaderComponent, ToastComponent, PriceComponent],
  templateUrl: './book-session-page.component.html',
  styleUrl: './book-session-page.component.css'
})
export class BookSessionPageComponent {
  private readonly bookings = inject(BOOKING_GATEWAY);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly toasts = inject(ToastService);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);

  readonly loading = signal(true);
  readonly slotsLoading = signal(false);
  readonly confirming = signal(false);
  readonly missingTeacher = signal(false);
  readonly noBookableService = signal(false);
  readonly loadError = signal('');

  readonly teacher = signal<BookableTeacher | null>(null);
  readonly service = signal<BookableService | null>(null);
  readonly slots = signal<readonly Slot[]>([]);

  readonly sessionTitle = signal('');
  readonly topic = signal('');
  readonly notes = signal('');
  readonly duration = signal(60);
  readonly emergency = signal(false);
  readonly timezone = signal(Booking.detectTimeZone());
  readonly selectedSlot = signal<{ key: string; localStart: string; label: string } | null>(null);
  readonly attachment = signal<File | null>(null);

  private teacherId = '';
  private preferredServiceId = '';

  constructor() {
    queueMicrotask(() =>
      this.title.setTitle(this.t('book_breadcrumb', 'Book a live session') + ' — Tafseel'));

    const q = this.route.snapshot.queryParamMap;
    this.teacherId = (q.get('teacherId') ?? '').trim();
    this.preferredServiceId = (q.get('teacherServiceId') ?? '').trim();

    if (!this.teacherId) {
      this.missingTeacher.set(true);
      this.loading.set(false);
    } else {
      void this.load();
    }
  }

  t(key: string, fallback = ''): string {
    return this.locale.t(key, fallback);
  }

  readonly teacherName = computed(() => {
    const teacher = this.teacher();
    return teacher ? this.fmt.userName(teacher) : '';
  });

  readonly durations = computed(() => Booking.durationsFor(this.service()));

  readonly week = computed(() =>
    Booking.week(this.slots(), this.locale.lang() === 'ar' ? 'ar-SA' : 'en-US'));

  readonly hasAnySlot = computed(() => this.week().some(day => day.slots.length > 0));

  readonly total = computed(() => {
    const service = this.service();
    if (!service) return null;
    const base = Number(service.basePrice) || 0;
    const premium = this.emergency() ? (Number(service.emergencyPremiumAmount) || 0) : 0;
    return { amount: base + premium, currency: service.currency || 'SAR' };
  });

  readonly canConfirm = computed(() =>
    !this.confirming()
    && this.sessionTitle().trim().length > 0
    && this.topic().trim().length > 0
    && this.selectedSlot() !== null
    && this.service() !== null);

  /** Timezones offered; the detected one is always present even if unlisted. */
  /** A zone named in the reader's language rather than as its IANA identifier (UX-06). */
  zoneLabel(zone: string): string { return timeZoneLabel(zone || 'UTC', this.locale.lang()); }

  readonly timezones = computed(() => {
    const common = [
      'Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar',
      'Africa/Cairo', 'Europe/London', 'UTC'
    ];
    const detected = Booking.detectTimeZone();
    return common.includes(detected) ? common : [detected, ...common];
  });

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const teacher = await firstValueFrom(this.bookings.teacher(this.teacherId));
      this.teacher.set(teacher);

      const service = Booking.pickService(teacher.services, this.preferredServiceId);
      if (!service) {
        this.noBookableService.set(true);
        this.service.set(null);
        this.slots.set([]);
        return;
      }
      this.service.set(service);
      this.duration.set(Booking.durationsFor(service)[0]!);
      this.noBookableService.set(false);
      this.loadError.set('');
      await this.loadSlots();
    } catch {
      const message = this.t('book_load_failed', 'Could not load availability.');
      this.loadError.set(message);
      this.noBookableService.set(true);
      this.toasts.show(message);
    } finally {
      this.loading.set(false);
    }
  }

  async loadSlots(): Promise<void> {
    const service = this.service();
    if (!service) return;

    this.slotsLoading.set(true);
    // Any change to duration or timezone invalidates the chosen slot.
    this.selectedSlot.set(null);
    try {
      const slots = await firstValueFrom(this.bookings.slots(
        this.teacherId, service.id, this.duration(), this.timezone(), 7));
      this.slots.set(slots);
    } catch {
      this.slots.set([]);
      this.toasts.show(this.t('book_slots_failed', 'Could not load slots.'));
    } finally {
      this.slotsLoading.set(false);
    }
  }

  setDuration(minutes: number): void {
    if (this.duration() === minutes && !this.emergency()) return;
    this.duration.set(minutes);
    this.emergency.set(false);
    void this.loadSlots();
  }

  setTimezone(zone: string): void {
    if (!zone.trim() || this.timezone() === zone) return;
    this.timezone.set(zone);
    void this.loadSlots();
  }

  selectSlot(slot: { key: string; localStart: string; label: string; emergency: boolean }): void {
    this.selectedSlot.set({ key: slot.key, localStart: slot.localStart, label: slot.label });
    this.emergency.set(slot.emergency);
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.attachment.set(input.files?.[0] ?? null);
  }

  async confirm(): Promise<void> {
    const service = this.service();
    const slot = this.selectedSlot();
    if (!service || !slot) {
      this.toasts.show(this.t('book_pick_slot', 'Pick a time slot first.'));
      return;
    }
    if (!this.sessionTitle().trim() || !this.topic().trim()) {
      this.toasts.show(this.t('book_add_title_topic', 'Add a title and a topic.'));
      return;
    }

    this.confirming.set(true);
    try {
      const booking = await firstValueFrom(this.bookings.create({
        teacherServiceId: service.id,
        title: this.sessionTitle().trim(),
        // Topic leads the notes so the teacher sees it first, as before.
        notes: [this.topic().trim(), this.notes().trim()].filter(Boolean).join('\n\n'),
        localStart: toLocalIsoString(slot.localStart),
        studentTimeZoneId: this.timezone(),
        durationMinutes: this.duration(),
        emergency: this.emergency()
      }));

      const file = this.attachment();
      if (file && booking.version) {
        try {
          await firstValueFrom(this.bookings.attach(booking.id, file, booking.version));
        } catch {
          // The booking stands; the attachment can be added later.
        }
      }

      await this.router.navigate(['/checkout'], { queryParams: { liveSessionId: booking.id } });
    } catch {
      this.toasts.show(this.t('book_failed', 'Could not book the session.'));
      this.confirming.set(false);
    }
  }
}
