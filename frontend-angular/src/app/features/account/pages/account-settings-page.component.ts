import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { injectUnsavedChanges } from '@shared/utils/unsaved-changes';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { ProtectedFile } from '@core/http/protected-file.service';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { helpShellRole } from '@features/support/models/support';
import { ToastComponent } from '@shared/components/toast.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import {
  AccountSettingsGateway, EXPLANATION_STYLES, LanguageOption, LearningSettings, NotificationSettings, SignInDevice
} from '../services/account-settings.gateway';

type Section = 'profile' | 'avatar' | 'password' | 'devices' | 'notifications' | 'learning' | 'export' | 'delete';

/**
 * PRODUCT-P1 (account self-service): one page every role reaches from the account menu. Each card saves on its
 * own, so a problem in one never blocks the others. Changing the password or deleting the account ends this
 * sign-in; the page says so before it happens and takes the person to the sign-in page afterwards.
 */
@Component({
  selector: 'tf-account-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, WorkspaceShellComponent, ToastComponent],
  template: `
    <tf-workspace-shell [role]="shellRole()" section="account">
      <div class="tf-acct">
        <header class="tf-acct-head">
          <h1>{{ t('acct_title', 'Account settings') }}</h1>
          <p>{{ t('acct_intro', 'Your name, photo, password, signed-in devices, notifications and data.') }}</p>
        </header>

        <!-- Profile -->
        <section class="tf-acct-card" aria-labelledby="acct-profile-title" data-testid="acct-profile">
          <h2 id="acct-profile-title">{{ t('acct_profile', 'Your name') }}</h2>
          <form class="tf-acct-form" (ngSubmit)="saveProfile()" novalidate>
            <div class="tf-acct-grid">
              <div class="tf-field">
                <label for="acct-name">{{ t('auth_full_name', 'Full name') }}</label>
                <input id="acct-name" name="name" maxlength="200" autocomplete="name" [ngModel]="fullName()" (ngModelChange)="fullName.set($event)" data-testid="acct-name">
              </div>
              <div class="tf-field">
                <label for="acct-name-en">{{ t('auth_full_name_english', 'English name') }}</label>
                <input autocomplete="name" id="acct-name-en" name="nameEn" maxlength="200" dir="ltr" [ngModel]="fullNameEnglish()" (ngModelChange)="fullNameEnglish.set($event)">
              </div>
            </div>
            <p class="tf-acct-muted">{{ locale.format('acct_email', { email: email() }, 'Signed in as {email}.') }}</p>
            @if (errors()['profile']) { <p class="tf-field-error" role="alert">{{ errors()['profile'] }}</p> }
            <div class="tf-form-actions"><button type="submit" class="tf-button" [disabled]="busy() === 'profile'" data-testid="acct-save-profile">{{ t('common_save', 'Save') }}</button></div>
          </form>
        </section>

        <!-- Photo -->
        <section class="tf-acct-card" aria-labelledby="acct-avatar-title" data-testid="acct-avatar">
          <h2 id="acct-avatar-title">{{ t('acct_photo', 'Profile photo') }}</h2>
          <div class="tf-acct-avatar">
            <img [src]="avatarUrl()" alt="" width="72" height="72" data-testid="acct-avatar-img">
            <div class="tf-acct-avatar-actions">
              <label class="tf-button tf-button-secondary tf-acct-file" [class.is-disabled]="busy() === 'avatar'">
                <input type="file" accept="image/png,image/jpeg,image/webp" (change)="uploadAvatar($event)" [disabled]="busy() === 'avatar'" data-testid="acct-avatar-file">
                {{ hasAvatar() ? t('acct_photo_replace', 'Replace photo') : t('acct_photo_add', 'Add a photo') }}
              </label>
              @if (hasAvatar()) {
                <button type="button" class="tf-button tf-button-ghost" (click)="removeAvatar()" [disabled]="busy() === 'avatar'" data-testid="acct-avatar-remove">{{ t('acct_photo_remove', 'Remove photo') }}</button>
              }
              <small class="tf-acct-muted">{{ t('acct_photo_hint', 'PNG, JPEG or WebP, up to 2 MB.') }}</small>
            </div>
          </div>
          @if (errors()['avatar']) { <p class="tf-field-error" role="alert">{{ errors()['avatar'] }}</p> }
        </section>

        <!-- Password -->
        <section class="tf-acct-card" aria-labelledby="acct-password-title" data-testid="acct-password">
          <h2 id="acct-password-title">{{ t('acct_password', 'Password') }}</h2>
          <form class="tf-acct-form" (ngSubmit)="changePassword()" novalidate>
            <div class="tf-acct-grid">
              <div class="tf-field">
                <label for="acct-current">{{ t('acct_password_current', 'Current password') }}</label>
                <input id="acct-current" name="current" type="password" autocomplete="current-password" maxlength="128"
                       [ngModel]="currentPassword()" (ngModelChange)="currentPassword.set($event)" data-testid="acct-current-password">
              </div>
              <div class="tf-field">
                <label for="acct-new">{{ t('acct_password_new', 'New password') }}</label>
                <input id="acct-new" name="new" type="password" autocomplete="new-password" maxlength="128" aria-describedby="acct-new-hint"
                       [ngModel]="newPassword()" (ngModelChange)="newPassword.set($event)" data-testid="acct-new-password">
                <small id="acct-new-hint" class="tf-acct-muted">{{ t('acct_password_rule', 'At least 10 characters.') }}</small>
              </div>
            </div>
            <p class="tf-acct-muted">{{ t('acct_password_signout', 'Changing your password signs you out everywhere, including here. Sign in again with the new password.') }}</p>
            @if (errors()['password']) { <p class="tf-field-error" role="alert">{{ errors()['password'] }}</p> }
            <div class="tf-form-actions"><button type="submit" class="tf-button" [disabled]="busy() === 'password'" data-testid="acct-change-password">{{ t('acct_password_change', 'Change password') }}</button></div>
          </form>
        </section>

        <!-- Devices -->
        <section class="tf-acct-card" aria-labelledby="acct-devices-title" data-testid="acct-devices">
          <h2 id="acct-devices-title">{{ t('acct_devices', 'Signed-in devices') }}</h2>
          <p class="tf-acct-muted">{{ t('acct_devices_hint', 'Each sign-in stays active until it expires or you sign it out. Sign out any you do not recognise.') }}</p>
          @if (devices().length) {
            <ul class="tf-acct-list">
              @for (d of devices(); track d.id) {
                <li data-testid="acct-device" [attr.data-current]="d.isCurrent">
                  <span>
                    <strong>{{ d.isCurrent ? t('acct_device_this', 'This device') : t('acct_device_other', 'Another sign-in') }}</strong>
                    <small>{{ locale.format('acct_device_since', { when: when(d.createdAt) }, 'Signed in {when}') }}</small>
                  </span>
                  @if (!d.isCurrent) {
                    <button type="button" class="tf-button tf-button-ghost tf-button-sm" (click)="signOutDevice(d)" [disabled]="busy() === 'devices'">{{ t('acct_device_sign_out', 'Sign out') }}</button>
                  }
                </li>
              }
            </ul>
          }
          @if (otherDevices() > 0) {
            <div class="tf-form-actions"><button type="button" class="tf-button tf-button-secondary" (click)="signOutOthers()" [disabled]="busy() === 'devices'" data-testid="acct-sign-out-others">{{ t('acct_sign_out_others', 'Sign out all other devices') }}</button></div>
          }
          @if (errors()['devices']) { <p class="tf-field-error" role="alert">{{ errors()['devices'] }}</p> }
        </section>

        <!-- Notifications -->
        <section class="tf-acct-card" aria-labelledby="acct-notify-title" data-testid="acct-notifications">
          <h2 id="acct-notify-title">{{ t('acct_notifications', 'Notifications') }}</h2>
          <p class="tf-acct-muted" data-testid="acct-notify-always">{{ t('acct_notify_always', 'Notices about your payments, orders, sessions, disputes, refunds, earnings, applications, reports and account security are always sent. The switches below cover chat messages, reviews and reminders.') }}</p>
          <label class="tf-check"><input type="checkbox" [checked]="notify().inAppEnabled" (change)="setNotify('inAppEnabled', $any($event.target).checked)" data-testid="acct-notify-inapp"><span>{{ t('acct_notify_inapp', 'Show them in the bell') }}</span></label>
          <label class="tf-check"><input type="checkbox" [checked]="notify().emailEnabled" (change)="setNotify('emailEnabled', $any($event.target).checked)" data-testid="acct-notify-email"><span>{{ t('acct_notify_email', 'Send them by e-mail') }}</span></label>
          @if (errors()['notifications']) { <p class="tf-field-error" role="alert">{{ errors()['notifications'] }}</p> }
        </section>

        @if (isStudent()) {
          <!-- Learning preferences -->
          <section class="tf-acct-card" aria-labelledby="acct-learning-title" data-testid="acct-learning">
            <h2 id="acct-learning-title">{{ t('acct_learning', 'How you like to learn') }}</h2>
            <p class="tf-acct-muted">{{ t('acct_learning_hint', 'Filled in for you on each new request. You can still change it on the request.') }}</p>
            <form class="tf-acct-form" (ngSubmit)="saveLearning()" novalidate>
              <div class="tf-acct-grid">
                <div class="tf-field">
                  <label for="acct-style">{{ t('req_label_style', 'Explanation preference') }}</label>
                  <select id="acct-style" name="style" [ngModel]="learning().explanationStyle" (ngModelChange)="setLearning('explanationStyle', $event)" data-testid="acct-style">
                    <option [ngValue]="null">{{ t('req_style_none', 'No preference') }}</option>
                    @for (s of styles; track s) { <option [ngValue]="s">{{ t('req_style_' + s, s) }}</option> }
                  </select>
                </div>
                <div class="tf-field">
                  <label for="acct-language">{{ t('req_label_language', 'Preferred teaching language') }}</label>
                  <select id="acct-language" name="language" [ngModel]="learning().languageId" (ngModelChange)="setLearning('languageId', $event)" data-testid="acct-language">
                    <option [ngValue]="null">{{ t('req_style_none', 'No preference') }}</option>
                    @for (l of languages(); track l.id) { <option [ngValue]="l.id">{{ languageName(l) }}</option> }
                  </select>
                </div>
              </div>
              @if (errors()['learning']) { <p class="tf-field-error" role="alert">{{ errors()['learning'] }}</p> }
              <div class="tf-form-actions"><button type="submit" class="tf-button" [disabled]="busy() === 'learning'" data-testid="acct-save-learning">{{ t('common_save', 'Save') }}</button></div>
            </form>
          </section>
        }

        <!-- Data -->
        <section class="tf-acct-card" aria-labelledby="acct-data-title">
          <h2 id="acct-data-title">{{ t('acct_data', 'Your data') }}</h2>
          <p class="tf-acct-muted">{{ t('acct_data_hint', 'Download a copy of what Tafseel holds about your account.') }}</p>
          @if (errors()['export']) { <p class="tf-field-error" role="alert">{{ errors()['export'] }}</p> }
          <div class="tf-form-actions"><button type="button" class="tf-button tf-button-secondary" (click)="exportData()" [disabled]="busy() === 'export'">{{ t('settings_export_data', 'Export my data') }}</button></div>
        </section>

        <!-- Delete -->
        <section class="tf-acct-card tf-acct-card--danger" aria-labelledby="acct-delete-title" data-testid="acct-delete">
          <h2 id="acct-delete-title">{{ t('acct_delete', 'Delete your account') }}</h2>
          <p class="tf-acct-muted">{{ t('acct_delete_hint', 'Your account is closed and you are signed out everywhere. Records Tafseel must keep (payments, orders, disputes) stay, without your profile. You cannot delete while you have work in progress, an open dispute, a withdrawal or a balance.') }}</p>
          <form class="tf-acct-form" (ngSubmit)="deleteAccount()" novalidate>
            <div class="tf-field">
              <label for="acct-delete-password">{{ t('acct_delete_password', 'Your password, to confirm') }}</label>
              <input id="acct-delete-password" name="deletePassword" type="password" autocomplete="current-password" maxlength="128"
                     [ngModel]="deletePassword()" (ngModelChange)="deletePassword.set($event)" data-testid="acct-delete-password">
            </div>
            @if (errors()['delete']) { <p class="tf-field-error" role="alert" data-testid="acct-delete-error">{{ errors()['delete'] }}</p> }
            <div class="tf-form-actions"><button type="submit" class="tf-button tf-button-danger" [disabled]="busy() === 'delete'" data-testid="acct-delete-submit">{{ t('acct_delete_submit', 'Delete my account') }}</button></div>
          </form>
        </section>

        <p class="tf-acct-muted">{{ t('acct_help', 'Something else?') }} <a routerLink="/help">{{ t('nav_help_reports', 'Help and reports') }}</a></p>
      </div>
    </tf-workspace-shell>
    <tf-toast />
  `,
  styles: [`
    .tf-acct { display: grid; gap: 16px; max-width: 760px; }
    .tf-acct-head h1 { margin: 0 0 4px; font-size: var(--type-page-title-size); font-weight: var(--weight-heavy, 800); }
    .tf-acct-head p { margin: 0; color: var(--text-2); }
    .tf-acct-card { display: grid; gap: 12px; padding: 20px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); }
    .tf-acct-card h2 { margin: 0; font-size: var(--type-item-title-size); }
    .tf-acct-card--danger { border-color: color-mix(in oklab, var(--error) 40%, var(--border)); }
    .tf-acct-form { display: grid; gap: 12px; }
    .tf-acct-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .tf-acct-muted { margin: 0; color: var(--text-2); font-size: var(--type-label-size); line-height: 1.6; }
    .tf-acct-avatar { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; }
    .tf-acct-avatar img { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; background: var(--surface-2); border: 1px solid var(--border); }
    .tf-acct-avatar-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .tf-acct-file { position: relative; min-height: 44px; }
    .tf-acct-file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .tf-acct-file.is-disabled { opacity: .6; pointer-events: none; }
    .tf-acct-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .tf-acct-list li { display: flex; gap: 12px; align-items: center; justify-content: space-between; min-height: 52px; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--r-md); }
    .tf-acct-list li[data-current=true] { border-color: var(--primary); }
    .tf-acct-list span { display: grid; gap: 2px; }
    .tf-acct-list small { color: var(--text-2); }
  `]
})
export class AccountSettingsPageComponent {
  private readonly gateway = inject(AccountSettingsGateway);
  private readonly session = inject(SESSION_STORE);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly files = inject(ProtectedFile);
  private readonly router = inject(Router);
  private readonly fmt = inject(FormatService);
  readonly locale = inject(LocaleService);
  readonly styles = EXPLANATION_STYLES;

