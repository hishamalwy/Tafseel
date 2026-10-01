import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { CatalogKind } from '../models/catalog';

type Json = Record<string, unknown>;

/** The Admin catalog endpoints (`/admin/catalog/*`, `/admin/{kind}`), as raw rows the models map. */
export interface AdminCatalogGateway {
  list(kind: CatalogKind): Observable<readonly Json[]>;
  create(kind: CatalogKind, body: Json): Observable<unknown>;
  update(kind: Exclude<CatalogKind, 'services'>, id: string, body: Json): Observable<void>;
  updateService(id: string, body: Json): Observable<void>;
  setActive(kind: CatalogKind, id: string, isActive: boolean): Observable<void>;
  addLinkResource(qualificationTopicId: string, body: Json): Observable<unknown>;
}

export const ADMIN_CATALOG_GATEWAY = new InjectionToken<AdminCatalogGateway>('AdminCatalogGateway');
