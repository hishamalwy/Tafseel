import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { LocaleService } from '@core/i18n/locale.service';
import { ProtectedFile } from '@core/http/protected-file.service';
import { ToastService } from '@shared/services/toast.service';
import { ToastComponent } from '@shared/components/toast.component';
import { WorkflowHeaderComponent } from '@shared/layouts/workflow-header.component';
import { Application, SelectableSubject, TeacherApplication, WizardStep, subjectName } from '../models/application';
import { Assignment, DEMO_FILE_PATTERN, QualificationTopic, formatDuration, formatFileSize } from '../models/assignment';
import { LoadQualificationTopics, LoadTeachWorkspace, RefreshApplications, SaveApplicationDetails, SubmitApplication, TeachWorkspace, UploadDemo } from '../services/teach.use-cases';
import { SkipLinkComponent } from '@shared/layouts/skip-link.component';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'tf-teacher-apply-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, WorkflowHeaderComponent, ToastComponent, SkipLinkComponent],
  templateUrl: './teacher-apply-page.component.html',
  styleUrl: './teacher-apply-page.component.css'
})
export class TeacherApplyPageComponent {
  readonly Assignment = Assignment;
  readonly steps: readonly WizardStep[] = ['details', 'demo', 'review'];
  private readonly loader = inject(LoadTeachWorkspace);
  private readonly loadTopics = inject(LoadQualificationTopics);
  private readonly saveDetails = inject(SaveApplicationDetails);
  private readonly uploadDemo = inject(UploadDemo);
  private readonly submitApplication = inject(SubmitApplication);
  private readonly refreshApplications = inject(RefreshApplications);
  private readonly files = inject(ProtectedFile);
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly toasts = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  readonly locale = inject(LocaleService);

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly workspace = signal<TeachWorkspace | null>(null);
  readonly current = signal<TeacherApplication | null>(null);
  readonly topics = signal<readonly QualificationTopic[]>([]);
  readonly step = signal<WizardStep>('details');
  readonly subjectId = signal('');
  readonly topicId = signal('');
  readonly city = signal('');
  readonly years = signal<number | null>(null);
  readonly languageIds = signal<readonly string[]>([]);
  readonly demoFile = signal<File | null>(null);
  readonly demoSeconds = signal<number | null>(null);
  readonly demoError = signal('');
  readonly draggingDemo = signal(false);
  readonly states = computed(() => Application.stepperStates(this.step(), this.current()));
  readonly topic = computed(() => this.topics().find(x => x.id === this.topicId()) ?? null);
  readonly duration = computed(() => Assignment.duration(this.topic()));
  readonly selectedSubjects = computed<readonly SelectableSubject[]>(() => this.workspace()?.selectableSubjects ?? []);
  readonly hasOpenSubject = computed(() => this.selectedSubjects().some(subject => !subject.disabled));
  /** What "Save and continue" is still waiting for, by name; a toast that says only "complete the details" is gone before anyone finds the field. */
  readonly missingDetails = signal('');

