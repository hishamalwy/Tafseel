import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SupportCase, SupportCaseSummary, SupportCategory, SupportStatus } from '../models/support';

type Json = Record<string, unknown>;
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const opt = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const list = (v: unknown): Json[] => (Array.isArray(v) ? v as Json[] : []);

const summary = (row: Json): SupportCaseSummary => ({
  id: text(row['id']), reference: text(row['reference']), category: num(row['category']) as SupportCategory,
  status: num(row['status']) as SupportStatus, createdAt: text(row['createdAt']), updatedAt: text(row['updatedAt']),
  ownerName: opt(row['ownerName']), reporterName: opt(row['reporterName']),
  fromSignedOutReporter: row['fromSignedOutReporter'] === true, summary: text(row['summary'])
});

const detail = (row: Json): SupportCase => ({
  id: text(row['id']), reference: text(row['reference']), category: num(row['category']) as SupportCategory,
  status: num(row['status']) as SupportStatus, description: text(row['description']), relatedReference: opt(row['relatedReference']),
  createdAt: text(row['createdAt']), updatedAt: text(row['updatedAt']), outcome: opt(row['outcome']), resolvedAt: opt(row['resolvedAt']),
  owned: row['owned'] === true, ownerName: opt(row['ownerName']), reporterName: opt(row['reporterName']),
  reporterEmail: opt(row['reporterEmail']), contactEmail: opt(row['contactEmail']), contactName: opt(row['contactName']),
  messages: list(row['messages']).map(m => ({ id: text(m['id']), fromStaff: m['fromStaff'] === true, mine: m['mine'] === true,
    authorName: opt(m['authorName']), body: text(m['body']), createdAt: text(m['createdAt']) })),
  attachments: list(row['attachments']).map(a => ({ id: text(a['id']), fileName: text(a['fileName']), contentType: text(a['contentType']),
    size: num(a['size']), createdAt: text(a['createdAt']) })),
  version: text(row['version'])
});

const ifMatch = (version: string) => ({ headers: new HttpHeaders({ 'If-Match': version }) });

@Injectable({ providedIn: 'root' })
export class SupportGateway {
  private readonly http = inject(HttpClient);

  async create(category: SupportCategory, description: string, relatedReference: string | null): Promise<SupportCase> {
    return detail(await firstValueFrom(this.http.post<Json>('/api/v1/support/cases', { category, description, relatedReference })));
  }

  async accountAccess(email: string, fullName: string, description: string): Promise<string> {
    const row = await firstValueFrom(this.http.post<Json>('/api/v1/support/account-access', { email, fullName: fullName || null, description }));
    return text(row['reference']);
  }

  async mine(): Promise<readonly SupportCaseSummary[]> {
    const row = await firstValueFrom(this.http.get<Json>('/api/v1/support/cases/mine', { params: { page: 1, pageSize: 50 } }));
    return list(row['items']).map(summary);
  }

  async find(id: string): Promise<SupportCase> {
    return detail(await firstValueFrom(this.http.get<Json>(`/api/v1/support/cases/${encodeURIComponent(id)}`)));
  }

  async message(id: string, body: string, version: string): Promise<SupportCase> {
    return detail(await firstValueFrom(this.http.post<Json>(`/api/v1/support/cases/${encodeURIComponent(id)}/messages`, { body }, ifMatch(version))));
  }

  async attach(id: string, file: File, version: string): Promise<SupportCase> {
    const form = new FormData();
    form.append('file', file);
    return detail(await firstValueFrom(this.http.post<Json>(`/api/v1/support/cases/${encodeURIComponent(id)}/attachments`, form, ifMatch(version))));
  }

  /** Protected content: fetched with the session and handed to the browser as a download. */
  async download(attachmentId: string, fileName: string): Promise<void> {
    const blob = await firstValueFrom(this.http.get(`/api/v1/support/attachments/${encodeURIComponent(attachmentId)}/content`, { responseType: 'blob' }));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = fileName; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async queue(status: SupportStatus | null, category: SupportCategory | null, query: string): Promise<readonly SupportCaseSummary[]> {
    let params = new HttpParams().set('page', 1).set('pageSize', 100);
    if (status !== null) params = params.set('status', status);
    if (category !== null) params = params.set('category', category);
    if (query.trim()) params = params.set('query', query.trim());
    const row = await firstValueFrom(this.http.get<Json>('/api/v1/admin/support/cases', { params }));
    return list(row['items']).map(summary);
  }

  async take(id: string, version: string): Promise<SupportCase> {
    return detail(await firstValueFrom(this.http.post<Json>(`/api/v1/admin/support/cases/${encodeURIComponent(id)}/take`, {}, ifMatch(version))));
  }

  async resolve(id: string, outcome: string, version: string): Promise<SupportCase> {
    return detail(await firstValueFrom(this.http.post<Json>(`/api/v1/admin/support/cases/${encodeURIComponent(id)}/resolve`, { outcome }, ifMatch(version))));
  }
}