  readonly shellRole = computed(() => helpShellRole(this.session.current()?.roles));
  readonly isStudent = computed(() => this.session.current()?.roles.includes('Student') ?? false);
  readonly fullName = signal('');
  readonly fullNameEnglish = signal('');
  readonly email = signal('');
  readonly hasAvatar = signal(false);
  readonly avatarStamp = signal(Date.now());
  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly devices = signal<readonly SignInDevice[]>([]);
  readonly notify = signal<NotificationSettings>({ inAppEnabled: true, emailEnabled: true });
  readonly learning = signal<LearningSettings>({ explanationStyle: null, languageId: null, version: null });
  readonly languages = signal<readonly LanguageOption[]>([]);
  readonly deletePassword = signal('');
  private readonly profileBaseline = signal(JSON.stringify(['', '']));
  private readonly learningBaseline = signal(JSON.stringify([null, null]));
  readonly unsavedChanges = injectUnsavedChanges(() => !!this.session.current() && (
    this.profileBaseline() !== JSON.stringify([this.fullName().trim(), this.fullNameEnglish().trim()]) ||
    this.learningBaseline() !== JSON.stringify([this.learning().explanationStyle, this.learning().languageId]) ||
    !!this.currentPassword() || !!this.newPassword() || !!this.deletePassword()
  ));
  readonly busy = signal<Section | ''>('');
  readonly errors = signal<Partial<Record<Section, string>>>({});
  readonly otherDevices = computed(() => this.devices().filter(d => !d.isCurrent).length);
  readonly avatarUrl = computed(() =>
    this.fmt.avatarUrl(this.session.current()?.userId, this.hasAvatar(), this.avatarStamp(), this.isStudent() ? 'student' : 'teacher'));

