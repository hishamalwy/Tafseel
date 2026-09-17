import { Routes } from '@angular/router';

/**
 * "My requests & orders" (student) and "Work" (teacher) — one screen, two viewers (UX-03). Each parent
 * route already requires the right role; the API returns only the caller's own items regardless.
 */
export const STUDENT_WORK_ROUTES: Routes = [{
  path: '',
  data: { viewer: 'student' },
  loadComponent: () => import('./pages/work-list-page.component').then(m => m.WorkListPageComponent)
}];

export const TEACHER_WORK_ROUTES: Routes = [{
  path: '',
  data: { viewer: 'teacher' },
  loadComponent: () => import('./pages/work-list-page.component').then(m => m.WorkListPageComponent)
}];
