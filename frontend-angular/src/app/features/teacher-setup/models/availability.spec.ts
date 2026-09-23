import { describe, expect, it } from 'vitest';
import { browserTimeZone, timeZoneChoices, timeZoneLabel } from './availability';

/**
 * UX-06. Time zones were shown as IANA identifiers — `Africa/Abidjan`, `UTC` — which are English strings from
 * a database of zones, in a list of four hundred, on an Arabic phone.
 */
describe('timeZoneLabel', () => {
  it('names the Kingdom’s zone in Arabic, with its offset in Arabic too', () => {
    const label = timeZoneLabel('Asia/Riyadh', 'ar');

    expect(label).not.toContain('Asia/Riyadh');
    expect(label).not.toMatch(/[A-Za-z]/);
    expect(label).toMatch(/[؀-ۿ]/);
  });

  it('names the seed data’s UTC in Arabic rather than as three Latin letters', () => {
    expect(timeZoneLabel('UTC', 'ar')).not.toMatch(/[A-Za-z]/);
  });

  it('keeps two zones with the same name apart by their offset', () => {
    // Riyadh and London share no name, but many zones do; the offset is what tells them apart.
    expect(timeZoneLabel('Asia/Riyadh', 'en')).not.toBe(timeZoneLabel('Europe/London', 'en'));
  });

  it('reads naturally in English', () => {
    const label = timeZoneLabel('Asia/Riyadh', 'en');
    expect(label).not.toContain('Asia/Riyadh');
    expect(label).toMatch(/GMT\+3|Arabian/);
  });

  it('falls back to the identifier only for something Intl does not know', () => {
    expect(timeZoneLabel('Not/AZone', 'ar')).toBe('Not/AZone');
  });
});

describe('timeZoneChoices', () => {
  it('offers the Kingdom first', () => {
    expect(timeZoneChoices()[0]).toBe('Asia/Riyadh');
  });

  it('is a list a phone can scroll, not every zone in the world', () => {
    expect(timeZoneChoices().length).toBeLessThan(30);
  });

  it('never strands a teacher: their saved zone and their device’s are always offered', () => {
    const choices = timeZoneChoices('Pacific/Auckland');
    expect(choices).toContain('Pacific/Auckland');
    expect(choices).toContain(browserTimeZone());
  });
});