  constructor() {
    inject(Title).setTitle(`${this.t('acct_title', 'Account settings')} — Tafseel`);
    void this.load();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  when(value: string): string { return value ? this.fmt.date(value, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
  languageName(l: LanguageOption): string { return this.locale.lang() === 'ar' && l.nameAr ? l.nameAr : l.name; }

  async load(): Promise<void> {
    await Promise.all([
      this.guard('profile', async () => {
        const me = await this.gateway.me();
        this.fullName.set(me.fullName); this.fullNameEnglish.set(me.fullNameEnglish);
        this.profileBaseline.set(JSON.stringify([me.fullName.trim(), me.fullNameEnglish.trim()]));
        this.email.set(me.email); this.hasAvatar.set(me.hasAvatar);
      }),
      this.guard('devices', async () => this.devices.set(await this.gateway.devices())),
      this.guard('notifications', async () => this.notify.set(await this.gateway.notifications())),
      this.isStudent() ? this.guard('learning', async () => {
        const [learning, languages] = await Promise.all([this.gateway.learning(), this.gateway.languages()]);
        this.learning.set(learning); this.languages.set(languages);
        this.learningBaseline.set(JSON.stringify([learning.explanationStyle, learning.languageId]));
      }) : Promise.resolve()
    ]);
  }

  async saveProfile(): Promise<void> {
    const name = this.fullName().trim();
    if (!name) { this.setError('profile', this.t('acct_name_required', 'Enter your name.')); return; }
    await this.run('profile', async () => {
      const english = this.fullNameEnglish().trim();
      await this.gateway.saveProfile(name, english);
      this.profileBaseline.set(JSON.stringify([name, english]));
      this.updateSession({ fullName: name, fullNameEnglish: english });
      this.toasts.show(this.t('acct_saved', 'Saved.'));
    });
  }

  async uploadAvatar(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { this.setError('avatar', this.t('acct_photo_too_big', 'Choose an image of 2 MB or less.')); return; }
    await this.run('avatar', async () => {
      await this.gateway.uploadAvatar(file);
      this.hasAvatar.set(true);
      this.avatarStamp.set(Date.now());
      this.updateSession({ hasAvatar: true });
      this.toasts.show(this.t('acct_photo_saved', 'Photo updated.'));
    });
  }

  async removeAvatar(): Promise<void> {
    await this.run('avatar', async () => {
      await this.gateway.removeAvatar();
      this.hasAvatar.set(false);
      this.updateSession({ hasAvatar: false });
      this.toasts.show(this.t('acct_photo_removed', 'Photo removed.'));
    });
  }

  async changePassword(): Promise<void> {
    if (!this.currentPassword() || this.newPassword().length < 10) {
      this.setError('password', this.t('acct_password_invalid', 'Enter your current password and a new one of at least 10 characters.'));
      return;
    }
    const confirmed = await this.dialogs.confirm({
      title: this.t('acct_password_confirm_title', 'Change your password?'),
      body: this.t('acct_password_signout', 'Changing your password signs you out everywhere, including here. Sign in again with the new password.'),
      confirmLabel: this.t('acct_password_change', 'Change password'), cancelLabel: this.t('common_cancel', 'Cancel')
    });
    if (!confirmed) return;
    await this.run('password', async () => {
      await this.gateway.changePassword(this.currentPassword(), this.newPassword());
      this.session.set(null);
      await this.router.navigate(['/auth'], { queryParams: { notice: 'password-changed' } });
    });
  }

  async signOutDevice(device: SignInDevice): Promise<void> {
    await this.run('devices', async () => {
      await this.gateway.signOutDevice(device.id);
      this.devices.set(await this.gateway.devices());
      this.toasts.show(this.t('acct_device_signed_out', 'That device is signed out.'));
    });
  }

  async signOutOthers(): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: this.t('acct_sign_out_others_title', 'Sign out all other devices?'),
      body: this.t('acct_sign_out_others_body', 'Every other phone, tablet or computer signed in to your account is signed out. This device stays signed in.'),
      confirmLabel: this.t('acct_sign_out_others', 'Sign out all other devices'), cancelLabel: this.t('common_cancel', 'Cancel')
    });
    if (!confirmed) return;
    await this.run('devices', async () => {
      const n = await this.gateway.signOutOthers();
      this.devices.set(await this.gateway.devices());
      this.toasts.show(this.locale.format('acct_signed_out_others', { n }, 'Signed out {n} other device(s).'));
    });
  }

