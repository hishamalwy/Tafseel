/**
 * A number with its noun, in the grammar of the reader's language: "1 day", "2 days"; in Arabic
 * "يوم واحد", "يومان", "3 أيام", "11 يومًا". Keys are `{stem}_{plural category}` (one, two, few,
 * many, other) with `{stem}_other` as the fallback, so English needs only `_one` and `_other`.
 */
export function countText(
  t: (key: string, fallback: string) => string, lang: string,
  stem: string, n: number, fallbackOne: string, fallbackOther: string
): string {
  let category = 'other';
  try { category = new Intl.PluralRules(lang).select(n); } catch { /* keep other */ }
  const fallback = n === 1 ? fallbackOne : fallbackOther;
  const text = t(`${stem}_${category}`, '') || t(`${stem}_other`, '') || fallback;
  return text.replaceAll('{n}', String(n));
}
