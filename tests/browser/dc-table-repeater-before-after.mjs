/**
 * PASS 01 evidence capture — the defect and the repair, measured side by side on the same
 * fixture data through the same runtime.
 *
 *   LEGACY shape : <tbody><sc-for ...><tr>...</tr></sc-for></tbody>   (pre-migration markup)
 *   REPAIRED shape: <tbody><template sc-for ...><tr>...</tr></template></tbody>
 *
 * Reports, for each shape: what the HTML parser did to the directive before any JavaScript ran,
 * and how many bound data rows the runtime ultimately rendered from an 8-item collection.
 *
 * Run:  node tests/browser/dc-table-repeater-before-after.mjs
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.TAFSEEL_STATIC_BASE || "http://localhost:5091";
const FIXTURE_PATH = "/Tafseel-DC-Runtime-TableRepeat.dc.html";
const REPAIRED = readFileSync(join(HERE, "fixtures", "dc-table-repeater.dc.html"), "utf8");

// Reconstruct the exact pre-migration markup shape from the repaired fixture.
const LEGACY = REPAIRED
  .replace(/<template (sc-for|sc-if)\b/g, "<$1")
  .replace(/<\/template>/g, "</sc-for>");

const browser = await chromium.launch();
const report = {};

for (const [shape, html] of [["legacy", LEGACY], ["repaired", REPAIRED]]) {
  const page = await browser.newPage();
  await page.route("**" + FIXTURE_PATH, (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html })
  );

  // (1) Parser state — read from <x-dc> before the runtime replaces it.
  await page.addInitScript(() => {
    document.addEventListener("readystatechange", () => {
      if (window.__parserSnapshot) return;
      const dc = document.querySelector("x-dc");
      if (!dc) return;
      const t = dc.querySelector("#people");
      const directive = dc.querySelector("sc-for, template[sc-for]");
      window.__parserSnapshot = {
        directiveTag: directive ? directive.tagName.toLowerCase() : null,
        directiveParent: directive && directive.parentElement ? directive.parentElement.tagName.toLowerCase() : null,
        directiveChildRows: directive
          ? (directive.content ? directive.content.querySelectorAll("tr").length : directive.querySelectorAll("tr").length)
          : null,
        tbodyChildren: t ? [...t.tBodies[0].children].map((c) => c.tagName.toLowerCase()) : null
      };
    }, true);
  });

  await page.goto(BASE + FIXTURE_PATH, { waitUntil: "networkidle" });
  const parser = await page.evaluate(() => window.__parserSnapshot || null);

  // (2) Rendered result for the 8-item collection.
  await page.click("#set-8").catch(() => {});
  await page.waitForTimeout(400);
  const rendered = await page.evaluate(() => {
    const t = document.getElementById("people");
    const rows = t ? [...t.querySelectorAll("tbody tr")] : [];
    return {
      dataRows: rows.length,
      firstRowCells: rows[0] ? [...rows[0].children].map((td) => td.textContent.trim()) : null,
      blankRows: rows.filter((r) => !r.textContent.trim()).length
    };
  });

  report[shape] = { parser, rendered };
  await page.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
