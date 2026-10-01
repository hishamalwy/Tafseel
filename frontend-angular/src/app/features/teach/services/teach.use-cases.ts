import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Application, CatalogSubject, OnboardingLifecycle, QualificationCard,
  SelectableSubject, TeacherApplication, TeachingLanguage
} from '../models/application';
import { QualificationTopic } from '../models/assignment';
import { ApplicationDraft, TEACH_GATEWAY, TeacherProfile } from './teach.ports';

export interface TeachWorkspace {
  readonly subjects: readonly CatalogSubject[];
  readonly selectableSubjects: readonly SelectableSubject[];
  readonly languages: readonly TeachingLanguage[];
  readonly profile: TeacherProfile | null;
  readonly applications: readonly TeacherApplication[];
  readonly lifecycle: OnboardingLifecycle | null;
  readonly qualifications: readonly QualificationCard[];
  readonly current: TeacherApplication | null;
  readonly subjectId: string;
  /** True when a read failed, so the page can say the view is incomplete. */
  readonly partial: boolean;
  /** True when the teacher's own languages could not be read. */
  readonly languagesFailed: boolean;
}

/**
 * Everything the application page opens with.
 *
 * Six independent reads, settled separately: the subject catalogue failing must
 * not also lose the applications the teacher already has in flight. The page is
 * told which parts are missing so it can say the view is incomplete, rather than
 * presenting a partial answer as the whole one.
 */
@Injectable({ providedIn: 'root' })
export class LoadTeachWorkspace {
  private readonly gateway = inject(TEACH_GATEWAY);

  async execute(options: { additional?: boolean; preferredSubjectId?: string } = {}
  ): Promise<TeachWorkspace> {
    const settled = await Promise.allSettled([
      firstValueFrom(this.gateway.subjects()),
      firstValueFrom(this.gateway.languages()),
      firstValueFrom(this.gateway.profile()),
      firstValueFrom(this.gateway.applications()),
      firstValueFrom(this.gateway.lifecycle()),
      firstValueFrom(this.gateway.qualifications()),
      firstValueFrom(this.gateway.openSubjectIds())
    ] as const);

    const at = <T>(index: number, fallback: T): T => {
      const result = settled[index];
      return result?.status === 'fulfilled' ? (result.value as T) : fallback;
    };
    const failed = (index: number) => settled[index]?.status === 'rejected';

    const subjects = at<readonly CatalogSubject[]>(0, []);
    const applications = at<readonly TeacherApplication[]>(3, []);
    const lifecycle = at<OnboardingLifecycle | null>(4, null);
    const qualifications = at<readonly QualificationCard[]>(5, []);

    const selectableSubjects =
      Application.selectableSubjects(subjects, applications, lifecycle, qualifications,
        at<ReadonlySet<string> | null>(6, null));

    // "Apply for another subject" deliberately starts with no current
    // application, so the wizard opens on a blank details step — unless the
    // teacher was sent here for a subject whose application is still in flight
    // (for example, changes were requested): that application opens instead of
    // a blank form for some other subject.
    const inFlight = options.preferredSubjectId
      ? applications.find(a => a.subjectId === options.preferredSubjectId && Application.isOpen(a)) ?? null
      : null;
    const current = inFlight ?? (options.additional ? null : Application.preferred(applications));

    return {
      subjects,
      selectableSubjects,
      languages: at<readonly TeachingLanguage[]>(1, []),
      profile: at<TeacherProfile | null>(2, null),
      applications,
      lifecycle,
      qualifications,
      current,
      subjectId: this.openingSubjectId(
        current, selectableSubjects, subjects, options.preferredSubjectId ?? ''),
      partial: failed(0) || failed(3),
      languagesFailed: failed(1) || failed(2)
    };
  }

  /**
   * Which subject the form starts on: the one already applied for, else the one
   * the teacher was sent here for (only if it is actually open to them), else
   * the first open one, else whatever the catalogue leads with.
   */
  private openingSubjectId(
    current: TeacherApplication | null,
    selectable: readonly SelectableSubject[],
    subjects: readonly CatalogSubject[],
    requested: string
  ): string {
    if (current?.subjectId) return current.subjectId;
    if (requested && selectable.some(s => s.id === requested && !s.disabled)) return requested;
    return Application.firstOpenSubjectId(selectable) || subjects[0]?.id || '';
  }
}

/** Qualification topics for a subject. Empty subject means no topics, not an error. */
@Injectable({ providedIn: 'root' })
export class LoadQualificationTopics {
  private readonly gateway = inject(TEACH_GATEWAY);

  async execute(subjectId: string): Promise<readonly QualificationTopic[]> {
    if (!subjectId) return [];
    return firstValueFrom(this.gateway.topics(subjectId));
  }
}

/**
 * Saving the details step.
 *
 * Teaching languages are a property of the teacher rather than of one
 * application, so they are written first and separately — an application saved
 * with languages the profile does not carry would pass review against facts the
 * profile cannot support. An open application is updated under its version; any
 * other state starts a new one.
 */
@Injectable({ providedIn: 'root' })
export class SaveApplicationDetails {
  private readonly gateway = inject(TEACH_GATEWAY);

  async execute(
    draft: ApplicationDraft, languageIds: readonly string[], current: TeacherApplication | null
  ): Promise<string> {
    await firstValueFrom(this.gateway.setTeachingLanguages(languageIds));

    if (Application.isOpen(current) && current) {
      await firstValueFrom(this.gateway.update(current.id, draft, current.version));
      return current.id;
    }
    const created = await firstValueFrom(this.gateway.create(draft));
    return created.id;
  }
}

@Injectable({ providedIn: 'root' })
export class UploadDemo {
  private readonly gateway = inject(TEACH_GATEWAY);

  execute(application: TeacherApplication, file: File, durationSeconds: number): Promise<void> {
    return firstValueFrom(
      this.gateway.uploadDemo(application.id, file, durationSeconds, application.version));
  }
}

@Injectable({ providedIn: 'root' })
export class SubmitApplication {
  private readonly gateway = inject(TEACH_GATEWAY);

  execute(application: TeacherApplication): Promise<void> {
    return firstValueFrom(this.gateway.submit(application.id, application.version));
  }
}

/** Re-read the applications alone, after a write that changed one. */
@Injectable({ providedIn: 'root' })
export class RefreshApplications {
  private readonly gateway = inject(TEACH_GATEWAY);

  async execute(preferredId?: string): Promise<{
    applications: readonly TeacherApplication[];
    current: TeacherApplication | null;
  }> {
    const applications = await firstValueFrom(this.gateway.applications());
    return { applications, current: Application.preferred(applications, preferredId) };
  }
}