  async setNotify(field: keyof NotificationSettings, value: boolean): Promise<void> {
    const next = { ...this.notify(), [field]: value };
    const previous = this.notify();
    this.notify.set(next);
    await this.run('notifications', async () => {
      try { await this.gateway.saveNotifications(next); }
      catch (error) { this.notify.set(previous); throw error; }
      this.toasts.show(this.t('acct_saved', 'Saved.'));
    });
  }

  setLearning(field: 'explanationStyle' | 'languageId', value: string | null): void {
    this.learning.update(l => ({ ...l, [field]: value || null }));
  }

  async saveLearning(): Promise<void> {
    await this.run('learning', async () => {
      const submitted = this.learning();
      const saved = await this.gateway.saveLearning(submitted);
      this.learningBaseline.set(JSON.stringify([saved.explanationStyle, saved.languageId]));
      if (JSON.stringify([this.learning().explanationStyle, this.learning().languageId]) === JSON.stringify([submitted.explanationStyle, submitted.languageId])) this.learning.set(saved);
      else this.learning.update(current => ({ ...current, version: saved.version }));
      this.toasts.show(this.t('acct_saved', 'Saved.'));
    });
  }

  async exportData(): Promise<void> {
    await this.run('export', () => this.files.open('/api/v1/auth/privacy/export', { download: true, fileName: 'tafseel-account-data.json' }));
  }

