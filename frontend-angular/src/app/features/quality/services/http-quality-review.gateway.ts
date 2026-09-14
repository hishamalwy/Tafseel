import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  ApplicationReview, DecisionRequest, QualifiedSubject, QueueFilter, ReviewApplication, ReviewHistoryItem,
  ReviewPriority, ReviewQueuePage, ReviewQueueSummary, ReviewRecord
} from '../models/application-review';
import { QualityReviewGateway } from './quality-review.ports';

type Json = Record<string, any>;

@Injectable()
export class HttpQualityReviewGateway implements QualityReviewGateway {
  private readonly http = inject(HttpClient);

  queue(filter: QueueFilter): Observable<ReviewQueuePage> {
    let params = new HttpParams()
      .set('scope', filter.scope).set('kind', filter.kind).set('sort', filter.sort)
      .set('page', filter.page).set('pageSize', filter.pageSize);
    if (filter.status !== null) params = params.set('status', filter.status);
    return this.http.get<Json>('/api/v1/teacher-applications/queue', { params }).pipe(map(page => ({
      items: (page['items'] ?? []).map(application),
      page: Number(page['page'] ?? filter.page),
      pageSize: Number(page['pageSize'] ?? filter.pageSize),
      totalCount: Number(page['totalCount'] ?? 0)
    })));
  }

  summary(): Observable<ReviewQueueSummary> {
    return this.http.get<Json>('/api/v1/teacher-applications/queue/summary').pipe(map(x => ({
      actionable: Number(x['actionable'] ?? 0), submitted: Number(x['submitted'] ?? 0),
      underReview: Number(x['underReview'] ?? 0), changesRequested: Number(x['changesRequested'] ?? 0),
      additionalActionable: Number(x['additionalActionable'] ?? 0)
    })));
  }

  review(applicationId: string): Observable<ApplicationReview> {
    return this.http.get<Json>(`/api/v1/teacher-applications/${encodeURIComponent(applicationId)}`).pipe(map(x => ({
      application: application(x['application'] ?? {}),
      history: (x['history'] ?? []).map(historyItem),
      reviews: (x['reviews'] ?? []).map(reviewRecord)
    })));
  }

  startReview(applicationId: string, priority: ReviewPriority, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/teacher-applications/${encodeURIComponent(applicationId)}/start-review`,
      { priority }, { headers: ifMatch(version) });
  }

  decide(applicationId: string, decision: DecisionRequest, version: string): Observable<void> {
    return this.http.post<void>(`/api/v1/teacher-applications/${encodeURIComponent(applicationId)}/decision`,
      {
        decision: decision.decision,
        scores: decision.scores,
        comment: decision.comment,
        internalNotes: decision.internalNotes
      },
      { headers: ifMatch(version) });
  }

  demoPath(applicationId: string): string {
    return `/api/v1/teacher-applications/${encodeURIComponent(applicationId)}/demo/content`;
  }
}

function ifMatch(version: string): HttpHeaders {
  return new HttpHeaders({ 'If-Match': version });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function application(x: Json): ReviewApplication {
  return {
    id: text(x['id']), teacherId: text(x['teacherId']), teacherName: text(x['teacherDisplayName']),
    subjectId: text(x['subjectId']), subjectName: text(x['subjectName']), subjectNameArabic: text(x['subjectNameAr']),
    status: Number(x['status'] ?? -1), priority: Number(x['priority'] ?? 0),
    assignedReviewerId: text(x['assignedReviewerId']), submittedAt: text(x['submittedAt']), version: text(x['version']),
    assignmentTitle: text(x['assignmentTitle']), assignmentTitleArabic: text(x['assignmentTitleAr']),
    assignmentInstructions: text(x['assignmentInstructions']),
    demoUploaded: !!x['demoUploaded'],
    demoDurationSeconds: typeof x['demoDurationSeconds'] === 'number' ? x['demoDurationSeconds'] : null,
    submissionVersion: Number(x['submissionVersion'] ?? 0), publicFeedback: text(x['publicFeedback']),
    city: text(x['city']), experienceYears: Number(x['experienceYears'] ?? 0), degree: text(x['degree']),
    isAdditionalSubject: !!x['isAdditionalSubject'],
    activeQualifications: (x['activeQualifications'] ?? []).map((q: Json): QualifiedSubject => ({
      subjectId: text(q['subjectId']), subjectName: text(q['subjectName']), subjectNameArabic: text(q['subjectNameAr'])
    })),
    hasPreviousFeedback: !!x['hasPreviousFeedback']
  };
}

function historyItem(x: Json): ReviewHistoryItem {
  return {
    previousStatus: typeof x['previousStatus'] === 'number' ? x['previousStatus'] : null,
    nextStatus: Number(x['nextStatus'] ?? -1), createdAt: text(x['createdAt']),
    actorName: text(x['actorDisplayName']), note: text(x['note'])
  };
}

function reviewRecord(x: Json): ReviewRecord {
  return {
    createdAt: text(x['createdAt']), decision: Number(x['decision'] ?? -1),
    publicFeedback: text(x['publicFeedback']), reviewerName: text(x['reviewerDisplayName']),
    internalNotes: text(x['internalNotes'])
  };
}
