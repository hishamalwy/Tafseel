import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { problemMessage } from '@core/http/problem-message';
import { LocaleService } from '@core/i18n/locale.service';
import { WorkspaceShellComponent } from '@shared/layouts/workspace-shell.component';
import { ToastComponent } from '@shared/components/toast.component';
import { ToastService } from '@shared/services/toast.service';
import { CredentialListComponent } from '../components/credential-list.component';
import { browserTimeZone, timeZoneChoices, timeZoneLabel } from '../models/availability';
import {
  FieldProblem, NamedItem, PROFILE_LIMITS, ProfileDraft, ProfileField, ProfileForm, localName
} from '../models/teacher-profile';
import {
  FormInvalid, LoadProfileWorkspace, ProfileWorkspace, SaveTeacherProfile, SaveTeachingChoices, TeachingChoice
} from '../services/teacher-setup.use-cases';

type Section = 'core' | TeachingChoice;

/** The teacher's own profile (J11-06): everything `PUT /teachers/me` and its lists accept. */
@Component({
  selector: 'tf-teacher-profile-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, WorkspaceShellComponent, ToastComponent, CredentialListComponent],
  templateUrl: './teacher-profile-editor-page.component.html',
  styles: `
    .tf-profile-editor-card .tf-field-help { display: block; }
    .tf-choice-grid { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 0; padding: 0; border: 0; }
    .tf-choice-group { display: grid; gap: 6px; }
    .tf-choice-group h3 { margin: 0; font-size: 13px; color: var(--text-2); }
  `
})
export class TeacherProfileEditorPageComponent {
  private readonly load = inject(LoadProfileWorkspace);
  private readonly saveProfile = inject(SaveTeacherProfile);
  private readonly saveChoices = inject(SaveTeachingChoices);
  private readonly toasts = inject(ToastService);
  readonly locale = inject(LocaleService);
  readonly limits = PROFILE_LIMITS;

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly workspace = signal<ProfileWorkspace | null>(null);
  readonly draft = signal<ProfileDraft>(ProfileForm.draft(null, browserTimeZone()));
  readonly attempted = signal(false);
  readonly saving = signal<Section | ''>('');
  readonly serverFields = signal<Partial<Record<string, string>>>({});
  readonly errors = signal<Partial<Record<Section, string>>>({});
  readonly saved = signal<Section | ''>('');
  readonly selected = signal<Record<TeachingChoice, readonly string[]>>({ languages: [], topics: [], educationLevels: [] });
  readonly zones = computed(() => timeZoneChoices(this.workspace()?.profile.timeZoneId ?? '', this.draft().timeZoneId));
  readonly browserZone = browserTimeZone();

  /** A zone named in the reader's language rather than as its IANA identifier (UX-06). */
  zoneLabel(zone: string): string { return timeZoneLabel(zone, this.locale.lang()); }
  readonly problems = computed(() => this.attempted() ? ProfileForm.problems(this.draft()) : {});
  readonly topicGroups = computed(() => {
    const w = this.workspace();
    if (!w) return [];
    return w.eligibleSubjects.map(subject => ({ subject, topics: w.topics.filter(topic => topic.subjectId === subject.id) }))
      .filter(group => group.topics.length);
  });

  constructor() {
    inject(Title).setTitle(`${this.t('setup_profile_title', 'Your teacher profile')} — Tafseel`);
    void this.refresh();
  }

  t(key: string, fallback = ''): string { return this.locale.t(key, fallback); }
  /**
   * What a catalog item is called here. Teaching languages carry only an English name on the server
   * ("Arabic", "English") but do carry their code, so the reader's own word for the language comes from the
   * locale table rather than from an English column (UX-06).
   */
  name(item: NamedItem): string {
    const byCode = item.code ? this.locale.t(`language_name_${item.code}`, '') : '';
    return byCode || localName(item, this.locale.isRtl());
  }

