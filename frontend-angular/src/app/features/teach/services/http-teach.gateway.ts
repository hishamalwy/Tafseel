import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { CatalogSubject, OnboardingLifecycle, QualificationCard, TeacherApplication, TeachingLanguage } from '../models/application';
import { QualificationTopic } from '../models/assignment';
import { ApplicationDraft, TeachGateway, TeacherProfile } from '../services/teach.ports';

type Json = Record<string, any>;

@Injectable()
export class HttpTeachGateway implements TeachGateway {
  private readonly http = inject(HttpClient);

  subjects(): Observable<readonly CatalogSubject[]> {
    return this.http.get<Json[]>('/api/v1/subjects').pipe(map(rows => rows.map(subject)));
  }

  languages(): Observable<readonly TeachingLanguage[]> {
    return this.http.get<TeachingLanguage[]>('/api/v1/languages');
  }

  profile(): Observable<TeacherProfile> {
    return this.http.get<Json>('/api/v1/teachers/me').pipe(map(x => ({ languages: x['languages'] ?? [] })));
  }

  applications(): Observable<readonly TeacherApplication[]> {
    return this.http.get<Json[]>('/api/v1/teacher-applications/mine').pipe(map(rows => rows.map(application)));
  }

  lifecycle(): Observable<OnboardingLifecycle> {
    return this.http.get<OnboardingLifecycle>('/api/v1/teachers/onboarding-status');
  }

  qualifications(): Observable<readonly QualificationCard[]> {
    return this.http.get<QualificationCard[]>('/api/v1/teachers/me/qualifications');
  }

  topics(subjectId: string): Observable<readonly QualificationTopic[]> {
    return this.http.get<Json[]>(`/api/v1/topics?qualificationOnly=true&subjectId=${encodeURIComponent(subjectId)}`)
      .pipe(map(rows => rows.map(topic)));
  }

  openSubjectIds(): Observable<ReadonlySet<string>> {
    return this.http.get<Json[]>('/api/v1/topics?qualificationOnly=true')
      .pipe(map(rows => new Set(rows.map(row => String(row['parentId'] ?? '')).filter(Boolean))));
  }

  setTeachingLanguages(languageIds: readonly string[]): Observable<void> {
    return this.http.put<void>('/api/v1/teachers/me/languages', { ids: languageIds });
  }

  create(draft: ApplicationDraft): Observable<TeacherApplication> {
    return this.http.post<Json>('/api/v1/teacher-applications', draft).pipe(map(application));
  }

  update(id: string, draft: ApplicationDraft, version: string): Observable<void> {
    return this.http.put<void>(`/api/v1/teacher-applications/${encodeURIComponent(id)}`, draft,
      { headers: versionHeader(version) });
  }

  uploadDemo(id: string, file: File, durationSeconds: number, version: string): Observable<void> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('durationSeconds', String(durationSeconds));
    return this.http.post<void>(`/api/v1/teacher-applications/${encodeURIComponent(id)}/demo`, form,
      { headers: versionHeader(version) });
  }

  submit(id: string, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/teacher-applications/${encodeURIComponent(id)}/submit`, null,
      { headers: versionHeader(version) });
  }
}

function versionHeader(version: string): HttpHeaders {
  return new HttpHeaders({ 'If-Match': version });
}

function subject(x: Json): CatalogSubject {
  return { id: x['id'] ?? '', name: x['name'] ?? '', nameArabic: x['nameAr'] ?? x['nameArabic'] ?? '' };
}

function application(x: Json): TeacherApplication {
  return {
    id: x['id'] ?? '', version: x['version'] ?? '', status: Number(x['status'] ?? 0),
    subjectId: x['subjectId'] ?? '', subjectName: x['subjectName'] ?? '',
    subjectNameArabic: x['subjectNameAr'] ?? x['subjectNameArabic'] ?? '',
    qualificationTopicId: x['qualificationTopicId'] ?? '',
    assignmentTitle: x['assignmentTitle'] ?? '',
    assignmentTitleArabic: x['assignmentTitleAr'] ?? x['assignmentTitleArabic'] ?? '',
    city: x['city'] ?? '', experienceYears: Number(x['experienceYears'] ?? 0), degree: x['degree'] ?? '',
    demoUploaded: !!x['demoUploaded'], publicFeedback: x['publicFeedback'] ?? '', submittedAt: x['submittedAt'] ?? ''
  };
}

function topic(x: Json): QualificationTopic {
  return {
    id: x['id'] ?? '', parentId: x['parentId'] ?? '', name: x['name'] ?? '',
    nameArabic: x['nameAr'] ?? '', titleArabic: x['titleAr'] ?? '',
    instructions: x['detail'] ?? x['instructions'] ?? '', instructionsArabic: x['instructionsAr'] ?? '',
    evaluationGuidance: x['evaluationGuidance'] ?? '', evaluationGuidanceArabic: x['evaluationGuidanceAr'] ?? '',
    minVideoSeconds: Number(x['minVideoSeconds'] ?? 0), maxVideoSeconds: Number(x['maxVideoSeconds'] ?? 0),
    expectedVideoSeconds: Number(x['expectedVideoSeconds'] ?? 0),
    resources: (x['resources'] ?? []).map((r: Json) => ({
      displayName: r['displayName'] ?? '', displayNameArabic: r['displayNameAr'] ?? '',
      fileName: r['fileName'] ?? '', url: r['url'] ?? '', contentType: r['contentType'] ?? '',
      isFile: !!r['isFile'], isRequired: !!r['isRequired']
    }))
  };
}
