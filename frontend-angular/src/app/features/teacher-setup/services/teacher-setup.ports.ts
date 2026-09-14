import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { ExceptionInput, RuleInput } from '../models/availability';
import { OnboardingState } from '../models/readiness';
import { ServiceInput, ServiceType } from '../models/service-offer';
import {
  AvailabilityException, Credential, CredentialDraft, CredentialKind, NamedItem, OwnProfile, ProfileInput, TopicItem,
  WeeklyRule
} from '../models/teacher-profile';

export interface TeacherSetupGateway {
  profile(): Observable<OwnProfile>;
  saveProfile(input: ProfileInput): Observable<void>;

  languages(): Observable<readonly NamedItem[]>;
  topics(): Observable<readonly TopicItem[]>;
  educationLevels(): Observable<readonly NamedItem[]>;
  setLanguages(ids: readonly string[]): Observable<void>;
  setTopics(ids: readonly string[]): Observable<void>;
  setEducationLevels(ids: readonly string[]): Observable<void>;
  addCredential(kind: CredentialKind, draft: CredentialDraft): Observable<Credential>;
  removeCredential(kind: CredentialKind, id: string): Observable<void>;

  eligibleSubjects(): Observable<readonly NamedItem[]>;
  serviceTypes(): Observable<readonly ServiceType[]>;
  createService(input: ServiceInput): Observable<void>;
  updateService(id: string, input: ServiceInput, version: string): Observable<void>;
  setServiceActive(id: string, active: boolean, version: string): Observable<void>;

  replaceRules(rules: readonly RuleInput[]): Observable<readonly WeeklyRule[]>;
  removeRule(id: string): Observable<void>;
  addException(input: ExceptionInput): Observable<AvailabilityException>;
  removeException(id: string): Observable<void>;

  onboarding(): Observable<OnboardingState>;
  setPublished(published: boolean): Observable<void>;
}

export const TEACHER_SETUP_GATEWAY = new InjectionToken<TeacherSetupGateway>('TeacherSetupGateway');