  fieldError(field: ProfileField): string {
    const problem: FieldProblem | undefined = this.problems()[field];
    if (problem) return this.locale.format(`setup_problem_${problem}`, { max: this.limitOf(field) }, problem);
    return this.serverFields()[field] ?? '';
  }

  set(field: ProfileField, value: string | number | null): void {
    this.draft.update(d => ({ ...d, [field]: field === 'responseTimeMinutes' ? (value === '' || value === null ? null : Number(value)) : String(value ?? '') }));
    this.saved.set('');
  }

  isSelected(choice: TeachingChoice, id: string): boolean { return this.selected()[choice].includes(id); }

  toggle(choice: TeachingChoice, id: string, on: boolean): void {
    this.selected.update(s => ({ ...s, [choice]: on ? [...new Set([...s[choice], id])] : s[choice].filter(x => x !== id) }));
    this.saved.set('');
  }

  dirty(choice: TeachingChoice): boolean {
    const profile = this.workspace()?.profile;
    return !!profile && !ProfileForm.sameIds(this.selected()[choice], profile[choice].map(item => item.id));
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const workspace = await this.load.execute();
      this.workspace.set(workspace);
      this.draft.set(ProfileForm.draft(workspace.profile, this.browserZone));
      this.selected.set({
        languages: workspace.profile.languages.map(x => x.id),
        topics: workspace.profile.topics.map(x => x.id),
        educationLevels: workspace.profile.educationLevels.map(x => x.id)
      });
      if (workspace.partial) this.toasts.show(this.t('setup_profile_partial', 'Some choice lists could not be loaded. Refresh to try again.'));
    } catch (error) {
      this.loadError.set(problemMessage(error, (k, f) => this.t(k, f)).text);
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    this.attempted.set(true);
    this.serverFields.set({});
    this.clearError('core');
    if (Object.keys(ProfileForm.problems(this.draft())).length) return;
    await this.run('core', async () => {
      await this.saveProfile.execute(this.draft());
      await this.refreshProfileOnly();
      this.attempted.set(false);
    });
  }

  async saveChoice(choice: TeachingChoice): Promise<void> {
    if (this.saving()) return;
    this.clearError(choice);
    await this.run(choice, async () => {
      await this.saveChoices.execute(choice, this.selected()[choice]);
      await this.refreshProfileOnly();
    });
  }

  /** Re-reads after a save; a list the teacher is still editing keeps their unsaved choice. */
  async refreshProfileOnly(): Promise<void> {
    const editing = (['languages', 'topics', 'educationLevels'] as const).filter(choice => this.dirty(choice));
    const workspace = await this.load.execute();
    this.workspace.set(workspace);
    this.selected.update(s => ({
      languages: editing.includes('languages') ? s.languages : workspace.profile.languages.map(x => x.id),
      topics: editing.includes('topics') ? s.topics : workspace.profile.topics.map(x => x.id),
      educationLevels: editing.includes('educationLevels') ? s.educationLevels : workspace.profile.educationLevels.map(x => x.id)
    }));
  }

  private async run(section: Section, work: () => Promise<void>): Promise<void> {
    this.saving.set(section);
    this.saved.set('');
    try {
      await work();
      this.saved.set(section);
    } catch (error) {
      if (error instanceof FormInvalid) {
        this.errors.update(e => ({ ...e, [section]: this.t('setup_problem_language_required', 'Choose at least one teaching language.') }));
      } else {
        const message = problemMessage(error, (k, f) => this.t(k, f));
        if (section === 'core') this.serverFields.set(message.fields);
        this.errors.update(e => ({ ...e, [section]: message.text }));
      }
    } finally {
      this.saving.set('');
    }
  }

  private clearError(section: Section): void {
    this.errors.update(e => ({ ...e, [section]: '' }));
  }

  private limitOf(field: ProfileField): number {
    return PROFILE_LIMITS[field];
  }
}
