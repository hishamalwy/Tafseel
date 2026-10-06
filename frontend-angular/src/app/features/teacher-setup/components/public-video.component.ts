import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ProtectedFile, ProtectedObjectUrl } from '@core/http/protected-file.service';
import { problemMessage } from '@core/http/problem-message';
import { LocaleService } from '@core/i18n/locale.service';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { DialogService } from '@shared/services/dialog.service';
import { ApplicationVideo, IntroVideo, NO_INTRO_VIDEO } from '../models/readiness';
import { ManagePublicVideo } from '../services/teacher-setup.use-cases';

/**
 * The one public introduction video (PRODUCT-P1, DEC-UX-01/02).
 *
 * Optional. The teacher uploads their own (scanned, and hidden until they have watched it and choose to show it),
 * or reuses a video they recorded for an application — which is private review material, so that happens only
 * after they tick the exact consent sentence the server records. The profile shows no video, or exactly this one.
 */
@Component({
  selector: 'tf-public-video',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="tf-profile-editor-card tf-intro" id="public-video" aria-labelledby="public-video-title" data-testid="public-video">
      <header class="tf-intro-head">
        <h2 id="public-video-title">{{ t('intro_title', 'Introduction video (optional)') }}</h2>
        <p>{{ t('intro_lead', 'One short video on your public profile, so students can hear how you explain. Your profile can be published without one.') }}</p>
      </header>

      @if (error()) { <div class="tf-alert" data-kind="error" role="alert">{{ error() }}</div> }
      @if (notice()) { <div class="tf-alert" data-kind="success" role="status" data-testid="intro-notice">{{ notice() }}</div> }

      @if (loading()) {
        <div class="tf-state" data-state="loading" role="status">{{ t('common_loading', 'Loading…') }}</div>
      } @else {
        @if (intro().source; as source) {
          <div class="tf-intro-current" data-testid="intro-current" [attr.data-public]="intro().isPublic">
            <div class="tf-intro-status">
              <span class="tf-badge" [attr.data-tone]="intro().isPublic ? 'success' : 'neutral'" data-testid="intro-status">
                {{ intro().isPublic ? t('intro_status_shown', 'Shown on your profile') : t('intro_status_hidden', 'Hidden — only you can see it') }}
              </span>
              <small>{{ source === 'upload'
                ? locale.format('intro_source_upload', { name: intro().fileName ?? '' }, 'Your upload: {name}')
                : intro().isPublic
                  ? t('intro_source_application', 'Your application video, shown with your consent')
                  : t('intro_source_application_hidden', 'Your application video. Showing it again needs your agreement below.') }}</small>
            </div>
            @if (preview(); as p) {
              <video class="tf-intro-player" [src]="p.url" controls playsinline preload="metadata" data-testid="intro-preview"
                     [attr.aria-label]="t('intro_preview_label', 'Preview of your introduction video')"></video>
            } @else {
              <button type="button" class="tf-button tf-button-secondary" (click)="loadPreview()" [disabled]="busy()" data-testid="intro-watch">
                {{ t('intro_watch', 'Watch it') }}
              </button>
            }
            <div class="tf-form-actions">
              @if (intro().isPublic) {
                <button type="button" class="tf-button tf-button-ghost" (click)="setVisible(false)" [disabled]="busy()" data-testid="intro-hide">{{ t('intro_hide', 'Hide from my profile') }}</button>
              } @else if (source === 'upload') {
                <button type="button" class="tf-button" (click)="setVisible(true)" [disabled]="busy()" data-testid="intro-show">{{ t('intro_show', 'Show on my profile') }}</button>
              }
              <button type="button" class="tf-button tf-button-ghost" (click)="remove()" [disabled]="busy()" data-testid="intro-remove">{{ t('intro_remove', 'Remove video') }}</button>
            </div>
          </div>
        }

        <div class="tf-intro-options">
          <div class="tf-intro-option">
            <h3>{{ intro().source === 'upload' ? t('intro_replace_title', 'Replace it with another video') : t('intro_upload_title', 'Upload a video') }}</h3>
            <p class="tf-intro-hint">{{ t('intro_upload_hint', 'MP4 or WebM, up to 250 MB. Every upload is checked for harmful files. A new video stays hidden until you show it.') }}</p>
            <label class="tf-button tf-button-secondary tf-intro-file" [class.is-disabled]="busy()">
              <input type="file" accept=".mp4,.webm,video/mp4,video/webm" (change)="upload($event)" [disabled]="busy()" data-testid="intro-file">
              {{ t('intro_choose_file', 'Choose a video') }}
            </label>
            @if (progress() !== null) {
              <div class="tf-intro-progress" role="progressbar" [attr.aria-valuenow]="progress()" aria-valuemin="0" aria-valuemax="100"
                   [attr.aria-label]="t('intro_uploading', 'Uploading')"><span [style.transform]="'scaleX(' + (progress() ?? 0) / 100 + ')'"></span></div>
            }
          </div>

          @if (unusedApplicationVideos().length) {
            <div class="tf-intro-option" data-testid="intro-application">
              <h3>{{ t('intro_reuse_title', 'Or use a video from your application') }}</h3>
              <p class="tf-intro-hint">{{ t('intro_reuse_hint', 'Only Tafseel’s quality team has seen these. Nobody else will, unless you agree below.') }}</p>
              <fieldset class="tf-intro-choices">
                <legend class="tf-sr-only">{{ t('intro_reuse_title', 'Or use a video from your application') }}</legend>
                @for (v of unusedApplicationVideos(); track v.sampleId) {
                  <label class="tf-intro-choice" [attr.data-testid]="'intro-app-' + v.sampleId">
                    <input type="radio" name="intro-app" [value]="v.sampleId" [checked]="chosen() === v.sampleId" (change)="choose(v)">
                    <span><strong>{{ subjectName(v) }}</strong> @if (videoTitle(v); as title) { <small>{{ title }}</small> }</span>
                    <button type="button" class="tf-link-button" (click)="watchApplication(v)" [disabled]="busy()">{{ t('intro_watch', 'Watch it') }}</button>
                  </label>
                }
              </fieldset>
              @if (chosen()) {
                <label class="tf-intro-consent">
                  <input type="checkbox" [checked]="consent()" (change)="consent.set($any($event.target).checked)" data-testid="intro-consent">
                  <span>{{ t('intro_consent', 'I agree that the video I recorded for my teaching application is shown to everyone on my public Tafseel profile.') }}</span>
                </label>
                <button type="button" class="tf-button" (click)="useApplication()" [disabled]="busy() || !consent()" data-testid="intro-use-application">
                  {{ t('intro_use_application', 'Show this video on my profile') }}
                </button>
              }
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .tf-intro { display: grid; gap: 16px; }
    .tf-intro-head h2 { margin: 0 0 4px; }
    .tf-intro-head p, .tf-intro-hint { margin: 0; color: var(--text-2); font-size: var(--type-body-sm-size); line-height: 1.6; }
    .tf-intro-current { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface-2); }
    .tf-intro-status { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .tf-intro-status small { color: var(--text-2); overflow-wrap: anywhere; }
    .tf-intro-player { width: 100%; max-height: 360px; border-radius: var(--r-md); background: #000; }
    .tf-intro-options { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .tf-intro-option { display: grid; gap: 10px; align-content: start; padding: 16px; border: 1px dashed var(--border-strong); border-radius: var(--r-lg); }
    .tf-intro-option h3 { margin: 0; font-size: var(--type-body-size); }
    .tf-intro-file { position: relative; justify-self: start; min-height: 44px; }
    .tf-intro-file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .tf-intro-file.is-disabled { opacity: .6; pointer-events: none; }
    .tf-intro-progress { height: 6px; border-radius: 999px; background: var(--surface-3, var(--border)); overflow: hidden; }
    .tf-intro-progress span { display: block; height: 100%; background: var(--brand); transform-origin: left; transition: transform .2s ease; }
    :host-context([dir="rtl"]) .tf-intro-progress span { transform-origin: right; }
    .tf-intro-choices { display: grid; gap: 8px; margin: 0; padding: 0; border: 0; }
    .tf-intro-choice { display: flex; gap: 10px; align-items: center; min-height: 44px; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--r-md); }
    .tf-intro-choice span { flex: 1; display: grid; }
    .tf-intro-choice small { color: var(--text-2); }
    .tf-intro-consent { display: flex; gap: 10px; align-items: flex-start; font-size: var(--type-body-sm-size); line-height: 1.6; }
    .tf-intro-consent input { margin-top: 4px; min-width: 18px; min-height: 18px; }
    .tf-link-button { border: 0; background: none; color: var(--brand); font: inherit; font-weight: 600; cursor: pointer; min-height: 44px; padding: 0 4px; }
  `]
})
export class PublicVideoComponent {
  private readonly manage = inject(ManagePublicVideo);
  private readonly dialogs = inject(DialogService);
  private readonly files = inject(ProtectedFile);
  private readonly session = inject(SESSION_STORE);
  readonly locale = inject(LocaleService);

  readonly intro = signal<IntroVideo>(NO_INTRO_VIDEO);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly progress = signal<number | null>(null);
  readonly preview = signal<ProtectedObjectUrl | null>(null);
  readonly chosen = signal<string | null>(null);
  readonly consent = signal(false);
  // A hidden application intro can be shown again only by agreeing again, so it is offered again.
  readonly unusedApplicationVideos = computed(() => this.intro().applicationVideos.filter(v => !v.inUse || !this.intro().isPublic));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.preview()?.revoke());
    void this.refresh();
  }

  t(key: string, fallback: string): string { return this.locale.t(key, fallback); }

  /** Arabic readers see the Arabic assignment title, or none — never the English one. */
  videoTitle(v: ApplicationVideo): string {
    return this.locale.lang() === 'ar' ? v.titleAr : v.title;
  }

  subjectName(v: ApplicationVideo): string {
    return this.locale.lang() === 'ar' && v.subjectNameAr ? v.subjectNameAr : v.subjectName;
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try { this.set(await this.manage.load()); } catch (e) { this.fail(e); } finally { this.loading.set(false); }
  }

  choose(v: ApplicationVideo): void {
    this.chosen.set(v.sampleId);
    this.consent.set(false);
  }

  async loadPreview(): Promise<void> {
    const teacherId = this.session.current()?.userId;
    if (!teacherId) return;
    await this.run(async () => {
      const url = await this.files.objectUrl(`/api/v1/teachers/${encodeURIComponent(teacherId)}/intro-video/content`);
      this.preview()?.revoke();
      this.preview.set(url);
    });
  }

  async watchApplication(v: ApplicationVideo): Promise<void> {
    await this.run(() => this.files.open(`/api/v1/teachers/samples/${encodeURIComponent(v.sampleId)}/content`));
  }

  async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.progress.set(0);
    await this.run(async () => {
      this.set(await this.manage.upload(file, this.intro(), p => this.progress.set(p)));
      this.notice.set(this.t('intro_uploaded', 'Uploaded. Watch it, then choose “Show on my profile” when you are happy with it.'));
    });
    this.progress.set(null);
  }

  async useApplication(): Promise<void> {
    const sampleId = this.chosen();
    if (!sampleId || !this.consent()) return;
    await this.run(async () => {
      this.set(await this.manage.useApplicationVideo(sampleId, this.intro()));
      this.notice.set(this.t('intro_now_shown', 'Your introduction video is on your public profile.'));
    });
  }

  async setVisible(visible: boolean): Promise<void> {
    if (!visible) {
      const confirmed = await this.dialogs.confirm({
        title: this.t('intro_hide_title', 'Hide the video from your profile?'),
        body: this.intro().source === 'application'
          ? this.t('intro_hide_application_body', 'Students will no longer see it. To show your application video again, you will be asked to agree again.')
          : this.t('intro_hide_body', 'Students will no longer see it. You can show it again at any time.'),
        confirmLabel: this.t('intro_hide', 'Hide from my profile'), cancelLabel: this.t('common_cancel', 'Cancel')
      });
      if (!confirmed) return;
    }
    await this.run(async () => {
      this.set(await this.manage.setVisible(this.intro(), visible));
      this.notice.set(visible ? this.t('intro_now_shown', 'Your introduction video is on your public profile.')
        : this.t('intro_now_hidden', 'The video is hidden. Your profile shows no video.'));
    });
  }

  async remove(): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: this.t('intro_remove_title', 'Remove the introduction video?'),
      body: this.intro().source === 'upload'
        ? this.t('intro_remove_upload_body', 'The video is deleted and your profile shows no video. You can upload another later.')
        : this.t('intro_remove_application_body', 'Your profile stops showing it and it goes back to being private review material.'),
      confirmLabel: this.t('intro_remove', 'Remove video'), cancelLabel: this.t('common_cancel', 'Cancel'), destructive: true
    });
    if (!confirmed) return;
    await this.run(async () => {
      this.set(await this.manage.remove(this.intro()));
      this.notice.set(this.t('intro_removed', 'Removed. Your profile shows no video.'));
    });
  }

  private set(value: IntroVideo): void {
    this.intro.set(value);
    this.preview()?.revoke();
    this.preview.set(null);
    this.chosen.set(null);
    this.consent.set(false);
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try { await action(); } catch (e) { this.fail(e); } finally { this.busy.set(false); }
  }

  private fail(e: unknown): void {
    this.error.set(problemMessage(e, (k, f) => this.t(k, f)).text);
  }
}
