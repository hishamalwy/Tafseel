/**
 * Where a Teacher is in the application lifecycle.
 *
 * A Teacher whose profile is not published cannot use the teacher workspace, so
 * this outranks any requested destination after login.
 */
export interface TeacherOnboarding {
  readonly isPublished: boolean;
  readonly nextUrl: string | null;
}
