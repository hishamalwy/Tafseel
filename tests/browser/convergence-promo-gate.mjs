// Promo gate: the dialog must not reappear on refresh once dismissed this visit,
// and must never present a Next/Back campaign carousel. A later visit, or a
// campaign published after dismiss, may still auto-open.
import { chromium } from "@playwright/test";
import { BASE_URL } from "./lib/auth.mjs";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const url = `${BASE_URL}/app/Tafseel-Landing.dc.html`;
const results = [];
const fail = [];

async function wizardVisible() {
  await page.waitForTimeout(2200);
  return await page.locator("[data-promo-wizard]").count() > 0;
}

// 1. First visit: the campaign should be presented.
await page.goto(url, { waitUntil: "domcontentloaded" });
const first = await wizardVisible();
results.push(["first visit shows promo", first]);
if (!first) fail.push("promo did not appear on first visit");

// 2. It must be a single campaign, not a carousel.
const nextBtns = await page.locator(".tf-promo-wizard-next").count();
const backBtns = await page.locator(".tf-promo-wizard-back").count();
const dots = await page.locator(".tf-promo-dot").count();
const stepLabel = (await page.locator(".tf-promo-wizard-step").first().textContent().catch(() => "") || "").trim();
results.push(["no back button", backBtns === 0]);
results.push(["no carousel dots", dots === 0]);
results.push(["no 'n / m' step label", stepLabel === ""]);
if (backBtns) fail.push("promo still offers a Back step");
if (dots) fail.push("promo still renders a campaign dot carousel");
if (stepLabel) fail.push(`promo still shows a step counter: ${stepLabel}`);
results.push(["single done/close action", nextBtns === 1]);

// 3. Dismiss it.
await page.locator(".tf-promo-wizard-close").first().click();
await page.waitForTimeout(600);
const afterClose = await page.locator("[data-promo-wizard]").count() > 0;
results.push(["closes on dismiss", !afterClose]);
if (afterClose) fail.push("promo did not close");

// 4. Reload twice: it must stay dismissed.
for (const attempt of [1, 2]) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const shown = await wizardVisible();
  results.push([`reload ${attempt} keeps promo dismissed`, !shown]);
  if (shown) fail.push(`promo reappeared on reload ${attempt}`);
}

// 5. The engagement record must carry the campaign id and a dismissedAt stamp.
const store = await page.evaluate(() => localStorage.getItem("tafseel.campaigns"));
let parsed = {};
try { parsed = JSON.parse(store || "{}"); } catch { /* reported below */ }
const ids = Object.keys(parsed);
const hasDismiss = ids.some(id => parsed[id] && parsed[id].dismissedAt);
const hasSeen = ids.some(id => parsed[id] && parsed[id].seenAt);
results.push(["engagement keyed by campaign id", ids.length > 0]);
results.push(["records seenAt", hasSeen]);
results.push(["records dismissedAt", hasDismiss]);
if (!ids.length) fail.push("no per-campaign engagement record was written");
if (!hasDismiss) fail.push("dismissedAt was not recorded");

// 6. Dismissing one campaign must not drip-feed the next slot on the following
//    refresh — that is the same interruption as the carousel, just slower.
const stillDismissed = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("tafseel.campaigns") || "{}"));
results.push(["only one campaign dialog per dismissal", Object.keys(stillDismissed).length === 1]);
if (Object.keys(stillDismissed).length !== 1)
  fail.push("more than one campaign was presented across refreshes");

// 7. A new visit (fresh session) must show the live campaign even if an older
//    engagement record exists — dismissal is this-visit, not a 24-hour mute.
await page.evaluate(() => {
  sessionStorage.removeItem("tafseel.campaigns.session");
  const old = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  localStorage.setItem("tafseel.campaigns", JSON.stringify({
    "00000000-0000-0000-0000-0000000000ff": { dismissedAt: old }
  }));
});
await page.goto(url, { waitUntil: "domcontentloaded" });
const newCampaign = await wizardVisible();
results.push(["new visit shows campaign after earlier dismiss", newCampaign]);
if (!newCampaign) fail.push("a live campaign stayed hidden after a new visit");

for (const [name, ok] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
await ctx.close();
await browser.close();
if (fail.length) { console.log("\nFAILURES:\n- " + fail.join("\n- ")); process.exit(1); }
console.log("\npromo gate: all checks passed");
