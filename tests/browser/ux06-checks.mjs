/* The seven checks UX-06 runs on every customer screen, in one place.
 *
 * Each matrix row calls `screen(...)` and gets the same treatment, so "verified on an Arabic phone" means
 * the same thing on row 1 and row 20. The checks are deliberately blunt: they read the rendered page rather
 * than the component that produced it, because that is what the student sees.
 *
 *   H  no page-level horizontal scrolling
 *   C  nothing spills out of its card, dialog or list row
 *   R  the document really is right-to-left
 *   E  no English product copy, no raw key, id, enum or `undefined`
 *   D  money is drawn, not spelled in Latin letters
 *   T  anything you tap is big enough to tap
 *   P  the screen's main action is on screen
 */
import assert from 'node:assert/strict';
import { shot } from './wave3b-harness.mjs';

export const PHONE = { viewport: { width: 390, height: 844 }, locale: 'ar-SA', isMobile: true, hasTouch: true, deviceScaleFactor: 3 };

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const MACHINE = /\bundefined\b|\bnull\b|\bNaN\b|\[object |\{\{|\}\}/;
/** camelCase or snake_case identifiers that escaped as copy (`whatYouTried`, `order_status_paid`). */
const RAW_KEY = /\b[a-z]+(?:[A-Z][a-z]+){1,}\b|\b[a-z]+(?:_[a-z]+){2,}\b/;

/**
 * Latin text a person legitimately put there, which E must not fail on: names and messages typed by the
 * seeded users, file names, email addresses, and the few brand words Tafseel writes in Latin on purpose.
 */
const ALLOWED_LATIN = [
  /[\w.+-]+@[\w-]+\.[\w.]+/g,            // email addresses
  // File names, which the student chose and may be in any script: anything unbroken ending in a known
  // extension. `\w` would not match Arabic, and a file called «شرح.pdf» is not English on the screen.
  /\S+\.(pdf|png|jpg|jpeg|webp|mp4|webm|mp3|wav|m4a|csv|txt|docx?)\b/gi,
  /\bTafseel\b/g,
  // "webhook" and "Staging" were once listed here and hid a real defect: checkout told every student
  // «يصل التأكيد عبر webhook». Developer words are never an exception; the copy was rewritten instead.
  /\bCVC\b/g,
  // File formats and the applications that make them. Arabic writes these in Latin — «PDF وWord وصور» is
  // the Arabic sentence, not an untranslated one — exactly as the ticket allows for SAR.
  /\b(PDF|PNG|JPE?G|WebP|GIF|MP4|WebM|WAV|MP3|M4A|AAC|OGG|ZIP|CSV|DOCX?|PPTX?|XLSX?|Word|PowerPoint|Excel)\b/gi
  // "SAR" is deliberately NOT allowed: the mark is drawn now, and plain-text money says «ر.س» in Arabic.
  // If those letters appear on an Arabic screen again, they are a defect, not an exception.
];

/**
 * Fixture text a journey knows is seed data rather than copy, allowed on every screen. The E2E seed appends a
 * random hex run id to the names it creates («تفاضل وتكامل تجريبي 61fefde3»); three of its letters in a row
 * are the seed's, not an untranslated word.
 */
const FIXTURE = [];
export function allowFixture(...patterns) { FIXTURE.push(...patterns); }

/** What is visibly on the page: the main region, any open dialog, the notification panel and any toast. */
const visibleText = page => page.evaluate(() => {
  const parts = [];
  const push = el => { if (el && el.offsetParent !== null || el?.tagName === 'DIALOG') parts.push(el.innerText || ''); };
  document.querySelectorAll('main, dialog[open], [data-testid=notification-panel], .tf-toast').forEach(push);
  return parts.join('\n').replace(/\s+/g, ' ').trim();
});

/** The same text with everything a person legitimately typed removed. */
function latinLeft(text, extraAllowed = []) {
  let rest = text;
  for (const pattern of [...ALLOWED_LATIN, ...FIXTURE, ...extraAllowed]) rest = rest.replace(pattern, ' ');
  return [...new Set(rest.match(/[A-Za-z]{3,}/g) ?? [])];
}

async function checkH(page, where) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `${where} [H]: page scrolls sideways by ${overflow}px`);
}

