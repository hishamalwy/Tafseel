import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CatalogSubject, OnboardingLifecycle, QualificationCard, TeacherApplication, TeachingLanguage
} from '../models/application';
import { QualificationTopic } from '../models/assignment';

/** The fields a teacher edits on the details step. */
export interface ApplicationDraft {
  readonly subjectId: string;
  readonly qualificationTopicId: string;
  readonly city: string;
  readonly experienceYears: number;
  readonly degree: string;
}

export interface TeacherProfile {
  readonly languages: readonly TeachingLanguage[];
}

export interface TeachGateway {
  subjects(): Observable<readonly CatalogSubject[]>;
  languages(): Observable<readonly TeachingLanguage[]>;
  profile(): Observable<TeacherProfile>;
  applications(): Observable<readonly TeacherApplication[]>;
  lifecycle(): Observable<OnboardingLifecycle>;
  qualifications(): Observable<readonly QualificationCard[]>;
  /** Qualification topics for one subject; empty for no subject. */
  topics(subjectId: string): Observable<readonly QualificationTopic[]>;

  setTeachingLanguages(languageIds: readonly string[]): Observable<void>;
  create(draft: ApplicationDraft): Observable<TeacherApplication>;
  update(id: string, draft: ApplicationDraft, version: string): Observable<void>;
  uploadDemo(id: string, file: File, durationSeconds: number, version: string): Observable<void>;
  submit(id: string, version: string): Observable<void>;
}

export const TEACH_GATEWAY = new InjectionToken<TeachGateway>('TeachGateway');
