import { RenderMode, ServerRoute } from '@angular/ssr';
import { POLICY_ORDER } from '@features/policies/models/policy';

/**
 * Render mode per route — the answer to "SEO or engineering discipline".
 *
 * The split is the one the product already implies, and the one Phase 00 wrote
 * into the legacy pages as `robots` tags:
 *
 *  - Prerender  static marketing surfaces. Built once, served as HTML, no Node
 *               process at request time.
 *  - Server     data-driven public pages. These are the ones a crawler must see
 *               filled in, and their content changes per request.
 *  - Client     everything behind a login. Already `noindex`; rendering them on
 *               the server would leak nothing useful and cost a round trip.
 *
 * `/auth` is Client on purpose: it is a form with no indexable content, it reads
 * `localStorage` for theme and language before first paint, and server-rendering
 * a login screen invites caching a page that varies per visitor.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: 'policies/:policy',
    renderMode: RenderMode.Prerender,
    // The set is closed and known at build time, so every document becomes a
    // real HTML file — indexable, and served without a Node process.
    getPrerenderParams: async () => POLICY_ORDER.map(policy => ({ policy }))
  },
  { path: 'policies', renderMode: RenderMode.Prerender },

  { path: 'about', renderMode: RenderMode.Prerender },

  // The home page is public, data-driven and the one page a crawler reaches
  // first, so it renders on the server with real teachers and subjects in it.
  { path: '', renderMode: RenderMode.Server },

  // Public and data-driven: exactly the pages a crawler must see filled in, and
  // their content changes per request, so they render on the server.
  { path: 'teachers', renderMode: RenderMode.Server },
  { path: 'teachers/:teacherId', renderMode: RenderMode.Server },

  // Forms behind no index value: they read localStorage before first paint and
  // vary per visitor, so there is nothing to gain from rendering them upstream.
  { path: 'auth', renderMode: RenderMode.Client },
  { path: 'auth/confirm-email', renderMode: RenderMode.Client },
  { path: 'disputes', renderMode: RenderMode.Client },
  { path: 'checkout', renderMode: RenderMode.Client },
  { path: 'checkout/simulator', renderMode: RenderMode.Client },
  { path: 'sessions/book', renderMode: RenderMode.Client },
  { path: 'requests/new', renderMode: RenderMode.Client },
  { path: 'requests', renderMode: RenderMode.Client },
  { path: 'teach/apply', renderMode: RenderMode.Client },
  { path: 'student/**', renderMode: RenderMode.Client },
  { path: 'teacher/**', renderMode: RenderMode.Client },
  { path: 'quality/**', renderMode: RenderMode.Client },
  { path: 'admin/**', renderMode: RenderMode.Client },

  // Links the server hands out, all behind a login.
  { path: 'orders/:orderId', renderMode: RenderMode.Client },
  { path: 'live-sessions/:sessionId', renderMode: RenderMode.Client },
  { path: 'conversations/:conversationId', renderMode: RenderMode.Client },
  { path: 'messages', renderMode: RenderMode.Client },
  { path: 'requests/**', renderMode: RenderMode.Client },
  { path: 'disputes/**', renderMode: RenderMode.Client },

  // Unknown addresses render the not-found page in the browser; there is nothing to
  // prerender for a path nobody defined.
  { path: '**', renderMode: RenderMode.Client }
];
