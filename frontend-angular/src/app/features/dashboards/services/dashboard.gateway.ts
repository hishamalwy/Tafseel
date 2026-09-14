import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DashboardGateway {
  private readonly http = inject(HttpClient);

  async load(sources: readonly string[]): Promise<readonly { source: string; payload: unknown; error?: string }[]> {
    return Promise.all(sources.map(async source => {
      try { return { source, payload: await firstValueFrom(this.http.get<unknown>('/api/v1' + source)) }; }
      catch { return { source, payload: null, error: 'Request failed' }; }
    }));
  }

  post(path: string, body: unknown = null, version = ''): Promise<unknown> {
    return firstValueFrom(this.http.post('/api/v1' + path, body, { headers: headers(version) }));
  }

  patch(path: string, body: unknown, version = ''): Promise<unknown> {
    return firstValueFrom(this.http.patch('/api/v1' + path, body, { headers: headers(version) }));
  }

  put(path: string, body: unknown, version = ''): Promise<unknown> {
    return firstValueFrom(this.http.put('/api/v1' + path, body, { headers: headers(version) }));
  }

  upload(path: string, files: readonly File[], version = '', fieldName = 'files'): Promise<unknown> {
    const body = new FormData();
    for (const file of files) body.append(fieldName, file, file.name);
    return firstValueFrom(this.http.post('/api/v1' + path, body, { headers: headers(version) }));
  }

  delete(path: string, version = ''): Promise<unknown> {
    return firstValueFrom(this.http.delete('/api/v1' + path, { headers: headers(version) }));
  }
}

function headers(version: string): HttpHeaders {
  return version ? new HttpHeaders({ 'If-Match': version }) : new HttpHeaders();
}
