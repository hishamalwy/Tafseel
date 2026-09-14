// Open Request simplification + searchable Subject picker (Parts 7/8).
import { chromium } from "@playwright/test";
import { BASE_URL, loginAs } from "./lib/auth.mjs";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await loginAs(ctx, "Student", 1, await ctx.newPage()).then(p => p.close());
const page = await ctx.newPage();
const results = [];
const fail = [];
const ok = (name, cond) => { results.push([name, !!cond]); if (!cond) fail.push(name); };

await page.goto(`${BASE_URL}/app/Tafseel-Open-Marketplace.dc.html`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-post-form]:not([hidden])", { timeout: 20000 });

// --- Simplification -------------------------------------------------------
ok("no Title field asked of the Student", await page.locator('[name="title"]').count() === 0);
ok("requirements is the main writing surface", await page.locator('[name="requirements"]').count() === 1);
ok("consent moved out of the entry form",
  await page.locator('[data-post-form] [name="visibility"]').count() === 0);
ok("consent present at the publish step",
  await page.locator('[data-post-review] [data-publish-consent]').count() === 1);

// Service must be async-only (server rejects scheduled services here).
const serviceOptions = await page.locator('[name="service"] option').count();
ok("service options loaded", serviceOptions > 1);

// Deadline must carry a future floor.
const min = await page.locator('[name="deadline"]').getAttribute("min");
ok("deadline has a future floor", !!min && new Date(min).getTime() > Date.now() - 120000);

// --- Subject combobox -----------------------------------------------------
const input = page.locator("[data-subject-input]");
ok("subject is a combobox, not a select", await page.locator('select[name="subject"]').count() === 0);
ok("combobox role", await input.getAttribute("role") === "combobox");

await input.click();
await input.fill("phys");
await page.waitForTimeout(350);
const shown = await page.locator('[data-subject-list] [role="option"]').allTextContents();
ok("typing filters the catalogue", shown.length > 0 && shown.every(t => /phys/i.test(t)));

// Keyboard: ArrowDown + Enter commits a canonical id.
await input.press("ArrowDown");
await input.press("Enter");
await page.waitForTimeout(250);
const committed = await page.locator("[data-subject-value]").inputValue();
ok("Enter commits a canonical SubjectId",
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(committed));
ok("committed label is visible", (await input.inputValue()).length > 0);

// Free text must never become a subject.
await input.click();
await input.fill("a subject that does not exist at all");
await page.waitForTimeout(300);
const noMatchVisible = await page.locator("[data-subject-status]").isVisible().catch(() => false);
ok("no-match is reported", noMatchVisible);
await page.locator('[name="requirements"]').click(); // blur
await page.waitForTimeout(350);
ok("unmatched free text clears the committed id",
  (await page.locator("[data-subject-value]").inputValue()) === "");
ok("unmatched free text is not left in the field",
  (await input.inputValue()) === "");

// "Can't find your subject?" must be truthful, not a fake publish path.
await page.locator("[data-subject-missing]").click();
await page.waitForTimeout(250);
const unsupported = await page.locator("[data-subject-unsupported]").isVisible();
ok("missing-subject disclosure is shown", unsupported);
ok("no free-text subject field is submitted",
  await page.locator('[name="requestedSubjectText"]').count() === 0);

// --- Submitting without a subject must be refused ------------------------
await page.locator('[name="requirements"]').fill("Explain integration by parts step by step for chapter 4.");
await page.locator("[data-post-submit]").click();
await page.waitForTimeout(400);
ok("publish blocked without a canonical subject",
  await page.locator("[data-post-review]").isHidden());

for (const [name, pass] of results) console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
await ctx.close();
await browser.close();
if (fail.length) { console.log("\nFAILURES:\n- " + fail.join("\n- ")); process.exit(1); }
console.log("\nopen-request gate: all checks passed");
