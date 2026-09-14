/* Dashboard Design Lab renderer — DEVELOPMENT ONLY.
   usage:
     node dashboard-lab-shots.mjs concepts
     node dashboard-lab-shots.mjs winner v1
     node dashboard-lab-shots.mjs deep
     node dashboard-lab-shots.mjs matrix v3
     node dashboard-lab-shots.mjs one <rel-html> <w> <lang> <theme> <out>
*/
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = fs.existsSync(path.join(process.cwd(), "design-lab"))
  ? process.cwd()
  : path.resolve(process.cwd(), "..", "..");
const LAB = path.join(ROOT, "design-lab", "dashboards");
const EV = path.join(ROOT, "docs", "features", "evidence", "dashboard-design-lab");

const mode = process.argv[2] || "concepts";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function url(file, lang, theme, extra) {
  const q = new URLSearchParams({ lang, theme, ...(extra || {}) });
  return pathToFileURL(path.join(LAB, file)).href + "?" + q.toString();
}

async function shot(page, file, w, h, lang, theme, out, extra) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(url(file, lang, theme, extra), { waitUntil: "load", timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await wait(280);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: true });
  console.log("shot", path.relative(ROOT, out));
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE " + m.text()); });

const ROLES = ["student", "teacher", "quality", "admin"];
const SYSTEMS = ["a", "b", "c"];

if (mode === "concepts") {
  for (const sys of SYSTEMS) {
    for (const role of ROLES) {
      const file = `system-${sys}/${role}.html`;
      const dir = path.join(EV, "concepts", `system-${sys}`);
      await shot(page, file, 1440, 1000, "en", "light", path.join(dir, `${role}-1440-en-light.png`));
      await shot(page, file, 1440, 1000, "ar", "dark", path.join(dir, `${role}-1440-ar-dark.png`));
      await shot(page, file, 390, 844, "ar", "light", path.join(dir, `${role}-390-ar-light.png`));
    }
  }
} else if (mode === "deep") {
  for (const sys of SYSTEMS) {
    for (const role of ROLES) {
      const file = `system-${sys}/${role}.html`;
      const dir = path.join(EV, "concepts", `system-${sys}`);
      const extra = { view: "deep" };
      if (role === "quality") extra.dialog = "";
      await shot(page, file, 1440, 1000, "en", "light", path.join(dir, `${role}-deep-1440-en-light.png`), extra);
      await shot(page, file, 1440, 1000, "ar", "dark", path.join(dir, `${role}-deep-1440-ar-dark.png`), extra);
      await shot(page, file, 390, 844, "ar", "light", path.join(dir, `${role}-deep-390-ar-light.png`), extra);
    }
  }
} else if (mode === "winner") {
  const label = process.argv[3] || "v1";
  const files = [
    ["winner/student/index.html", "student"],
    ["winner/student/deep.html", "student"],
    ["winner/teacher/index.html", "teacher"],
    ["winner/teacher/deep.html", "teacher"],
    ["winner/quality/index.html", "quality"],
    ["winner/quality/deep.html", "quality"],
    ["winner/admin/index.html", "admin"],
    ["winner/admin/moderation.html", "admin"]
  ];
  for (const [file, role] of files) {
    const stem = file.includes("deep") ? "deep" : file.includes("moderation") ? "moderation" : "overview";
    await shot(page, file, 1440, 1000, "en", "light", path.join(EV, "winner", role, `${label}-${stem}-1440-en-light.png`));
    await shot(page, file, 1440, 1000, "ar", "dark", path.join(EV, "winner", role, `${label}-${stem}-1440-ar-dark.png`));
    await shot(page, file, 390, 844, "ar", "light", path.join(EV, "winner", role, `${label}-${stem}-390-ar-light.png`));
  }
} else if (mode === "matrix") {
  const label = process.argv[3] || "final";
  const widths = [[375, 812], [390, 844], [768, 1024], [1024, 900], [1280, 900], [1440, 1000]];
  const modes = [["ar", "light"], ["ar", "dark"], ["en", "light"], ["en", "dark"]];
  const files = [
    ["winner/student/index.html", "student"],
    ["winner/teacher/index.html", "teacher"],
    ["winner/quality/index.html", "quality"],
    ["winner/admin/index.html", "admin"]
  ];
  for (const [file, role] of files) {
    for (const [w, h] of widths) {
      for (const [lang, theme] of modes) {
        const bucket = w <= 390 ? "mobile" : w <= 768 ? "tablet" : "desktop";
        await shot(page, file, w, h, lang, theme, path.join(EV, bucket, `${label}-${role}-${w}-${lang}-${theme}.png`));
      }
    }
  }
} else if (mode === "one") {
  const [, , , file, w, lang, theme, out] = process.argv;
  await shot(page, file, Number(w), 1000, lang, theme, path.isAbsolute(out) ? out : path.join(ROOT, out));
}

await browser.close();
if (errors.length) {
  console.log("---- PAGE ERRORS ----");
  errors.slice(0, 40).forEach((e) => console.log(e));
  process.exitCode = 1;
} else {
  console.log("clean: no page/console errors");
}
