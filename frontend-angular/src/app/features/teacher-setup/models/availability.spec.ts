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

  it('leads with the city, so zones that share a name can be told apart and Cairo can be found', () => {
    const gulf = ['Asia/Riyadh', 'Asia/Kuwait', 'Asia/Qatar'].map(zone => timeZoneLabel(zone, 'ar'));
    expect(new Set(gulf).size).toBe(3);
    expect(timeZoneLabel('Asia/Riyadh', 'ar')).toContain('الرياض');
    expect(timeZoneLabel('Africa/Cairo', 'ar')).toContain('القاهرة');
    expect(timeZoneLabel('Africa/Cairo', 'en')).toMatch(/^Cairo \(GMT\+\d/);
    expect(timeZoneLabel('America/Los_Angeles', 'en')).toMatch(/^Los Angeles/);
  });

  it('falls back to the identifier only for something Intl does not know', () => {
    expect(timeZoneLabel('Not/AZone', 'ar')).toBe('Not/AZone');
  });
});

describe('timeZoneChoices', () => {
  it('offers the Kingdom first', () => {
    expect(timeZoneChoices()[0]).toBe('Asia/Riyadh');
  });

  it('takes no zone away: every zone the browser knows is still offered', () => {
    const all = (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone');
    const choices = timeZoneChoices();
    for (const zone of all) expect(choices).toContain(zone);
    expect(new Set(choices).size).toBe(choices.length);
  });

  it('never strands a teacher: their saved zone and their device’s are always offered', () => {
    const choices = timeZoneChoices('Pacific/Auckland');
    expect(choices).toContain('Pacific/Auckland');
    expect(choices).toContain(browserTimeZone());
  });
});