  constructor() {
    this.title.setTitle(this.t('apply_title', 'Teacher qualification') + ' — Tafseel');
    void this.open();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  label(item: { name: string; nameArabic: string }): string { return subjectName({ id: '', ...item }, this.locale.isRtl()); }
  topicLabel(item: QualificationTopic): string { return Assignment.title(item, this.locale.isRtl()); }
  /** The subject in the reader's language; the list used to print the English name on an Arabic page. */
  appSubject(application: TeacherApplication): string {
    return subjectName({ id: application.subjectId, name: application.subjectName, nameArabic: application.subjectNameArabic }, this.locale.isRtl());
  }
  statusName(status: number): string { return this.t(Application.statusKey(status), 'Unknown'); }
  statusKind(status: number): string { return Application.statusKind(status); }
  durationText(seconds: number): string { return formatDuration(seconds); }
  fileSize(file: File): string { return formatFileSize(file.size); }
  checked(id: string): boolean { return this.languageIds().includes(id); }
  /** The server names languages in English only; the reader's word comes from the locale table by code, as on the profile. */
  languageName(language: { code: string; name: string }): string {
    return (language.code && this.t(`language_name_${language.code}`, '')) || language.name;
  }

  async open(): Promise<void> {
    this.loading.set(true);
    try {
      const q = this.route.snapshot.queryParamMap;
      const workspace = await this.loader.execute({
        additional: q.get('mode') === 'additional', preferredSubjectId: q.get('subjectId') ?? ''
      });
      this.workspace.set(workspace);
      this.current.set(workspace.current);
      this.languageIds.set(workspace.profile?.languages.map(x => x.id) ?? []);
      this.subjectId.set(workspace.subjectId);
      this.fill(workspace.current);
      await this.changeSubject(workspace.subjectId, workspace.current?.qualificationTopicId);
      this.step.set(Application.defaultStep(workspace.current));
      if (workspace.partial) this.toasts.show(this.t('apply_initial_partial_error', 'Some application data could not be loaded.'));
    } catch (error) { this.toasts.show(this.error(error, 'apply_initial_error', 'Application could not load.')); }
    finally { this.loading.set(false); }
  }

  async changeSubject(id: string, preferredTopic = ''): Promise<void> {
    this.subjectId.set(id);
    try {
      const topics = await this.loadTopics.execute(id);
      this.topics.set(topics);
      this.topicId.set(topics.some(x => x.id === preferredTopic) ? preferredTopic : (topics[0]?.id ?? ''));
    } catch (error) { this.topics.set([]); this.topicId.set(''); this.toasts.show(this.error(error, 'apply_topics_error', 'Topics could not load.')); }
  }

  toggleLanguage(id: string, enabled: boolean): void {
    this.languageIds.update(ids => enabled ? [...new Set([...ids, id])] : ids.filter(x => x !== id));
  }

  async save(): Promise<void> {
    if (!this.validDetails() || this.busy()) return;
    this.busy.set(true);
    try {
      const id = await this.saveDetails.execute({ subjectId: this.subjectId(), qualificationTopicId: this.topicId(),
        city: this.city().trim(), experienceYears: Number(this.years()), degree: this.current()?.degree ?? '' },
        this.languageIds(), this.current());
      await this.refresh(id);
      this.step.set('demo');
      this.toasts.show(this.t('apply_saved_continue', 'Saved. Continue with your demo.'));
    } catch (error) { this.toasts.show(this.error(error, 'apply_save_error', 'Application could not be saved.')); }
    finally { this.busy.set(false); }
  }

  chooseFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectDemoFile(input.files?.[0] ?? null);
    input.value = '';
  }

  dragDemo(event: DragEvent): void {
    event.preventDefault();
    this.draggingDemo.set(true);
  }

  dropDemo(event: DragEvent): void {
    event.preventDefault();
    this.draggingDemo.set(false);
    this.selectDemoFile(event.dataTransfer?.files[0] ?? null);
  }

  removeDemoFile(): void {
    this.demoFile.set(null);
    this.demoSeconds.set(null);
    this.demoError.set('');
  }

  private selectDemoFile(file: File | null): void {
    this.demoFile.set(null); this.demoSeconds.set(null); this.demoError.set('');
    if (!file || !DEMO_FILE_PATTERN.test(file.name)) {
      if (file) this.demoError.set(this.t('apply_demo_type_invalid', 'Choose an MP4 or WebM video.'));
      return;
    }
    this.demoFile.set(file);
    const view = this.document.defaultView;
    if (!view) return;
    const url = view.URL.createObjectURL(file);
    const video = this.document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const seconds = Math.round(video.duration || 0);
      this.demoSeconds.set(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
      view.URL.revokeObjectURL(url);
      // UX-52: say a video is too short or too long as soon as it is chosen, not after a long upload.
      const range = this.duration(), known = this.demoSeconds();
      if (known != null && !Assignment.withinRange(known, range)) {
        this.demoError.set(this.locale.format('apply_duration_out_of_range_picked', { length: formatDuration(known), min: formatDuration(range.min), max: formatDuration(range.max) },
          'This video is {length} long. Choose a video between {min} and {max}.'));
      }
    };
    video.onerror = () => view.URL.revokeObjectURL(url);
    video.src = url;
  }