async function checkC(page, where) {
  const spilled = await page.evaluate(() => {
    // Every kind of box a customer screen draws: cards, dialogs and the checkout receipt, plus the dispute,
    // booking and message layouts, which have their own containers rather than the shared card classes.
    const boxes = [...document.querySelectorAll([
      '.tf-profile-editor-card', '.tf-card', '.tf-dashboard-card', '.tf-work-card', '.tf-offer-row', 'dialog[open]',
      '.tf-pay-receipt', '.tf-req-context', '.tf-bubble', '.tf-home-card',
      '.tf-dispute-create', '.tf-dispute-list', '.tf-dispute-detail', '.tf-dispute-message', '.tf-dispute-evidence',
      '.tf-book-form', '.tf-book-fieldset', '.tf-book-chosen', '#workspace-navigation[data-drawer="open"]',
      '[data-testid=notification-panel]'
    ].join(', '))];
    return boxes.flatMap(card => {
      const box = card.getBoundingClientRect();
      if (!box.width) return [];
      return [...card.querySelectorAll('li, button, a, dl, dd, dt, p, h1, h2, h3, span, img, input, select, textarea')]
        .filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.left < box.left - 1 || r.right > box.right + 1);
        })
        .map(el => `${el.tagName.toLowerCase()}: ${(el.textContent || '').trim().slice(0, 40)}`);
    });
  });
  assert.deepEqual(spilled, [], `${where} [C]: content outside its card`);
}

async function checkR(page, where) {
  const dir = await page.evaluate(() => ({
    html: document.documentElement.dir,
    lang: document.documentElement.lang,
    main: getComputedStyle(document.querySelector('main') ?? document.body).direction
  }));
  assert.equal(dir.html, 'rtl', `${where} [R]: <html dir>`);
  assert.equal(dir.lang, 'ar', `${where} [R]: <html lang>`);
  assert.equal(dir.main, 'rtl', `${where} [R]: main direction`);
}

async function checkE(page, where, allow) {
  const text = await visibleText(page);
  assert.doesNotMatch(text, MACHINE, `${where} [E]: a machine word is on screen`);
  assert.doesNotMatch(text, GUID, `${where} [E]: an internal id is on screen`);
  const key = text.match(RAW_KEY);
  assert.equal(key, null, `${where} [E]: a raw key is on screen (${key?.[0]})`);
  const latin = latinLeft(text, allow);
  assert.deepEqual(latin, [], `${where} [E]: English words on an Arabic screen`);
}

async function checkD(page, where) {
  // Money is drawn with the riyal mark, so an Arabic screen never spells the currency in Latin letters.
  const prices = await page.evaluate(() =>
    [...document.querySelectorAll('tf-price, .tf-price-line')].map(el => el.innerText || ''));
  for (const price of prices) {
    assert.ok(!/SAR/i.test(price), `${where} [D]: a price reads "${price.trim()}"`);
  }
  // Plain-text money too: amounts are written in Latin digits even in Arabic (SAMA writes «1,620 ر.س»), so
  // Arabic-Indic digits against the currency mean something formatted money outside the house formatter.
  const text = await visibleText(page);
  const indic = text.match(/[٠-٩][٠-٩٫٬.,]*\s*‏?\s*ر\.س|ر\.س\.?\s*‏?\s*[٠-٩]/);
  assert.equal(indic, null, `${where} [D]: money in Arabic-Indic digits ("${indic?.[0]}")`);
}

