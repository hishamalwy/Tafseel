import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Availability, ExceptionDraft, RuleDraft } from '../models/availability';
import { OnboardingState } from '../models/readiness';
import { OfferTerms, Offering, ServiceOffer, ServiceType } from '../models/service-offer';
import {
  CredentialDraft, CredentialForm, CredentialKind, NamedItem, OwnProfile, ProfileDraft, ProfileForm, TopicItem, WeeklyRule
} from '../models/teacher-profile';
import { TEACHER_SETUP_GATEWAY } from './teacher-setup.ports';

/** A form the page let through that the rules refuse; nothing was sent. */
export class FormInvalid<P> extends Error {
  constructor(readonly problems: P) { super('The form has problems.'); }
}

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

export interface ProfileWorkspace {
  readonly profile: OwnProfile;
  readonly languages: readonly NamedItem[];
  /** Only topics of subjects the teacher is approved in: the server refuses any other. */
  readonly topics: readonly TopicItem[];
  readonly educationLevels: readonly NamedItem[];
  readonly eligibleSubjects: readonly NamedItem[];
  /** True when a choice list failed to load; the profile itself did. */
  readonly partial: boolean;
}

/** The profile is required; the catalogues it chooses from are settled separately. */
@Injectable()
export class LoadProfileWorkspace {
  private readonly gateway = inject(TEACHER_SETUP_GATEWAY);

  async execute(): Promise<ProfileWorkspace> {
    const [profile, languages, topics, levels, eligible] = await Promise.allSettled([
      firstValueFrom(this.gateway.profile()),
      firstValueFrom(this.gateway.languages()),
      firstValueFrom(this.gateway.topics()),
      firstValueFrom(this.gateway.educationLevels()),
      firstValueFrom(this.gateway.eligibleSubjects())
    ] as const);
    if (profile.status === 'rejected') throw profile.reason;
    const eligibleSubjects = settled(eligible, []);
    const subjectIds = new Set(eligibleSubjects.map(subject => subject.id));
    return {
      profile: profile.value,
      languages: settled(languages, []),
      topics: settled(topics, []).filter(topic => subjectIds.has(topic.subjectId)),
      educationLevels: settled(levels, []),
      eligibleSubjects,
      partial: [languages, topics, levels, eligible].some(result => result.status === 'rejected')
    };
  }
}

@Injectable()
export class SaveTeacherProfile {
  private readonly gateway = inject(TEACHER_SETUP_GATEWAY);

  execute(draft: ProfileDraft): Promise<void> {
    const problems = ProfileForm.problems(draft);
    if (Object.keys(problems).length) return Promise.reject(new FormInvalid(problems));
    return firstValueFrom(this.gateway.saveProfile(ProfileForm.input(draft)));
  }
}

export type TeachingChoice = 'languages' | 'topics' | 'educationLevels';

/** Each list replaces the teacher's whole selection of that kind. */
@Injectable()
export class SaveTeachingChoices {
  private readonly gateway = inject(TEACHER_SETUP_GATEWAY);

  execute(choice: TeachingChoice, ids: readonly string[]): Promise<void> {
    if (choice === 'languages' && !ids.length) return Promise.reject(new FormInvalid({ languages: 'required' }));
    const call = choice === 'languages' ? this.gateway.setLanguages(ids)
      : choice === 'topics' ? this.gateway.setTopics(ids) : this.gateway.setEducationLevels(ids);
    return firstValueFrom(call);
  }
}

@Injectable()
export class ManageCredentials {
  private readonly gateway = inject(TEACHER_SETUP_GATEWAY);

  async add(kind: CredentialKind, draft: CredentialDraft): Promise<void> {
    const problems = CredentialForm.problems(draft);
    if (Object.keys(problems).length) throw new FormInvalid(problems);
    await firstValueFrom(this.gateway.addCredential(kind, draft));
  }

  remove(kind: CredentialKind, id: string): Promise<void> {
    return firstValueFrom(this.gateway.removeCredential(kind, id));
  }
}

export interface ServicesWorkspace {
  readonly types: readonly ServiceType[];
  readonly eligibleSubjects: readonly NamedItem[];
}

