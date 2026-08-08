import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL } from "./lib/auth.mjs";
import { newAuthedContext } from "./lib/session.mjs";

const fixture = JSON.parse(fs.readFileSync(
  "docs/features/evidence/phase4-release6-discovery-conversion/final-acceptance/live-fixture.json", "utf8"));
const href = `${BASE_URL}/app/Tafseel-Teacher-Profile.dc.html?id=${fixture.teacherId}&teacherServiceId=${fixture.teacherServiceId}`;
const browser = await chromium.launch();
const ctx = await newAuthedContext(browser, "Student", { viewport: { width: 375, height: 667 }, lang: "en", theme: "light" });
const page = await ctx.newPage();
await page.goto(href, { waitUntil: "load", timeout: 30000 });
await page.waitForSelector("#profile-heading", { timeout: 20000 });
await page.waitForTimeout(2000);
const geom = await page.evaluate(() => {
  const cta = document.querySelector(".tf-profile-mobile-cta");
  const actions = document.querySelector(".tf-profile-identity-card .tf-profile-hero-actions");
  if (!cta || !actions) return { missing: true };
  const hits = [...actions.querySelectorAll("button, a")].map(btn => {
    const r = btn.getBoundingClientRect();
    const off = r.bottom < 0 || r.top > window.innerHeight;
    const hit = off ? null : document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      tag: btn.tagName,
      text: (btn.innerText || "").slice(0, 24),
      top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right),
      offscreen: off,
      hit: hit && (hit.tagName + "." + (hit.className || "").toString().slice(0, 40)),
      ok: off || !!(hit && (btn === hit || btn.contains(hit) || hit.closest(".tf-profile-hero-actions")))
    };
  });
  return {
    overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    tapSafe: hits.every(h => h.ok),
    clearance: document.documentElement.style.getPropertyValue("--tf-profile-mobile-clearance"),
    ctaVisible: cta.getBoundingClientRect().height > 0,
    pointerEvents: getComputedStyle(cta).pointerEvents,
    actionWidth: Math.round(actions.getBoundingClientRect().width),
    ctaLink: (() => {
      const a = cta.querySelector("a");
      const r = a.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) };
    })(),
    hits
  };
});
const shot = "docs/features/evidence/phase4-release6-discovery-conversion/final-acceptance/screenshots/profile-375-cta-probe.png";
await page.screenshot({ path: shot });
fs.writeFileSync("docs/features/evidence/phase4-release6-discovery-conversion/final-acceptance/profile-375-cta-probe.json", JSON.stringify(geom, null, 2));
console.log(JSON.stringify(geom, null, 2));
await ctx.close();
await browser.close();
process.exit(geom.tapSafe && !geom.overflow && geom.ctaVisible ? 0 : 1);
