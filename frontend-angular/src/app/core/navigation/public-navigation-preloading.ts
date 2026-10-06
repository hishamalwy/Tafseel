import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { EMPTY, Observable } from 'rxjs';

/** Warm the public navigation after the first route, without loading role workspaces. */
@Injectable({ providedIn: 'root' })
export class PublicNavigationPreloading implements PreloadingStrategy {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly paths = new Set(['', 'about', 'teachers', 'teachers/:teacherId', 'auth']);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    const navigator = this.document.defaultView?.navigator as (Navigator & { connection?: { saveData?: boolean } }) | undefined;
    return this.browser && this.paths.has(route.path ?? '') && !navigator?.connection?.saveData ? load() : EMPTY;
  }
}
