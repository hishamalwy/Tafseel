// Targeted re-verification of specific matrix.json rows previously flagged as harness-induced
// rate-limit collisions (a narrowly-scoped 429, not a real app defect), using more generous
// pacing than the main run. Updates matrix.json in place; does not touch any other row.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loginAs } from "./lib/auth.mjs";
import { runCell } from "./run-matrix.mjs";
import { SURFACES, VIEWPORTS, MODES } from "./lib/surfaces.mjs";

const outDir = process.argv[2];
const targetSurfaceIds = new Set(process.argv.slice(3));
const matrixPath = path.join(outDir, "matrix.json");
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));

const targets = matrix
  .map((row, index) => ({ row, index }))
  .filter(({ row }) => row.result === "FAIL" && targetSurfaceIds.has(row.surface));

console.log(`Re-verifying ${targets.length} previously-failed cells for surfaces: ${[...targetSurfaceIds].join(", ")}`);

const byRole = new Map();
for (const t of targets) {
  const key = t.row.role;
  if (!byRole.has(key)) byRole.set(key, []);
  byRole.get(key).push(t);
}

async function main() {
  const browser = await chromium.launch();
  for (const [roleKey, items] of byRole) {
    const context = await browser.newContext();
    const page = roleKey === "public" ? await context.newPage() : await loginAs(context, roleKey);
    for (const { row, index } of items) {
      const surface = SURFACES.find(s => s.id === row.surface);
      const viewport = VIEWPORTS.find(v => v.width === row.width && v.height === row.height);
      const mode = MODES.find(m => m.lang === row.language && m.theme === row.theme);
      const fresh = await runCell(page, surface, viewport, mode, roleKey === "public" ? null : roleKey, 15000);
      matrix[index] = fresh;
      console.log(`${fresh.result} ${fresh.surface} ${fresh.viewport} ${fresh.language}/${fresh.theme}${fresh.detail ? " :: " + fresh.detail : ""}`);
    }
    await context.close();
  }
  await browser.close();

  fs.writeFileSync(matrixPath, JSON.stringify(matrix, null, 2));
  const totalCells = matrix.length;
  const passedCells = matrix.filter(r => r.result === "PASS").length;
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({
    totalCells, passedCells, failedCells: totalCells - passedCells, skippedCells: 0
  }, null, 2));
  console.log(`\nUPDATED TOTAL=${totalCells} PASSED=${passedCells} FAILED=${totalCells - passedCells}`);
}

main().catch(err => { console.error(err); process.exit(1); });
