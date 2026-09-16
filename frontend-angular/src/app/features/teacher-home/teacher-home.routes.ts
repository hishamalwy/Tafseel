import { Routes } from '@angular/router';
import { HttpTeacherHomeGateway } from './services/http-teacher-home.gateway';
import { TEACHER_HOME_GATEWAY } from './services/teacher-home.ports';
import { LoadTeacherHome } from './services/teacher-home.use-cases';

/**
 * The teacher's home (UX-02). The parent route requires the Teacher role; every read the page makes is
 * authorized by the API to the signed-in teacher's own assignments regardless.
 */
export const TEACHER_HOME_ROUTES: Routes = [{
  path: '',
  providers: [
    HttpTeacherHomeGateway,
    { provide: TEACHER_HOME_GATEWAY, useExisting: HttpTeacherHomeGateway },
    LoadTeacherHome
  ],
  loadComponent: () => import('./pages/teacher-home-page.component').then(m => m.TeacherHomePageComponent)
}];
