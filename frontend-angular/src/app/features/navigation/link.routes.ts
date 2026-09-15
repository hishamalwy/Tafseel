import { Routes } from '@angular/router';
import { adminOperationsTabGuard, disputeLinkGuard, teacherReviewLinkGuard } from './services/destination.guards';

/**
 * Child route tables for the link-only routes, loaded on demand so the redirect rules stay
 * out of the initial bundle. Each empty child inherits its parent's `:id` parameter.
 */
export const DISPUTE_LINK: Routes = [{ path: '', canActivate: [disputeLinkGuard], children: [] }];
export const TEACHER_REVIEW_LINK: Routes = [{ path: '', canActivate: [teacherReviewLinkGuard], children: [] }];
export const ADMIN_OPERATIONS_TAB_LINK: Routes = [{ path: '', canActivate: [adminOperationsTabGuard], children: [] }];
