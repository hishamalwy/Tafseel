import { Provider } from '@angular/core';
import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '@shared/utils/unsaved-changes';
import { HttpTeacherSetupGateway } from './services/http-teacher-setup.gateway';
import { TEACHER_SETUP_GATEWAY } from './services/teacher-setup.ports';
import {
  LoadOwnProfile, LoadProfileWorkspace, LoadPublication, LoadServicesWorkspace, ManageAvailability, ManageCredentials,
  LoadSetupProgress, ManagePublicVideo, ManageServices, SaveTeacherProfile, SaveTeachingChoices, SetPublication
} from './services/teacher-setup.use-cases';

/**
 * The teacher's marketplace setup: profile (J11-06), services and prices (J11-07),
 * availability (J11-08) and publication (J11-09). Each is its own section of the teacher
 * workspace; the bindings load with them. The parent routes require the Teacher role, and the
 * API authorizes every call to the signed-in teacher's own data regardless.
 */
const providers: Provider[] = [
  HttpTeacherSetupGateway,
  { provide: TEACHER_SETUP_GATEWAY, useExisting: HttpTeacherSetupGateway },
  LoadSetupProgress
];

export const PROFILE_ROUTES: Routes = [{
  path: '',
  canDeactivate: [unsavedChangesGuard],
  providers: [...providers, LoadProfileWorkspace, SaveTeacherProfile, SaveTeachingChoices, ManageCredentials],
  loadComponent: () => import('./pages/teacher-profile-editor-page.component').then(m => m.TeacherProfileEditorPageComponent)
}];

export const SERVICES_ROUTES: Routes = [{
  path: '',
  canDeactivate: [unsavedChangesGuard],
  providers: [...providers, LoadServicesWorkspace, ManageServices],
  loadComponent: () => import('./pages/teacher-services-page.component').then(m => m.TeacherServicesPageComponent)
}];

export const AVAILABILITY_ROUTES: Routes = [{
  path: '',
  providers: [...providers, LoadOwnProfile, ManageAvailability],
  loadComponent: () => import('./pages/teacher-availability-page.component').then(m => m.TeacherAvailabilityPageComponent)
}];

export const PUBLICATION_ROUTES: Routes = [{
  path: '',
  providers: [...providers, LoadPublication, SetPublication, ManagePublicVideo],
  loadComponent: () => import('./pages/teacher-publication-page.component').then(m => m.TeacherPublicationPageComponent)
}];
