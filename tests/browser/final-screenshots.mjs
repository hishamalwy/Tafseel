import { chromium } from "@playwright/test";
import path from "node:path";
import { loginAs, setThemeAndLang } from "./lib/auth.mjs";
import { SURFACES, fullUrl } from "./lib/surfaces.mjs";

const outDir = process.argv[2];
const shotsDir = path.join(outDir, "screenshots");
const wait = ms => new Promise(r => setTimeout(r, ms));
const url = (id) => fullUrl(SURFACES.find(s => s.id === id));

async function shot(page, name) {
  await page.screenshot({ path: path.join(shotsDir, `${name}.png`) });
  console.log("shot:", name);
}

async function main() {
  const browser = await chromium.launch();
  const pubCtx = await browser.newContext();
  const pub = await pubCtx.newPage();

  await pub.setViewportSize({ width: 390, height: 844 });
  await pub.goto(url("browse"), { waitUntil: "domcontentloaded" });
  await setThemeAndLang(pub, "light", "en");
  await pub.goto(url("browse"), { waitUntil: "networkidle" });
  await shot(pub, "390x844_en_light_browse");

  await wait(7000);
  await pub.goto(url("teacher-profile"), { waitUntil: "networkidle" });
  await shot(pub, "390x844_en_light_teacher-profile");
  await pubCtx.close();

  const stuCtx = await browser.newContext();
  const stu = await loginAs(stuCtx, "Student");
  await wait(7000);
  await stu.setViewportSize({ width: 1440, height: 900 });
  await setThemeAndLang(stu, "light", "en");
  await stu.goto(url("student-active-order"), { waitUntil: "networkidle" });
  await shot(stu, "1440x900_en_light_student-dashboard");

  await wait(7000);
  await stu.setViewportSize({ width: 1280, height: 800 });
  await setThemeAndLang(stu, "dark", "en");
  await stu.goto(url("student-active-order"), { waitUntil: "networkidle" });
  await shot(stu, "1280x800_en_dark_student-dashboard");
  await stuCtx.close();

  await browser.close();
  console.log("FINAL_SHOTS_DONE");
}
main().catch(err => { console.error(err); process.exit(1); });