@Injectable()
export class LoadServicesWorkspace {
  private readonly gateway = inject(TEACHER_SETUP_GATEWAY);

  async execute(): Promise<ServicesWorkspace> {
    const [types, eligibleSubjects] = await Promise.all([
      firstValueFrom(this.gateway.serviceTypes()),
      firstValueFrom(this.gateway.eligibleSubjects())
    ]);
    return { types, eligibleSubjects };
  }
}

export type ServiceProblem = Partial<Record<keyof OfferTerms | 'subject', string>>;

/**
 * Creating, changing and switching a service on or off. A subject is sellable only when the
 * server listed it as eligible; the API checks the qualification again on every call.
 */
@Injectable()
export class ManageServices {
  private readonly gateway = inject(TEACHER_SETUP_GATEWAY);

  async create(workspace: ServicesWorkspace, type: ServiceType, subjectId: string, terms: OfferTerms): Promise<void> {
    const eligible = new Set(workspace.eligibleSubjects.map(subject => subject.id));
    const problems: ServiceProblem = { ...ServiceOffer.problems(type, terms) };
    if (!ServiceOffer.sellableSubjects(type, eligible).some(subject => subject.id === subjectId)) problems.subject = 'not_sellable';
    if (Object.keys(problems).length) throw new FormInvalid(problems);
    await firstValueFrom(this.gateway.createService(ServiceOffer.input(type, subjectId, terms, true)));
  }

  async update(type: ServiceType, offering: Offering, terms: OfferTerms): Promise<void> {
    const problems = ServiceOffer.problems(type, terms);
    if (Object.keys(problems).length) throw new FormInvalid(problems);
    await firstValueFrom(this.gateway.updateService(
      offering.id, ServiceOffer.input(type, offering.subjectId, terms, null), offering.version));
  }

  setActive(offering: Offering, active: boolean): Promise<void> {
    return firstValueFrom(this.gateway.setServiceActive(offering.id, active, offering.version));
  }
}

@Injectable()
export class LoadOwnProfile {
  private readonly gateway = inject(TEACHER_SETUP_GATEWAY);

  execute(): Promise<OwnProfile> {
    return firstValueFrom(this.gateway.profile());
  }
}

/**
 * The weekly schedule is saved whole: adding windows on several days, or changing one, sends
 * the complete week so the server validates it as a unit (no overlaps, reserved sessions still
 * covered) and either all of it applies or none does. Removing one window uses its own call.
 */
@Injectable()
export class ManageAvailability {
  private readonly gateway = inject(TEACHER_SETUP_GATEWAY);

  async saveRule(existing: readonly WeeklyRule[], draft: RuleDraft, replacing = ''): Promise<void> {
    const problems = Availability.ruleProblems(draft, existing, replacing);
    if (problems.length) throw new FormInvalid(problems);
    await firstValueFrom(this.gateway.replaceRules(Availability.replacement(existing, draft, replacing)));
  }

  removeRule(id: string): Promise<void> {
    return firstValueFrom(this.gateway.removeRule(id));
  }

  async addException(draft: ExceptionDraft): Promise<void> {
    const problems = Availability.exceptionProblems(draft);
    if (problems.length) throw new FormInvalid(problems);
    await firstValueFrom(this.gateway.addException(Availability.exceptionInput(draft)));
  }

  removeException(id: string): Promise<void> {
    return firstValueFrom(this.gateway.removeException(id));
  }
}

export interface PublicationWorkspace {
  readonly state: OnboardingState;
  readonly profile: OwnProfile | null;
}

@Injectable()
export class LoadPublication {
  private readonly gateway = inject(TEACHER_SETUP_GATEWAY);

  async execute(): Promise<PublicationWorkspace> {
    const [state, profile] = await Promise.allSettled([
      firstValueFrom(this.gateway.onboarding()),
      firstValueFrom(this.gateway.profile())
    ]);
    if (state.status === 'rejected') throw state.reason;
    return { state: state.value, profile: settled(profile, null) };
  }
}

@Injectable()
export class SetPublication {
  private readonly gateway = inject(TEACHER_SETUP_GATEWAY);

  execute(published: boolean): Promise<void> {
    return firstValueFrom(this.gateway.setPublished(published));
  }
}
