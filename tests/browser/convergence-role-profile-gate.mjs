// Part 15: a Teacher viewing their own public profile must not be offered
// Student conversion actions.
import { chromium } from "@playwright/test";
import { BASE_URL, loginAs } from "./lib/auth.mjs";

const browser = await chromium.launch();
const results = [];
const fail = [];
const ok = (n, c, d) => { results.push([n, !!c, d]); if (!c) fail.push(n); };

async function ctxFor(role) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addInitScript(() => {
    localStorage.setItem("tafseel-theme", "light");
    localStorage.setItem("tafseel-lang", "en");
  });
  await loginAs(ctx, role, 1, await ctx.newPage()).then(p => p.close());
  return ctx;
}

/* Self-view can only be evidenced against a Teacher whose PUBLIC profile is
   actually discoverable — an unpublished teacher renders the "profile
   unavailable" state for everyone, which would make every "no purchase action"
   assertion pass vacuously. PublishedTeacher is a seeded, published account. */
const tCtx = await ctxFor("PublishedTeacher");
const probe = await tCtx.newPage();
await probe.goto(`${BASE_URL}/app/Tafseel-Teacher-Dashboard.dc.html`, { waitUntil: "domcontentloaded" });
await probe.waitForTimeout(2500);
const teacherId = await probe.evaluate(async () => {
  const s = await window.Tafseel.api.ready();
  return s && s.userId;
});
ok("resolved own teacher id", !!teacherId, teacherId);

const url = `${BASE_URL}/app/Tafseel-Teacher-Profile.dc.html?id=${encodeURIComponent(teacherId)}`;

// Guard against vacuous passes: the profile must genuinely render.
const guard = await tCtx.newPage();
await guard.goto(url, { waitUntil: "domcontentloaded" });
await guard.waitForTimeout(3200);
const rendered = await guard.locator(".tf-mkp-shelf-acts").count();
ok("own public profile actually renders (not the unavailable state)", rendered === 1);
/* Owner detection needs a live session. The Development auth policy is 10
   req/min, so running this gate immediately after other logging-in gates can
   drop the session — the profile then renders publicly and every "no purchase
   action" assertion silently inverts. Fail loudly as a Test Issue instead. */
const sessionUserId = await guard.evaluate(async () => {
  try { const s = await window.Tafseel.api.ready(); return (s && s.userId) || null; }
  catch { return null; }
});
if (!sessionUserId) {
  console.log("FAIL  session present on the profile page — auth rate limit (Test Issue), re-run this gate alone");
  process.exit(2);
}
ok("session present on the profile page", sessionUserId === teacherId);
await guard.close();

// --- Teacher viewing own profile -----------------------------------------
const own = await tCtx.newPage();
await own.goto(url, { waitUntil: "domcontentloaded" });
await own.waitForTimeout(3200);
const ownText = await own.innerText("body").catch(() => "");
const ownerActions = await own.locator("[data-owner-action]").count();
const requestHref = await own.locator('a[href*="Tafseel-Request.dc.html"]').count();
const bookHref = await own.locator('a[href*="Tafseel-Book-Session.dc.html"]').count();
const mobileCta = await own.locator(".tf-mkp-mcta").count();
const ownerNote = await own.locator("[data-owner-note]").count();

ok("no Request-this-Teacher action on own profile", requestHref === 0);
ok("no Book-this-Teacher action on own profile", bookHref === 0);
ok("no mobile purchase bar on own profile", mobileCta === 0);
ok("owner management actions offered", ownerActions === 2);
ok("owner preview note shown", ownerNote === 1);
// Self-conversion actions live in two places: the service shelf and the
// identity row. Both must be clear of them.
const ownAllActions = [
  await own.locator(".tf-mkp-shelf-acts").innerText().catch(() => ""),
  await own.locator(".tf-mkp-idacts").innerText().catch(() => "")
].join(" ");
ok("no 'Message' self-conversation action", !/\bMessage\b/i.test(ownAllActions));
ok("no 'Save teacher' self-favourite action", !/\bSave\b/i.test(ownAllActions));
ok("Share stays available on own profile", /\bShare\b/i.test(ownAllActions));
await own.screenshot({
  path: "docs/features/evidence/student-journey-convergence/closure/profile/teacher-self-view-1440-en-light.png",
  fullPage: true
});
await tCtx.close();

// --- Student viewing the same profile must be unchanged ------------------
const sCtx = await ctxFor("Student");
const asStudent = await sCtx.newPage();
await asStudent.goto(url, { waitUntil: "domcontentloaded" });
await asStudent.waitForTimeout(3200);
const studentOwnerActions = await asStudent.locator("[data-owner-action]").count();
const studentActions = [
  await asStudent.locator(".tf-mkp-shelf-acts").innerText().catch(() => ""),
  await asStudent.locator(".tf-mkp-idacts").innerText().catch(() => "")
].join(" ");
ok("Student sees no owner management actions", studentOwnerActions === 0);
ok("Student still gets the Message action", /Message/i.test(studentActions));
ok("Student still gets the Save teacher action", /Save/i.test(studentActions));
await asStudent.screenshot({
  path: "docs/features/evidence/student-journey-convergence/closure/profile/teacher-student-view-1440-en-light.png",
  fullPage: true
});
await sCtx.close();

for (const [n, p, d] of results) console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`);
await browser.close();
if (fail.length) { console.log("\nFAILURES:\n- " + fail.join("\n- ")); process.exit(1); }
console.log("\nrole-aware profile gate: all checks passed");
