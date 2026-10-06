import { HttpClient } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { expect, it, vi } from 'vitest';
import { HttpLandingGateway } from './http-landing.gateway';

it('defers optional landing reads to the browser, where the existing API paths still apply', async () => {
  for (const platform of ['server', 'browser']) {
    TestBed.resetTestingModule();
    const get = vi.fn().mockReturnValue(of(null));
    TestBed.configureTestingModule({ providers: [
      HttpLandingGateway,
      { provide: PLATFORM_ID, useValue: platform },
      { provide: HttpClient, useValue: { get } }
    ] });
    const gateway = TestBed.inject(HttpLandingGateway);
    expect(await firstValueFrom(gateway.platformStats())).toBeNull();
    expect(await firstValueFrom(gateway.promotions())).toEqual([]);
    if (platform === 'server') expect(get).not.toHaveBeenCalled();
    else expect(get.mock.calls.map(call => call[0])).toEqual(['/api/v1/platform/stats', '/api/v1/promotions']);
  }
});
