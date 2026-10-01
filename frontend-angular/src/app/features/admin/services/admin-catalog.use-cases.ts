import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Catalog, CatalogKind, CatalogService, EducationLevel, Language, QualificationTopic, Subject, Topic
} from '../models/catalog';
import { ADMIN_CATALOG_GATEWAY } from './admin-catalog.ports';

type Json = Record<string, unknown>;

export interface CatalogSnapshot {
  readonly services: readonly CatalogService[];
  readonly subjects: readonly Subject[];
  readonly qualificationTopics: readonly QualificationTopic[];
  readonly topics: readonly Topic[];
  readonly levels: readonly EducationLevel[];
  readonly languages: readonly Language[];
}

/** Everything the catalog screen shows, read together so counts across kinds agree. */
@Injectable()
export class LoadCatalog {
  private readonly gateway = inject(ADMIN_CATALOG_GATEWAY);

  async execute(): Promise<CatalogSnapshot> {
    const [services, subjects, qualificationTopics, topics, levels, languages] = await Promise.all(
      (['services', 'subjects', 'qualification-topics', 'topics', 'education-levels', 'languages'] as const)
        .map(kind => firstValueFrom(this.gateway.list(kind))));
    const byOrder = <T extends { displayOrder: number }>(rows: T[]) => rows.sort((a, b) => a.displayOrder - b.displayOrder);
    return {
      services: services!.map(Catalog.service),
      subjects: byOrder(subjects!.map(Catalog.subject)),
      qualificationTopics: qualificationTopics!.map(Catalog.qualificationTopic),
      topics: topics!.map(Catalog.topic),
      levels: levels!.map(Catalog.educationLevel),
      languages: languages!.map(Catalog.language)
    };
  }
}

/** Every Admin change to the catalog; the server validates each against the same rules the forms show. */
@Injectable()
export class ManageCatalog {
  private readonly gateway = inject(ADMIN_CATALOG_GATEWAY);

  create(kind: CatalogKind, body: Json): Promise<unknown> {
    return firstValueFrom(this.gateway.create(kind, body));
  }

  update(kind: Exclude<CatalogKind, 'services'>, id: string, body: Json): Promise<void> {
    return firstValueFrom(this.gateway.update(kind, id, body));
  }

  updateService(id: string, body: Json): Promise<void> {
    return firstValueFrom(this.gateway.updateService(id, body));
  }

  setActive(kind: CatalogKind, id: string, isActive: boolean): Promise<void> {
    return firstValueFrom(this.gateway.setActive(kind, id, isActive));
  }

  addLinkResource(qualificationTopicId: string, body: Json): Promise<unknown> {
    return firstValueFrom(this.gateway.addLinkResource(qualificationTopicId, body));
  }
}
