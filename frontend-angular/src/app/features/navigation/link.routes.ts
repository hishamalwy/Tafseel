import { Routes } from '@angular/router';
import {
  adminOperationsTabGuard, conversationLinkGuard, disputeLinkGuard, liveSessionLinkGuard, requestLinkGuard,
  teacherReviewLinkGuard
} from './services/destination.guards';

/**
 * Child route tables for the link-only routes, loaded on demand so the redirect rules stay
 * out of the initial bundle. Each empty child inherits its parent's `:id` parameter.
 */
export const LIVE_SESSION_LINK: Routes = [{ path: '', canActivate: [liveSessionLinkGuard], children: [] }];
export const CONVERSATION_LINK: Routes = [{ path: '', canActivate: [conversationLinkGuard], children: [] }];
export const REQUEST_LINK: Routes = [{ path: '', canActivate: [requestLinkGuard(false)], children: [] }];
export const REQUEST_OFFERS_LINK: Routes = [{ path: '', canActivate: [requestLinkGuard(true)], children: [] }];
export const DISPUTE_LINK: Routes = [{ path: '', canActivate: [disputeLinkGuard], children: [] }];
export const TEACHER_REVIEW_LINK: Routes = [{ path: '', canActivate: [teacherReviewLinkGuard], children: [] }];
export const ADMIN_OPERATIONS_TAB_LINK: Routes = [{ path: '', canActivate: [adminOperationsTabGuard], children: [] }];