async function checkT(page, where) {
  const small = await page.evaluate(() => {
    // The matrix excepts "inline text links inside paragraphs": a link sitting inside a sentence, where
    // enlarging it would break the line rather than help anyone. A link whose parent carries other words
    // around it is one of those; a link on its own in a row is not.
    const inline = el => {
      if (el.closest('p, .tf-prose, .tf-state-body, .tf-field-help, .tf-muted')) return true;
      if (el.tagName !== 'A') return false;
      const parent = el.parentElement;
      if (!parent) return false;
      const around = (parent.textContent || '').replace(el.textContent || '', '').trim();
      return around.length > 0;
    };
    // A checkbox is tapped through its label, which is what the design system sizes; measuring the 16px
    // box inside it would be measuring the wrong thing.
    const target = el => (el.matches('input[type=checkbox], input[type=radio]')
      ? el.closest('label') ?? el : el);
    return [...document.querySelectorAll('main button, main a, main input, main select, main [role=button], dialog[open] button, dialog[open] a')]
      .filter(el => el.offsetParent !== null && !el.hasAttribute('disabled'))
      .filter(el => !inline(el))
      .map(el => ({ el, r: target(el).getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 24))
      .map(({ el, r }) => `${el.tagName.toLowerCase()}"${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
  });
  assert.deepEqual(small, [], `${where} [T]: targets under 44px tall`);
}

/**
 * A long form keeps its Save at the end of the fields, which is where a person looks for it — so for those
 * screens P asks the stronger question instead: after scrolling to the bottom, is the action actually there,
 * on screen, big enough to press, and did reaching it not break the layout sideways?
 */
async function checkPAfterScroll(page, where) {
  const actions = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll(
      'main .tf-button:not(.tf-button-ghost):not(.tf-button-secondary), main button[type=submit]')]
      .filter(el => el.offsetParent !== null);
    return buttons.map((el, i) => {
      el.setAttribute('data-ux06-action', String(i));
      return { i, text: (el.textContent || '').trim().slice(0, 30) };
    });
  });
  assert.ok(actions.length > 0, `${where} [P]: the form has no primary action at all`);

  for (const action of actions) {
    const box = await page.evaluate(index => {
      const el = document.querySelector(`[data-ux06-action="${index}"]`);
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height, width: r.width, view: window.innerHeight };
    }, action.i);
    assert.ok(box.bottom > 0 && box.top < box.view,
              `${where} [P]: "${action.text}" cannot be brought on screen`);
    assert.ok(box.height >= 44, `${where} [P]: "${action.text}" is only ${Math.round(box.height)}px tall`);
  }
  await checkH(page, `${where} scrolled to its actions`);
  await page.evaluate(() => {
    document.querySelectorAll('[data-ux06-action]').forEach(el => el.removeAttribute('data-ux06-action'));
    window.scrollTo(0, 0);
  });
}

async function checkP(page, where) {
  const cta = await page.evaluate(() => {
    const button = [...document.querySelectorAll(
      'main .tf-button:not(.tf-button-ghost):not(.tf-button-secondary), main .tf-pay-cta, main button[type=submit], .tf-pay-mobile-cta button, dialog[open] button[type=submit]')]
      .find(el => el.offsetParent !== null);
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { text: (button.textContent || '').trim().slice(0, 40), top: r.top, bottom: r.bottom, height: window.innerHeight };
  });
  if (cta === null) return 'none';     // screens the matrix marks "—" have no primary action by design
  assert.ok(cta.bottom > 0 && cta.top < cta.height,
            `${where} [P]: the main action "${cta.text}" is off screen (top ${Math.round(cta.top)} of ${cta.height})`);
  return cta.text;
}

/**
 * Run every applicable check on the screen as it stands, and keep a screenshot of it.
 *
 * `skip` names checks the matrix marks not-applicable for this row ("—"), never checks that merely fail.
 * `form` says this screen is a long form, so P is judged by `checkPAfterScroll` instead.
 */
export async function screen(page, where, { name, skip = [], allow = [], form = false } = {}) {
  const run = new Set(['H', 'C', 'R', 'E', 'D', 'T', 'P'].filter(c => !skip.includes(c)));
  if (run.has('H')) await checkH(page, where);
  if (run.has('C')) await checkC(page, where);
  if (run.has('R')) await checkR(page, where);
  if (run.has('E')) await checkE(page, where, allow);
  if (run.has('D')) await checkD(page, where);
  if (run.has('T')) await checkT(page, where);
  if (run.has('P')) await (form ? checkPAfterScroll(page, where) : checkP(page, where));
  if (name) await shot(page, name);
}
