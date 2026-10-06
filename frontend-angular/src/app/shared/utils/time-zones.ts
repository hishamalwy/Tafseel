import { AR_ZONE_CITIES } from './time-zone-cities';

/** The zone the browser runs in, e.g. `Africa/Cairo`. */
export function browserTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

/**
 * The zones Tafseel offers first: the Kingdom, then the Gulf and the places its teachers most often live.
 * Every other zone still follows — UX-06 names them in the reader's language; it does not take any away.
 */
const NEAR_ZONES: readonly string[] = [
  'Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Bahrain', 'Asia/Muscat',
  'Asia/Amman', 'Asia/Beirut', 'Asia/Damascus', 'Asia/Baghdad', 'Africa/Cairo', 'Africa/Khartoum',
  'Asia/Istanbul', 'Europe/London', 'America/New_York'
];

/**
 * Zones to choose from: the near list first, then anything already saved and the device's own, then every
 * other zone the browser knows, so no teacher loses a choice they had.
 */
export function timeZoneChoices(...saved: readonly string[]): readonly string[] {
  let zones: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    zones = intl.supportedValuesOf?.('timeZone') ?? [];
  } catch { zones = []; }
  const near = NEAR_ZONES.filter(zone => zones.length === 0 || zones.includes(zone));
  const all = new Set([...saved.filter(Boolean), browserTimeZone(), ...near, ...zones]);
  return [...all];
}

/**
 * What a zone is called to the person reading it (UX-06).
 *
 * The control used to print the IANA identifier — `Africa/Abidjan` — which is an English string from a
 * database of time zones, not something written for a student or a teacher, and it sat in a list of four
 * hundred of them on a phone in Arabic. `Intl` names the zone in the reader's own language; the offset
 * follows so two zones sharing a name are still distinguishable.
 */
export function timeZoneLabel(zone: string, lang: string): string {
  const locale = lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US';
  try {
    const name = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'long' })
      .formatToParts(new Date())
      .find(part => part.type === 'timeZoneName')?.value;
    const offset = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find(part => part.type === 'timeZoneName')?.value;
    if (!name) return zone;
    // People look for their city, not for a zone's official name: Riyadh, Kuwait and Qatar all read
    // "Arabia Standard Time (GMT+3)", and Cairo reads "Eastern European Summer Time", which no one in
    // Cairo would look for. The city leads wherever we know it.
    const city = zoneCity(zone, lang);
    if (city) return offset ? `${city} (${offset})` : city;
    return offset ? `${name} (${offset})` : name;
  } catch {
    return zone;
  }
}

/** Cities of the zones Tafseel offers first, in both languages; other zones are named by Intl alone in Arabic. */
const ZONE_CITIES: Readonly<Record<string, readonly [en: string, ar: string]>> = {
  'Asia/Riyadh': ['Riyadh', 'الرياض'], 'Asia/Dubai': ['Dubai', 'دبي'], 'Asia/Kuwait': ['Kuwait', 'الكويت'],
  'Asia/Qatar': ['Doha', 'الدوحة'], 'Asia/Bahrain': ['Bahrain', 'البحرين'], 'Asia/Muscat': ['Muscat', 'مسقط'],
  'Asia/Amman': ['Amman', 'عمّان'], 'Asia/Beirut': ['Beirut', 'بيروت'], 'Asia/Damascus': ['Damascus', 'دمشق'],
  'Asia/Baghdad': ['Baghdad', 'بغداد'], 'Africa/Cairo': ['Cairo', 'القاهرة'], 'Africa/Khartoum': ['Khartoum', 'الخرطوم'],
  'Asia/Istanbul': ['Istanbul', 'إسطنبول'], 'Europe/Istanbul': ['Istanbul', 'إسطنبول'], 'Europe/London': ['London', 'لندن'],
  'America/New_York': ['New York', 'نيويورك'], 'Asia/Aden': ['Aden', 'عدن'], 'Africa/Tripoli': ['Tripoli', 'طرابلس'],
  'Africa/Tunis': ['Tunis', 'تونس'], 'Africa/Algiers': ['Algiers', 'الجزائر'], 'Africa/Casablanca': ['Casablanca', 'الدار البيضاء'],
  'UTC': ['Greenwich time', 'توقيت غرينتش'], 'Etc/UTC': ['Greenwich time', 'توقيت غرينتش'],
  'Asia/Jerusalem': ['Jerusalem', 'القدس'], 'Asia/Gaza': ['Gaza', 'غزة'], 'Asia/Hebron': ['Hebron', 'الخليل']
};

function zoneCity(zone: string, lang: string): string {
  const known = ZONE_CITIES[zone];
  if (known) return lang === 'ar' ? known[1] : known[0];
  // In English the identifier's last part is the city ("America/Los_Angeles"); in Arabic it would be Latin.
  if (lang === 'ar') return AR_ZONE_CITIES[zone] || AR_ZONE_CITIES[Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone] || '';
  if (!zone.includes('/')) return '';
  return zone.split('/').pop()!.replace(/_/g, ' ');
}
