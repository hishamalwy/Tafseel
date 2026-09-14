import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** How long the object URL stays alive after the tab or download starts. */
const REVOKE_AFTER_MS = 60_000;

export interface ProtectedObjectUrl {
  readonly url: string;
  readonly contentType: string;
  revoke(): void;
}

/**
 * Opening a file that needs the session's credentials.
 *
 * A protected file cannot be an `href`: the browser would fetch it without the
 * interceptors, get a 401, and show the visitor a bare error page. It is fetched
 * as a blob first and handed to the browser as an object URL — which is also why
 * the URL is revoked on a timer rather than immediately: revoking it before the
 * new tab has read it produces an empty tab.
 */
@Injectable({ providedIn: 'root' })
export class ProtectedFile {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  async open(path: string, options: { download?: boolean; fileName?: string } = {}): Promise<void> {
    if (!this.isBrowser) return;
    const response = await this.response(path);

    const view = this.document.defaultView;
    if (!response.body || !view) return;
    const objectUrl = view.URL.createObjectURL(response.body);

    if (options.download) {
      this.click(objectUrl, options.fileName || this.fileNameOf(response) || 'download');
    } else if (!view.open(objectUrl, '_blank', 'noopener')) {
      // Popup blocked: a real click on a real anchor is allowed where
      // `window.open` was not.
      this.click(objectUrl);
    }

    view.setTimeout(() => view.URL.revokeObjectURL(objectUrl), REVOKE_AFTER_MS);
  }

  /** Creates a short-lived URL for an in-app viewer; the caller owns cleanup. */
  async objectUrl(path: string): Promise<ProtectedObjectUrl | null> {
    if (!this.isBrowser) return null;
    const response = await this.response(path);
    const view = this.document.defaultView;
    if (!response.body || !view) return null;
    const url = view.URL.createObjectURL(response.body);
    let active = true;
    return {
      url,
      contentType: response.body.type || response.headers.get('content-type') || '',
      revoke: () => {
        if (!active) return;
        active = false;
        view.URL.revokeObjectURL(url);
      }
    };
  }

  private response(path: string): Promise<HttpResponse<Blob>> {
    return firstValueFrom(this.http.get(path, {
      observe: 'response', responseType: 'blob'
    })) as Promise<HttpResponse<Blob>>;
  }

  private click(href: string, download?: string): void {
    const anchor = this.document.createElement('a');
    anchor.href = href;
    if (download) anchor.download = download;
    else { anchor.target = '_blank'; anchor.rel = 'noopener'; }
    this.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  private fileNameOf(response: HttpResponse<Blob>): string {
    const header = response.headers.get('content-disposition') ?? '';
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
    if (!match?.[1]) return '';
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
}
