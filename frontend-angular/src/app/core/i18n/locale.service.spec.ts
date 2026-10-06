import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserPreferences } from '@core/storage/browser-preferences';
import { LocaleService } from './locale.service';

describe('language selection', () => {
  let locale: LocaleService;
  let http: HttpTestingController;
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: LOCALE_ID, useValue: 'en' },
      { provide: BrowserPreferences, useValue: { read: () => 'en', write: () => {} } }] });
    locale = TestBed.inject(LocaleService);
    http = TestBed.inject(HttpTestingController);
    const initial = locale.load('en');
    TestBed.tick();
    // Bootstrap and the preference effect share the same request.
    http.expectOne('locale/en.json').flush({ nav_about: 'About' });
    await initial;
  });
  afterEach(() => http.verify());

  it('keeps content and navigation in English until the Arabic dictionary is ready', async () => {
    const selected = locale.set('ar');
    expect(locale.lang()).toBe('en');
    expect(locale.t('nav_about')).toBe('About');
    http.expectOne('locale/ar.json').flush({ nav_about: 'من نحن' });
    await selected;
    expect(locale.lang()).toBe('ar');
    expect(locale.t('nav_about')).toBe('من نحن');
  });

  it('retains the current language after a failed request, then retries successfully', async () => {
    const failed = locale.set('ar');
    http.expectOne('locale/ar.json').flush('offline', { status: 503, statusText: 'Unavailable' });
    await failed;
    expect(locale.lang()).toBe('en');
    const retry = locale.set('ar');
    http.expectOne('locale/ar.json').flush({ nav_about: 'من نحن' });
    await retry;
    expect(locale.lang()).toBe('ar');
  });

  it('does not apply an older delayed language choice after a newer choice', async () => {
    const older = locale.set('ar');
    await locale.set('en');
    http.expectOne('locale/ar.json').flush({ nav_about: 'من نحن' });
    await older;
    expect(locale.lang()).toBe('en');
  });
});
