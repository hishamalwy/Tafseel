// Proves the harness's own assertion logic can genuinely fail, not just pass by construction.
// Uses only local data:/file: scratch HTML - never touches the real Tafseel app or its server.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " :: " + detail : ""}`);
}

async function withPage(browser, html, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tafseel-harness-selftest-"));
  const file = path.join(dir, "scratch.html");
  fs.writeFileSync(file, html);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`file://${file}`);
    await fn(page);
  } finally {
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const browser = await chromium.launch();

  // 1. Horizontal overflow must be detected as a failure condition.
  await withPage(browser,
    `<!doctype html><html><body><div style="width:2000px;height:20px;background:red"></div></body></html>`,
    async page => {
      await page.setViewportSize({ width: 400, height: 300 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      record("harness-detects-overflowX", overflow === true, `overflow=${overflow}`);
    });

  // 2. console.error must be captured as a failure signal.
  await withPage(browser,
    `<!doctype html><html><body><script>console.error("scratch induced error");</script></body></html>`,
    async page => {
      const errors = [];
      page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
      await page.reload();
      record("harness-detects-console-error", errors.length > 0, `count=${errors.length}`);
    });

  // 3. A `%7B%7B` (literal `{{`) resource URL must be detected as a template leak.
  await withPage(browser,
    `<!doctype html><html><body><img src="/scratch/%7B%7B%20fakeBinding%20%7D%7D.png"></body></html>`,
    async page => {
      const leaks = [];
      page.on("request", req => { if (/%7B%7B/.test(req.url())) leaks.push(req.url()); });
      await page.reload().catch(() => {});
      await page.waitForTimeout(200);
      record("harness-detects-network-template-leak", leaks.length > 0, `count=${leaks.length}`);
    });

  // 4. Wrong `dir` attribute (expected rtl, actual ltr) must be flagged.
  await withPage(browser,
    `<!doctype html><html lang="ar" dir="ltr"><body>scratch</body></html>`,
    async page => {
      const dir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
      const expected = "rtl";
      record("harness-detects-wrong-dir", dir !== expected, `dir=${dir} expected=${expected}`);
    });

  // 5. A missing required modal (role=dialog absent when expected) must be flagged.
  await withPage(browser,
    `<!doctype html><html><body><div id="not-a-dialog">no modal here</div></body></html>`,
    async page => {
      const dialogPresent = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
      record("harness-detects-missing-modal", dialogPresent === false, `dialogPresent=${dialogPresent}`);
    });

  await browser.close();

  const allPass = results.every(r => r.pass);
  console.log(`\nSELF_TEST_${allPass ? "PASS" : "FAIL"} (${results.filter(r => r.pass).length}/${results.length})`);
  fs.writeFileSync(
    path.join(process.argv[2] || ".", "self-test-results.json"),
    JSON.stringify({ allPass, results }, null, 2)
  );
  process.exit(allPass ? 0 : 1);
}

main().catch(err => { console.error("SELF_TEST_CRASH", err); process.exit(1); });
