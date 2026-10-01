/**
 * The lengths of time offered in a duration picker, in hours (the unit the API stores). A person picks
 * "2 days" from a short list instead of typing 48 into an hours box; the current value is always kept,
 * so an older offer or service saved at an unusual length still shows what it is.
 */
const PRESETS = [1, 2, 3, 6, 12, 24, 36, 48, 72, 96, 120, 168, 240, 336, 504, 720, 1080, 1440, 2160, 4320, 8760];

export function durationChoices(min: number, max: number, current?: number | null): number[] {
  const choices = PRESETS.filter(h => h >= min && h <= max);
  if (current != null && Number.isFinite(current) && current >= min && current <= max && !choices.includes(current)) {
    choices.push(current);
  }
  return choices.sort((a, b) => a - b);
}
