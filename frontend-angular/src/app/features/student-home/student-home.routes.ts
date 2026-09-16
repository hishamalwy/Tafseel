import { Routes } from '@angular/router';
import { HttpStudentHomeGateway } from './services/http-student-home.gateway';
import { STUDENT_HOME_GATEWAY } from './services/student-home.ports';
import { LoadStudentHome } from './services/student-home.use-cases';

/**
 * The student's home (UX-01). The parent route requires the Student role; every list the page reads is
 * authorized by the API to the signed-in student's own items regardless.
 */
export const STUDENT_HOME_ROUTES: Routes = [{
  path: '',
  providers: [
    HttpStudentHomeGateway,
    { provide: STUDENT_HOME_GATEWAY, useExisting: HttpStudentHomeGateway },
    LoadStudentHome
  ],
  loadComponent: () => import('./pages/student-home-page.component').then(m => m.StudentHomePageComponent)
}];
