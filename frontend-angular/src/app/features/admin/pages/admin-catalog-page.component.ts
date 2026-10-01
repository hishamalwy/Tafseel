import { ChangeDetectionStrategy, Component, WritableSignal, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { FormatService } from '@core/i18n/format.service';
import { LocaleService } from '@core/i18n/locale.service';
import { ToastComponent } from '@shared/components/toast.component';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { DialogService } from '@shared/services/dialog.service';
import { ToastService } from '@shared/services/toast.service';
import {
  CATALOG_KINDS, Catalog, CatalogKind, CatalogService, EducationLevel, LIVE_DURATIONS, Language, LanguageDraft, LanguageForm,
  LevelDraft, LevelForm, Problems, QualificationDraft, QualificationForm, QualificationTopic, ResourceDraft, ResourceForm,
  ServiceDraft, ServiceForm, Subject, SubjectDraft, SubjectForm, TOPIC_LEVELS, Topic, TopicDraft, TopicForm
} from '../models/catalog';
import { CatalogSnapshot, LoadCatalog, ManageCatalog } from '../services/admin-catalog.use-cases';

/** Which form is open: a new item, an existing one, or a link resource for a qualification topic. */
type OpenForm = { readonly kind: CatalogKind | 'resource'; readonly id: string | null } | null;

/** Admin catalog and pricing (J13-01..03, PROD-01, OPS-04). */
@Component({
  selector: 'tf-admin-catalog-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgTemplateOutlet, WorkspaceShellComponent, ToastComponent],
  templateUrl: './admin-catalog-page.component.html'
})
export class AdminCatalogPageComponent {
  private readonly load = inject(LoadCatalog);
  private readonly manage = inject(ManageCatalog);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly locale = inject(LocaleService);
  readonly fmt = inject(FormatService);
  readonly kinds = CATALOG_KINDS;
  readonly durations = LIVE_DURATIONS;
  readonly levels = TOPIC_LEVELS;

  readonly snapshot = signal<CatalogSnapshot | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly tab = signal<CatalogKind>(this.kindFrom(this.route.snapshot.queryParamMap.get('tab')));
  readonly subjectFilter = signal('');
  readonly form = signal<OpenForm>(null);
  readonly attempted = signal(false);

  readonly serviceDraft = signal<ServiceDraft>(ServiceForm.empty());
  readonly subjectDraft = signal<SubjectDraft>(SubjectForm.empty());
  readonly qualificationDraft = signal<QualificationDraft>(QualificationForm.empty());
  readonly topicDraft = signal<TopicDraft>(TopicForm.empty());
  readonly levelDraft = signal<LevelDraft>(LevelForm.empty());
  readonly languageDraft = signal<LanguageDraft>(LanguageForm.empty());
  readonly resourceDraft = signal<ResourceDraft>(ResourceForm.empty());

  readonly services = computed(() => this.snapshot()?.services ?? []);
  readonly subjects = computed(() => this.snapshot()?.subjects ?? []);
  readonly openSubjects = computed(() => Catalog.openSubjectIds(this.snapshot()?.qualificationTopics ?? []));
  readonly qualificationTopics = computed(() => this.bySubject(this.snapshot()?.qualificationTopics ?? []));
  readonly topics = computed(() => this.bySubject(this.snapshot()?.topics ?? []));
  readonly educationLevels = computed(() => this.snapshot()?.levels ?? []);
  readonly languages = computed(() => this.snapshot()?.languages ?? []);
  /** Active subjects no teacher can apply to yet, so the Admin knows what is missing. */
  readonly closedSubjects = computed(() => this.subjects().filter(s => s.isActive && !this.openSubjects().has(s.id)));

  readonly problems = computed<Problems<any>>(() => {
    const open = this.form();
    if (!open || !this.attempted()) return {};
    const editing = open.id !== null;
    switch (open.kind) {
      case 'services': return ServiceForm.problems(this.serviceDraft());
      case 'subjects': return SubjectForm.problems(this.subjectDraft());
      case 'qualification-topics': return QualificationForm.problems(this.qualificationDraft(), editing);
      case 'topics': return TopicForm.problems(this.topicDraft(), editing);
      case 'education-levels': return LevelForm.problems(this.levelDraft());
      case 'languages': return LanguageForm.problems(this.languageDraft());
      case 'resource': return ResourceForm.problems(this.resourceDraft());
    }
  });

  constructor() {
    inject(Title).setTitle(`${this.t('admin_catalog_title', 'Catalog & pricing')} — Tafseel`);
    void this.refresh();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  problem(field: string): string { const key = this.problems()[field]; return key ? this.t(key, '') : ''; }
  isAr(): boolean { return this.locale.lang() === 'ar'; }
  pick(en: string, ar: string): string { return (this.isAr() ? ar || en : en || ar) || '—'; }
  subjectName(id: string): string {
    const s = this.subjects().find(x => x.id === id);
    return s ? this.pick(s.nameEn, s.nameAr) : '—';
  }
  money(value: number): string { return this.fmt.money(value, 'SAR'); }
  /** Older subjects stored a word ("book") where an emoji now goes; only an emoji is drawn. */
  isEmoji(icon: string): boolean { return /\p{Extended_Pictographic}/u.test(icon); }
  /** A demo length as m:ss. */
  clock(seconds: number): string { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
  count(rows: readonly { subjectId: string; isActive: boolean }[], subjectId: string): number {
    return rows.filter(r => r.subjectId === subjectId && r.isActive).length;
  }
  topicCount(subjectId: string): number { return this.count(this.snapshot()?.topics ?? [], subjectId); }
  qualificationCount(subjectId: string): number { return this.count(this.snapshot()?.qualificationTopics ?? [], subjectId); }
  tabLabel(kind: CatalogKind): string {
    const labels: Record<CatalogKind, [string, string]> = {
      services: ['admin_catalog_tab_services', 'Services & prices'],
      subjects: ['admin_catalog_tab_subjects', 'Subjects'],
      'qualification-topics': ['admin_catalog_tab_qualification', 'Qualification topics'],
      topics: ['admin_catalog_tab_topics', 'Specialist topics'],
      'education-levels': ['admin_catalog_tab_levels', 'Education levels'],
      languages: ['admin_catalog_tab_languages', 'Teaching languages']
    };
    return this.t(...labels[kind]);
  }

  chooseTab(kind: CatalogKind): void {
    this.tab.set(kind);
    this.close();
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab: kind }, replaceUrl: true });
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try { this.snapshot.set(await this.load.execute()); }
    catch (error) { this.loadError.set(problemMessage(error, (k, f) => this.t(k, f)).text); }
    finally { this.loading.set(false); }
  }

  // ---- forms ----
  openNew(kind: CatalogKind, isLive = false): void {
    this.error.set('');
    this.attempted.set(false);
    const subject = this.subjectFilter();
    switch (kind) {
      case 'services': this.serviceDraft.set(ServiceForm.empty(isLive)); break;
      case 'subjects': this.subjectDraft.set(SubjectForm.empty()); break;
      case 'qualification-topics': this.qualificationDraft.set(QualificationForm.empty(subject)); break;
      case 'topics': this.topicDraft.set(TopicForm.empty(subject)); break;
      case 'education-levels': this.levelDraft.set(LevelForm.empty()); break;
      case 'languages': this.languageDraft.set(LanguageForm.empty()); break;
    }
    this.form.set({ kind, id: null });
  }

  edit(kind: CatalogKind, row: CatalogService | Subject | QualificationTopic | Topic | EducationLevel | Language): void {
    this.error.set('');
    this.attempted.set(false);
    switch (kind) {
      case 'services': this.serviceDraft.set(ServiceForm.from(row as CatalogService)); break;
      case 'subjects': this.subjectDraft.set(SubjectForm.from(row as Subject)); break;
      case 'qualification-topics': this.qualificationDraft.set(QualificationForm.from(row as QualificationTopic)); break;
      case 'topics': this.topicDraft.set(TopicForm.from(row as Topic)); break;
      case 'education-levels': this.levelDraft.set(LevelForm.from(row as EducationLevel)); break;
      case 'languages': this.languageDraft.set(LanguageForm.from(row as Language)); break;
    }
    this.form.set({ kind, id: row.id });
  }

  openResource(topic: QualificationTopic): void {
    this.error.set('');
    this.attempted.set(false);
    this.resourceDraft.set(ResourceForm.empty());
    this.form.set({ kind: 'resource', id: topic.id });
  }

  close(): void { this.form.set(null); this.attempted.set(false); this.error.set(''); }
  isOpen(kind: CatalogKind | 'resource', id: string | null = null): boolean {
    const open = this.form();
    return !!open && open.kind === kind && open.id === id;
  }

  /** Sets one field of a draft; number fields turn an empty box into null rather than 0. */
  set<T extends object>(draft: WritableSignal<T>, field: keyof T, value: unknown, numeric = false): void {
    const parsed = numeric ? (value === '' || value === null || value === undefined ? null : Number(value)) : value;
    draft.update(d => ({ ...d, [field]: parsed }));
  }

  toggleDuration(minutes: number): void {
    this.serviceDraft.update(d => ({
      ...d, durations: d.durations.includes(minutes) ? d.durations.filter(x => x !== minutes) : [...d.durations, minutes]
    }));
  }

  async save(): Promise<void> {
    const open = this.form();
    if (!open || this.busy()) return;
    this.attempted.set(true);
    if (Object.keys(this.problems()).length) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.persist(open.kind, open.id);
      this.toasts.show(this.t('admin_catalog_saved', 'Saved.'));
      this.close();
      await this.refresh();
    } catch (error) {
      this.error.set(problemMessage(error, (k, f) => this.t(k, f)).text || this.t('admin_catalog_save_failed', 'This could not be saved.'));
    } finally {
      this.busy.set(false);
    }
  }

  private async persist(kind: CatalogKind | 'resource', id: string | null): Promise<void> {
    const snapshot = this.snapshot();
    switch (kind) {
      case 'services': {
        const existing = snapshot?.services.find(s => s.id === id) ?? null;
        const order = Catalog.nextOrder(snapshot?.services.map(s => Number(s.carry['displayOrder']) || 0) ?? []);
        const body = ServiceForm.payload(this.serviceDraft(), existing, existing?.isActive ?? true, order);
        return id ? this.manage.updateService(id, body) : void await this.manage.create('services', body);
      }
      case 'subjects': {
        const existing = snapshot?.subjects.find(s => s.id === id);
        const order = existing?.displayOrder ?? Catalog.nextOrder(snapshot?.subjects.map(s => s.displayOrder) ?? []);
        return id ? this.manage.update('subjects', id, SubjectForm.update(this.subjectDraft(), order))
          : void await this.manage.create('subjects', SubjectForm.create(this.subjectDraft(), order));
      }
      case 'qualification-topics': {
        const siblings = snapshot?.qualificationTopics.filter(t => t.subjectId === this.qualificationDraft().subjectId).length ?? 0;
        const order = (siblings + 1) * 10;
        return id ? this.manage.update('qualification-topics', id, QualificationForm.update(this.qualificationDraft()))
          : void await this.manage.create('qualification-topics', QualificationForm.create(this.qualificationDraft(), order));
      }
      case 'topics':
        return id ? this.manage.update('topics', id, TopicForm.update(this.topicDraft()))
          : void await this.manage.create('topics', TopicForm.create(this.topicDraft()));
      case 'education-levels':
        return id ? this.manage.update('education-levels', id, LevelForm.payload(this.levelDraft()))
          : void await this.manage.create('education-levels', LevelForm.payload(this.levelDraft()));
      case 'languages':
        return id ? this.manage.update('languages', id, LanguageForm.payload(this.languageDraft()))
          : void await this.manage.create('languages', LanguageForm.payload(this.languageDraft()));
      case 'resource':
        return void await this.manage.addLinkResource(id!, ResourceForm.payload(this.resourceDraft()));
    }
  }

  /** Turning something off is confirmed, and says who loses it; turning it on is not. */
  async toggle(kind: CatalogKind, row: { id: string; isActive: boolean }, name: string, teacherCount = 0): Promise<void> {
    if (this.busy()) return;
    if (row.isActive) {
      const body = kind === 'services' && teacherCount > 0
        ? this.locale.format('admin_catalog_disable_service_body', { name, n: teacherCount },
            '{name} is offered by {n} teachers. Turning it off hides it from them and from students.')
        : this.locale.format('admin_catalog_disable_body', { name }, 'Turn off {name}? It stops being offered until you turn it on again.');
      const confirmed = await this.dialogs.confirm({
        body, confirmLabel: this.t('common_disable', 'Disable'), cancelLabel: this.t('common_cancel', 'Cancel'), destructive: true
      });
      if (!confirmed) return;
    }
    this.busy.set(true);
    try {
      await this.manage.setActive(kind, row.id, !row.isActive);
      await this.refresh();
    } catch (error) {
      this.toasts.show(problemMessage(error, (k, f) => this.t(k, f)).text || this.t('admin_catalog_save_failed', 'This could not be saved.'));
    } finally {
      this.busy.set(false);
    }
  }

  private bySubject<T extends { subjectId: string }>(rows: readonly T[]): readonly T[] {
    const subject = this.subjectFilter();
    return subject ? rows.filter(r => r.subjectId === subject) : rows;
  }

  private kindFrom(value: string | null): CatalogKind {
    return (CATALOG_KINDS as readonly string[]).includes(value ?? '') ? value as CatalogKind : 'services';
  }
}
