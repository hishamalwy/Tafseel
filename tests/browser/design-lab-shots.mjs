/* Design Lab renderer — captures real pixels for every concept / winner state.
   DEVELOPMENT ONLY. Renders the isolated design-lab prototypes over file://,
   so it needs no API and touches no production page.

   usage:
     node design-lab-shots.mjs concepts            18 critical concept shots
     node design-lab-shots.mjs winner  <label>     winner refinement cycle
     node design-lab-shots.mjs matrix  <label>     full responsive matrix
     node design-lab-shots.mjs one <file> <w> <lang> <theme> <out>
*/
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(process.cwd(), "..", "..");
const LAB = path.join(ROOT, "design-lab", "marketplace");
const EV = path.join(ROOT, "docs", "features", "evidence", "teacher-marketplace-design-lab");

const mode = process.argv[2] || "concepts";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function url(file, w, lang, theme) {
  return pathToFileURL(path.join(LAB, file)).href + `?lang=${lang}&theme=${theme}&w=${w}`;
}

async function shot(page, file, w, h, lang, theme, out, full = true) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(url(file, w, lang, theme), { waitUntil: "load", timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await wait(320);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: full });
  console.log("shot", path.relative(ROOT, out));
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE " + m.text()); });

const CONCEPTS = [
  ["browse-a.html", "concepts/browse-a"],
  ["browse-b.html", "concepts/browse-b"],
  ["browse-c.html", "concepts/browse-c"],
  ["profile-a.html", "concepts/profile-a"],
  ["profile-b.html", "concepts/profile-b"],
  ["profile-c.html", "concepts/profile-c"],
];

if (mode === "concepts") {
  for (const [file, dir] of CONCEPTS) {
    await shot(page, file, 1440, 1000, "ar", "dark", path.join(EV, dir, "1440-ar-dark.png"));
    await shot(page, file, 1440, 1000, "en", "light", path.join(EV, dir, "1440-en-light.png"));
    await shot(page, file, 390, 844, "ar", "light", path.join(EV, dir, "390-ar-light.png"));
  }
} else if (mode === "winner") {
  const label = process.argv[3] || "v1";
  for (const file of ["browse-w.html", "profile-w.html"]) {
    const dir = file.startsWith("browse") ? "browse" : "profile";
    await shot(page, file, 1440, 1000, "ar", "dark", path.join(EV, "winner", dir, `${label}-1440-ar-dark.png`));
    await shot(page, file, 1440, 1000, "en", "light", path.join(EV, "winner", dir, `${label}-1440-en-light.png`));
    await shot(page, file, 390, 844, "ar", "light", path.join(EV, "winner", dir, `${label}-390-ar-light.png`));
  }
} else if (mode === "matrix") {
  const label = process.argv[3] || "final";
  const widths = [[375, 812], [390, 844], [768, 1024], [1024, 900], [1280, 900], [1440, 1000], [1680, 1050]];
  const modes = [["ar", "light"], ["ar", "dark"], ["en", "light"], ["en", "dark"]];
  for (const file of ["browse-w.html", "profile-w.html"]) {
    const dir = file.startsWith("browse") ? "browse" : "profile";
    for (const [w, h] of widths) {
      for (const [lang, theme] of modes) {
        await shot(page, file, w, h, lang, theme, path.join(EV, "responsive", dir, `${label}-${w}-${lang}-${theme}.png`));
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
  errors.slice(0, 30).forEach((e) => console.log(e));
  process.exitCode = 1;
} else {
  console.log("clean: no page/console errors");
}