  async upload(): Promise<void> {
    const application = this.current(), file = this.demoFile();
    if (!application || !file || !DEMO_FILE_PATTERN.test(file.name) || this.busy()) return;
    const range = this.duration(), known = this.demoSeconds();
    if (known != null && !Assignment.withinRange(known, range)) {
      this.demoError.set(this.locale.format('apply_duration_out_of_range', { min: formatDuration(range.min), max: formatDuration(range.max) }, 'Video duration is outside the allowed range.')); return;
    }
    this.demoError.set('');
    this.busy.set(true);
    try {
      await this.uploadDemo.execute(application, file, known ?? Assignment.fallbackSeconds(range));
      await this.refresh(application.id); this.removeDemoFile();
      this.toasts.show(this.t('apply_demo_uploaded', 'Demo uploaded.'));
    } catch (error) { this.demoError.set(this.error(error, 'apply_demo_error', 'Demo could not be uploaded.')); }
    finally { this.busy.set(false); }
  }

  async submit(): Promise<void> {
    const application = this.current();
    if (!application?.demoUploaded || this.busy()) return;
    this.busy.set(true);
    try { await this.submitApplication.execute(application); await this.refresh(application.id); this.step.set('review'); this.toasts.show(this.t('apply_submitted', 'Submitted for review.')); }
    catch (error) { this.toasts.show(this.error(error, 'apply_submit_error', 'Application could not be submitted.')); }
    finally { this.busy.set(false); }
  }

  async select(application: TeacherApplication): Promise<void> {
    this.current.set(application); this.fill(application);
    await this.changeSubject(application.subjectId, application.qualificationTopicId);
    this.step.set(Application.defaultStep(application));
  }

  startAnother(): void {
    if (!this.hasOpenSubject()) return;
    this.current.set(null); this.fill(null); this.step.set('details');
    const id = Application.firstOpenSubjectId(this.selectedSubjects());
    if (id) void this.changeSubject(id);
  }

  /** A step the application has not reached yet is shown locked, rather than as a button that ignores the tap. */
  reachable(step: WizardStep): boolean { return Application.canVisit(step, this.current()); }
  visit(step: WizardStep): void { if (this.reachable(step)) this.step.set(step); }
  async openResource(resource: QualificationTopic['resources'][number], download = false): Promise<void> {
    const path = Assignment.apiPath(resource.url, this.document.baseURI);
    if (path) await this.files.open('/api/v1' + path, { download, fileName: resource.fileName });
  }

  private fill(application: TeacherApplication | null): void {
    this.city.set(application?.city ?? ''); this.years.set(application?.experienceYears ?? null);
  }

  private async refresh(id: string): Promise<void> {
    const result = await this.refreshApplications.execute(id);
    this.current.set(result.current);
    this.workspace.update(w => w ? { ...w, applications: result.applications, current: result.current } : w);
  }

  private validDetails(): boolean {
    const missing = [
      !this.subjectId() || !this.topicId() ? this.t('apply_topic', 'Qualification topic') : '',
      !/\p{L}/u.test(this.city()) ? this.t('apply_city', 'City') : '',
      this.years() == null || this.years()! < 0 || this.years()! > 80 ? this.t('apply_years', 'Years of experience') : '',
      !this.languageIds().length ? this.t('apply_languages', 'Teaching languages') : ''
    ].filter(Boolean);
    this.missingDetails.set(missing.length
      ? this.locale.format('apply_details_missing', { fields: missing.join(this.locale.isRtl() ? '، ' : ', ') }, 'Still needed: {fields}.')
      : '');
    if (missing.length) {
      this.toasts.show(this.t('apply_details_invalid', 'Complete the required application details.')); return false;
    }
    return this.topics().some(x => x.id === this.topicId() && x.parentId === this.subjectId());
  }

  private error(_error: unknown, key: string, fallback: string): string {
    return this.t(key, fallback);
  }
}