  async deleteAccount(): Promise<void> {
    if (!this.deletePassword()) { this.setError('delete', this.t('acct_delete_password_required', 'Enter your password to confirm.')); return; }
    const confirmed = await this.dialogs.confirm({
      title: this.t('acct_delete_confirm_title', 'Delete your account?'),
      body: this.t('acct_delete_confirm_body', 'This cannot be undone. You are signed out everywhere and cannot sign in to this account again.'),
      confirmLabel: this.t('acct_delete_submit', 'Delete my account'), cancelLabel: this.t('common_cancel', 'Cancel'), destructive: true
    });
    if (!confirmed) return;
    await this.run('delete', async () => {
      await this.gateway.deleteAccount(this.deletePassword());
      this.session.set(null);
      await this.router.navigate(['/'], { queryParams: { notice: 'account-deleted' } });
    });
  }

  private updateSession(change: Partial<{ fullName: string; fullNameEnglish: string; hasAvatar: boolean }>): void {
    const current = this.session.current();
    if (current) this.session.set({ ...current, ...change });
  }

  private setError(section: Section, message: string): void {
    this.errors.update(e => ({ ...e, [section]: message }));
  }

  private async guard(section: Section, action: () => Promise<unknown>): Promise<void> {
    try { await action(); } catch (error) { this.setError(section, problemMessage(error, (k, f) => this.t(k, f)).text); }
  }

  private async run(section: Section, action: () => Promise<unknown>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(section);
    this.errors.update(e => ({ ...e, [section]: '' }));
    try { await action(); }
    catch (error) { this.setError(section, problemMessage(error, (k, f) => this.t(k, f)).text); }
    finally { this.busy.set(''); }
  }
}
