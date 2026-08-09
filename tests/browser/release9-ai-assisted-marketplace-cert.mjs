import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5095";
const password = process.env.TAFSEEL_R9_BROWSER_PASSWORD;
const outDir = process.argv[2] || path.join("docs", "features", "evidence", "phase4-release9-ai-assisted-marketplace", "browser");
if (!password) throw new Error("TAFSEEL_R9_BROWSER_PASSWORD is required");
fs.mkdirSync(outDir, { recursive: true });

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
};
const waitForText = (page, text) => page.getByText(text, { exact: false }).first().waitFor({ timeout: 15000 });

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const unexpected = [];
  const badResponses = [];
  const consoleErrors = [];
  const pageErrors = [];
  const failedFirstParty = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("requestfailed", request => {
    if (request.url().startsWith(baseUrl)) failedFirstParty.push(`${request.failure()?.errorText || "failed"} ${request.url()}`);
  });
  page.on("response", response => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400)
      badResponses.push(`${response.status()} ${response.url()}`);
    if (response.url().startsWith(baseUrl) && [429, 500].includes(response.status()))
      unexpected.push(`${response.status()} ${response.url()}`);
  });

  await page.goto(`${baseUrl}/app/Tafseel-Auth.dc.html`);
  await page.locator('input[type="email"]').fill("student@gmail.com");
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !location.pathname.includes("Tafseel-Auth"));

  await page.goto(`${baseUrl}/app/Tafseel-Browse-Teachers.dc.html`);
  await page.locator("#f-q").waitFor();
  check("authenticated-student-unified-search", await page.locator("#f-q").isVisible());
  check("standalone-ai-panel-removed", await page.locator("#ai-discovery-title").count() === 0);

  const search = page.locator("#f-q");
  await search.fill("I need a Mathematics teacher for a live session under 150 SAR");
  await search.press("Enter");
  await page.waitForFunction(() => new URL(location.href).searchParams.has("subjectId"), null, { timeout: 15000 });
  check("discovery-canonical-handoff", new URL(page.url()).searchParams.has("subjectId"));

  await page.locator("#f-q").fill("I need help");
  await page.locator("#f-q").press("Enter");
  await waitForText(page, "A little more detail is needed");
  check("clarification-visible", await page.locator(".tf-ai-questions li").count() > 0);

  const help = page.locator(".tf-ai-help");
  await help.locator("summary").click();
  await help.locator("input").fill("How do learning requests work?");
  await help.locator('button[type="submit"]').click();
  await waitForText(page, "Choose a teacher service, review the request, and submit it yourself");
  check("product-help-supported", true);

  await help.locator("input").fill("What is your refund policy?");
  await help.locator('button[type="submit"]').click();
  await waitForText(page, "policy is not available");
  check("product-help-unsupported-guard", true);

  await page.locator("#f-q").fill("RATE_LIMIT extra words for intent");
  await page.locator("#f-q").press("Enter");
  await waitForText(page, "smart help is unavailable");
  check("provider-failure-fallback", true);
  await page.screenshot({ path: path.join(outDir, "browse-en-1440.png"), fullPage: true });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => localStorage.setItem("tafseel-lang", "ar"));
  await page.reload();
  await page.locator("#f-q").waitFor();
  const geometry = await page.evaluate(() => ({
    dir: document.documentElement.dir,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }));
  check("arabic-rtl", geometry.dir === "rtl", geometry.dir);
  check("mobile-no-horizontal-overflow", !geometry.overflow);
  await page.screenshot({ path: path.join(outDir, "browse-ar-375.png"), fullPage: true });

  await page.evaluate(() => localStorage.setItem("tafseel-lang", "en"));
  const teacherId = "11111111-1111-1111-1111-111111111111";
  const subjectId = "22222222-2222-2222-2222-222222222222";
  const serviceId = "33333333-3333-3333-3333-333333333333";
  // The request-page fixture uses intentionally non-persisted Teacher IDs. Suppress only its
  // analytics write so that this UI fixture cannot create invalid marketplace evidence.
  await page.route("**/api/v1/marketplace-intelligence/events", route => route.fulfill({ status: 202, body: "" }));
  await page.route(`**/api/v1/teachers/${teacherId}`, route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      teacherId, fullName: "Browser Teacher", fullNameEnglish: "Browser Teacher",
      subjects: [{ id: subjectId, name: "Mathematics", nameAr: "الرياضيات" }], languages: [],
      services: [{ id: serviceId, subjectId, serviceCatalogItemId: "44444444-4444-4444-4444-444444444444",
        title: "Custom recorded explanation", description: "A recorded explanation", price: 100,
        currency: "SAR", deliveryHours: 24, revisions: 1, canRequest: true, canBook: false,
        requiresScheduling: false, serviceCatalogCode: "recorded_explanation" }]
    })
  }));
  await page.route("**/api/v1/students/me/learning-preferences", route => route.fulfill({
    status: 200, contentType: "application/json", body: "{}"
  }));
  await page.goto(`${baseUrl}/app/Tafseel-Request.dc.html?teacherId=${teacherId}&teacherServiceId=${serviceId}`);
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.locator("#ai-request-title").waitFor();
  const aiRequest = page.locator(".tf-ai-request");
  await aiRequest.locator("textarea").fill("I need help with quadratic equations before Monday");
  await aiRequest.locator("button").first().click();
  await waitForText(page, "Draft ready. Review it before using it.");
  check("request-draft-preview", await aiRequest.getByText("Quadratic equations", { exact: false }).first().isVisible());
  check("request-not-auto-submitted", page.url().includes("Tafseel-Request"));
  await aiRequest.getByRole("button", { name: "Use this draft" }).click();
  await waitForText(page, "Draft applied. You can edit every field before submitting.");
  check("request-explicit-use", await page.locator('main textarea').nth(1).inputValue() !== "");
  await page.screenshot({ path: path.join(outDir, "request-en-375.png"), fullPage: true });

  check("unexpected-tafseel-429-or-500", unexpected.length === 0, unexpected.join("; "));
  check("actionable-console-error", consoleErrors.length === 0,
    [...consoleErrors, ...badResponses].join("; "));
  check("pageerror", pageErrors.length === 0, pageErrors.join("; "));
  check("failed-first-party-resource", failedFirstParty.length === 0, failedFirstParty.join("; "));
  const report = { generatedAtUtc: new Date().toISOString(), baseUrl, provider: "local contract double", results };
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(report, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
} finally {
  await browser.close();
}
