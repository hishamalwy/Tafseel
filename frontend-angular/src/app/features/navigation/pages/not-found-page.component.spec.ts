import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';
import { NotFoundPageComponent } from './not-found-page.component';

describe('NotFoundPageComponent', () => {
  it('renders a real not-found page for an unknown address and keeps it out of the index', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        provideRouter([{ path: '', children: [] }, { path: 'teachers', children: [] }, { path: '**', component: NotFoundPageComponent }])
      ]
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/no/such/page?x=1');
    await Promise.resolve();
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('[data-testid="not-found"]')).not.toBeNull();
    expect(page.querySelector('h1')?.textContent?.trim()).toBeTruthy();
    expect(page.querySelector('code')?.textContent).toBe('/no/such/page?x=1');
    const links = Array.from(page.querySelectorAll<HTMLAnchorElement>('.tf-not-found__actions a')).map(a => a.getAttribute('href'));
    expect(links).toEqual(['/', '/teachers']);
    expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe('noindex');
    expect(TestBed.inject(Title).getTitle()).toContain('Tafseel');
  });
});
