import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { ToastComponent } from '@shared/components/toast.component';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import { Blocker, Readiness } from '../models/readiness';
import { LoadPublication, PublicationWorkspace, SetPublication } from '../services/teacher-setup.use-cases';

/**
 * Publication readiness (J11-09): the server's blockers, each linked to the screen that
 * fixes it, and the publish switch, enabled only when the server says the teacher is ready.
 */
@Component({
  selector: 'tf-teacher-publication-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, WorkspaceShellComponent, ToastComponent],
  templateUrl: './teacher-publication-page.component.html',
  styles: `
    .tf-readiness { display: grid; gap: 18px; max-width: 860px; }
    .tf-readiness-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .tf-readiness-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px;
      border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface); font-size: 14px; }
    .tf-readiness-list li[data-done="true"] { color: var(--text-2); }
    .tf-readiness-mark { display: inline-grid; place-items: center; width: 22px; height: 22px; margin-inline-end: 10px; border-radius: 50%;
      border: 1px solid var(--border-strong); font-size: 12px; font-weight: 800; flex: none; }
    [data-done="true"] .tf-readiness-mark { background: var(--success); border-color: var(--success); color: var(--primary-ink); }
    .tf-readiness-list a { font-size: 13px; font-weight: 700; white-space: nowrap; }
  `
})
export class TeacherPublicationPageComponent {
  private readonly load = inject(LoadPublication);
  private readonly publication = inject(SetPublication);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  readonly locale = inject(LocaleService);

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly actionError = signal('');
  readonly busy = signal(false);
  readonly workspace = signal<PublicationWorkspace | null>(null);
  readonly blockers = computed<readonly Blocker[]>(() => { const w = this.workspace(); return w ? Readiness.blockers(w.state) : []; });
  readonly steps = computed(() => { const w = this.workspace(); return w ? Readiness.steps(w.state) : []; });
  readonly canPublish = computed(() => { const w = this.workspace(); return !!w && Readiness.canPublish(w.state); });
  readonly switchedOn = computed(() => { const w = this.workspace(); return !!w && Readiness.switchedOn(w.state); });
  readonly visible = computed(() => !!this.workspace()?.state.isPublished);

  constructor() {
    inject(Title).setTitle(`${this.t('setup_publication_title', 'Publication')} — Tafseel`);
    void this.refresh();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try { this.workspace.set(await this.load.execute()); }
    catch (error) { this.loadError.set(problemMessage(error, (k, f) => this.t(k, f)).text); }
    finally { this.loading.set(false); }
  }

  async publish(published: boolean): Promise<void> {
    if (this.busy() || (published && !this.canPublish())) return;
    if (!published && !await this.dialogs.confirm({
      title: this.t('setup_unpublish_title', 'Hide your profile?'),
      body: this.t('setup_unpublish_body', 'Students will no longer find you in the marketplace. Work already in progress continues.'),
      confirmLabel: this.t('setup_unpublish', 'Unpublish'), cancelLabel: this.t('common_cancel', 'Cancel'), destructive: true
    })) return;
    this.busy.set(true);
    this.actionError.set('');
    try {
      await this.publication.execute(published);
      await this.refresh();
      this.toasts.show(published
        ? this.t('setup_published', 'Your profile is published. Students can find you now.')
        : this.t('setup_unpublished', 'Your profile is hidden from the marketplace.'));
    } catch (error) {
      this.actionError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
      await this.refresh();
    } finally {
      this.busy.set(false);
    }
  }
}
