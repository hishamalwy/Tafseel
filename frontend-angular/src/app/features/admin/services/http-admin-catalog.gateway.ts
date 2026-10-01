import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CatalogKind } from '../models/catalog';
import { AdminCatalogGateway } from './admin-catalog.ports';

type Json = Record<string, unknown>;

@Injectable()
export class HttpAdminCatalogGateway implements AdminCatalogGateway {
  private readonly http = inject(HttpClient);

  list(kind: CatalogKind): Observable<readonly Json[]> {
    return this.http.get<Json[]>(`/api/v1/admin/catalog/${kind}`);
  }

  create(kind: CatalogKind, body: Json): Observable<unknown> {
    switch (kind) {
      case 'services': return this.http.post('/api/v1/admin/services', body);
      case 'subjects': return this.http.post('/api/v1/admin/subjects', body);
      case 'qualification-topics': return this.http.post('/api/v1/admin/qualification-topics', body);
      case 'topics': return this.http.post('/api/v1/admin/topics', body);
      case 'education-levels': return this.http.post('/api/v1/admin/education-levels', body);
      case 'languages': return this.http.post('/api/v1/admin/languages', body);
    }
  }

  update(kind: Exclude<CatalogKind, 'services'>, id: string, body: Json): Observable<void> {
    return this.http.put<void>(`/api/v1/admin/catalog/${kind}/${encodeURIComponent(id)}`, body);
  }

  updateService(id: string, body: Json): Observable<void> {
    return this.http.put<void>(`/api/v1/admin/catalog/services/${encodeURIComponent(id)}`, body);
  }

  setActive(kind: CatalogKind, id: string, isActive: boolean): Observable<void> {
    return this.http.patch<void>(`/api/v1/admin/catalog/${kind}/${encodeURIComponent(id)}/active`, { isActive });
  }

  addLinkResource(qualificationTopicId: string, body: Json): Observable<unknown> {
    return this.http.post(`/api/v1/admin/qualification-topics/${encodeURIComponent(qualificationTopicId)}/resources/link`, body);
  }
}
