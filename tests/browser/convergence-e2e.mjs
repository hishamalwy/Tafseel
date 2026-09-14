/* Student -> Teacher -> Offer -> Select -> AwaitingPayment E2E.

   Every mutation goes through the real application API using a real logged-in
   session (the same client the UI uses, `Tafseel.api`, evaluated in the page).
   No forged tokens, no raw SQL. Screenshots are taken of the actual rendered
   product at each state. */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BASE_URL, loginAs } from "./lib/auth.mjs";

const OUT = path.join("docs", "features", "evidence", "student-journey-convergence",
  "closure", "e2e");
fs.mkdirSync(OUT, { recursive: true });

const log = [];
const say = (m) => { log.push(m); console.log(m); };

const browser = await chromium.launch();

let lastLoginAt = 0;
async function ctxFor(role) {
  // Space out logins: the Development "auth" policy is 10 req/min, and a batch of
  // evidence captures can otherwise exhaust it and be misread as a product bug.
  const since = Date.now() - lastLoginAt;
  if (lastLoginAt && since < 9000) await new Promise(r => setTimeout(r, 9000 - since));
  lastLoginAt = Date.now();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addInitScript(() => {
    localStorage.setItem("tafseel-theme", "light");
    localStorage.setItem("tafseel-lang", "en");
    sessionStorage.setItem("tafseel.campaigns.session", JSON.stringify({
      closedAt: new Date().toISOString()
    }));
  });
  const p = await ctx.newPage();
  await loginAs(ctx, role, 1, p);
  await p.close();
  return ctx;
}

// Runs a call through the page's own authenticated API client.
async function apiCall(page, method, url, body, headers) {
  return await page.evaluate(async ([m, u, b, h]) => {
    try {
      const r = m === "get" ? await window.Tafseel.api.get(u)
        : m === "post" ? await window.Tafseel.api.post(u, b, h || undefined)
          : null;
      return { ok: true, data: r };
    } catch (e) {
      return { ok: false, status: e && e.status, message: String((e && e.message) || e) };
    }
  }, [method, url, body || null, headers || null]);
}

async function appPage(ctx, file) {
  const p = await ctx.newPage();
  await p.goto(`${BASE_URL}/app/${file}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  return p;
}

async function shot(page, name) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.75);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y); await new Promise(r => setTimeout(r, 100));
    }
    window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 300));
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  say(`  shot ${name}.png`);
}

const MATH = "0F77A186-DBAE-4BAC-A5BF-3CAC7085FE05";
const failures = [];
const check = (name, cond, detail) => {
  say(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) failures.push(name);
};

let studentCtx = await ctxFor("Student");
let teacherCtx = await ctxFor("Teacher");
const sPage = await appPage(studentCtx, "Tafseel-Landing.dc.html");
const tPage = await appPage(teacherCtx, "Tafseel-Teacher-Dashboard.dc.html");

// ---------------------------------------------------------------- 1. publish
const services = await apiCall(sPage, "get", "/services");
const async1 = (services.data || []).find(s =>
  s.orderType === "async_request" && !s.requiresScheduling && s.code === "recorded_explanation");
check("async service resolved", !!async1, async1 && async1.code);

const deadline = new Date(Date.now() + 5 * 86400000).toISOString();
const created = await apiCall(sPage, "post", "/open-marketplace/requests", {
  subjectId: MATH,
  serviceCatalogItemId: async1.id,
  title: "Explain integration by parts, chapter 4",
  requirements: "I keep losing the sign when I apply integration by parts. Walk me through chapter 4 questions 3 to 7 step by step, and show where I go wrong.",
  deadline,
  budgetMin: null,
  budgetMax: null
});
check("Student publishes an Open Request", created.ok, created.ok ? created.data.id : created.message);
const requestId = created.ok ? created.data.id : null;
if (!requestId) { say("cannot continue without a request"); process.exit(1); }
check("published as OpenForOffers", Number(created.data.status) === 5, `status=${created.data.status}`);

// ------------------------------------------------- 2. teacher opportunities
const opps = await apiCall(tPage, "get", "/open-marketplace/opportunities?page=1&pageSize=20");
const visible = opps.ok && (opps.data.items || []).some(x => x.id === requestId);
check("qualified Teacher sees the Opportunity", visible);

// --------------------------------------------- 3. unqualified teacher denied
const seedCtx = await browser.newContext();
const seedPage = await seedCtx.newPage();
await seedPage.goto(`${BASE_URL}/app/Tafseel-Landing.dc.html`, { waitUntil: "domcontentloaded" });
const anonDetail = await apiCall(seedPage, "get", `/open-marketplace/opportunities/${requestId}`);
check("anonymous cannot open the Opportunity", !anonDetail.ok, `status=${anonDetail.status}`);
const anonAttach = await apiCall(seedPage, "get", `/open-marketplace/requests/${requestId}`);
check("anonymous cannot read the Student request", !anonAttach.ok, `status=${anonAttach.status}`);
await seedCtx.close();

// -------------------------------------------------------- 4. teacher offers
const offer = await apiCall(tPage, "post",
  `/open-marketplace/opportunities/${requestId}/offers`,
  { amount: 180, deliveryHours: 48, message: "I will record a step-by-step walkthrough of questions 3-7 and mark exactly where the sign flips." });
check("qualified Teacher submits an Offer", offer.ok, offer.ok ? offer.data.id : offer.message);
const offerId = offer.ok ? offer.data.id : null;

// Offer count must now be visible on the Student's own request list.
const mine = await apiCall(sPage, "get", "/learning-requests/mine?page=1&pageSize=20");
const row = mine.ok && (mine.data.items || []).find(x => x.id === requestId);
check("request list carries a live Offer count", !!row && row.offerCount === 1,
  row ? `offerCount=${row.offerCount}` : "row missing");

// ------------------------------------------------------- 5. student selects
const detail = await apiCall(sPage, "get", `/open-marketplace/requests/${requestId}`);
const offers = await apiCall(sPage, "get", `/open-marketplace/requests/${requestId}/offers`);
check("Student sees the Offer on their request", offers.ok && offers.data.length === 1);

const selected = await sPage.evaluate(async ([rid, oid, rv, ov]) => {
  try {
    await window.Tafseel.api.post(
      `/open-marketplace/requests/${rid}/offers/${oid}/select`, null,
      { "If-Match": rv, "X-Offer-Version": ov });
    return { ok: true };
  } catch (e) { return { ok: false, status: e && e.status, message: String((e && e.message) || e) }; }
}, [requestId, offerId, detail.data.version, offers.data[0].version]);
check("Student selects the Offer", selected.ok, selected.message);

const afterSelect = await apiCall(sPage, "get", `/open-marketplace/requests/${requestId}`);
check("request is AwaitingPayment", Number(afterSelect.data.status) === 6,
  `status=${afterSelect.data.status}`);
check("server issued a payment reservation", !!afterSelect.data.paymentReservationExpiresAt,
  afterSelect.data.paymentReservationExpiresAt);
const remainingMin = afterSelect.data.paymentReservationExpiresAt
  ? Math.round((Date.parse(afterSelect.data.paymentReservationExpiresAt) - Date.now()) / 60000) : 0;
check("reservation is the canonical two hours", remainingMin > 110 && remainingMin <= 120,
  `${remainingMin} min`);

// Before payment the Teacher's Offer must read Selected — reserved, not yet won.
const offerWhileReserved = await apiCall(tPage, "get",
  `/open-marketplace/requests/${requestId}/my-offer`);
check("Teacher's Offer reads Selected while awaiting payment",
  offerWhileReserved.ok && Number(offerWhileReserved.data.status) === 1,
  offerWhileReserved.ok ? `status=${offerWhileReserved.data.status}` : offerWhileReserved.message);

// ------------------------------------------------ 6. evidence of that state
/* Evidence pages get their own freshly-authenticated context. The working
   contexts above have spent their session on API calls, and a silent redirect to
   the login page would otherwise be screenshotted as if it were the product. */
async function evidencePage(role, file) {
  /* Reuse the run's already-authenticated context rather than logging in again.
     The Development auth policy is 10 req/min; a fresh login per evidence page
     exhausts it, and a failed login renders the public guest page, which would
     be captured as if it were the authenticated product. */
  let ctx = role === "Teacher" ? teacherCtx : studentCtx;
  let p = await appPage(ctx, file);
  // A long-lived context can lose its session mid-run. Re-authenticate once
  // (paced) rather than capturing a guest page or failing the whole journey.
  const authed = async (page) => {
    if (/Tafseel-Auth/.test(page.url())) return null;
    return await page.evaluate(async () => {
      try { const s = await window.Tafseel.api.ready(); return (s && s.userId) || null; }
      catch { return null; }
    });
  };
  if (!await authed(p)) {
    await p.close();
    ctx = await ctxFor(role);
    if (role === "Teacher") teacherCtx = ctx; else studentCtx = ctx;
    p = await appPage(ctx, file);
  }
  await p.waitForTimeout(2600);
  if (/Tafseel-Auth/.test(p.url()))
    throw new Error(`redirected to login before capturing ${file}`);
  /* A failed login does not always redirect — a public page like Landing simply
     renders its guest state, which would be screenshotted as if it were the
     authenticated product. Assert a real session before trusting the capture. */
  const who = await p.evaluate(async () => {
    try { const s = await window.Tafseel.api.ready(); return (s && s.userId) || null; }
    catch { return null; }
  });
  if (!who) throw new Error(`not authenticated when capturing ${file} (auth rate limit?)`);
  return { ctx, page: p };
}

const landingEv = await evidencePage("Student", "Tafseel-Landing.dc.html");
const landingText = await landingEv.page.innerText("body").catch(() => "");
check("Landing surfaces the awaiting-payment action",
  /Action required/i.test(landingText) && /Continue to payment/i.test(landingText));
check("Landing shows the server reservation, not a guess",
  /reservation ends in \d+ min/i.test(landingText));
await shot(landingEv.page, "01-landing-awaiting-payment");

const dashEv = await evidencePage("Student", "Tafseel-Student-Dashboard.dc.html");
const dashText = await dashEv.page.innerText("body").catch(() => "");
check("Needs Attention surfaces the same action",
  /Payment due/i.test(dashText) && /Pay now/i.test(dashText));
check("Needs Attention names the same request Landing named",
  dashText.includes("Explain integration by parts"));
await shot(dashEv.page, "02-student-needs-attention-awaiting-payment");

const teacherEv = await evidencePage("Teacher", "Tafseel-Teacher-Dashboard.dc.html");
await shot(teacherEv.page, "03-teacher-dashboard-after-offer");

/* ---------------------------------------------------- 7. payment -> Order
   Uses the environment's own mock payment provider through the real endpoints:
   initiate with an Idempotency-Key, then the signed mock webhook. No SQL, no
   direct state writes. */
/* Reuse the Student's existing working session rather than logging in again —
   the Development auth policy is 10 req/min and this run already spends several
   logins on evidence captures. */
const payPage = sPage;
const initiated = await payPage.evaluate(async (rid) => {
  try {
    const r = await window.Tafseel.api.post(`/payments/open-requests/${rid}`, {},
      { "Idempotency-Key": "convergence-e2e-" + rid });
    return { ok: true, data: r };
  } catch (e) { return { ok: false, status: e && e.status, message: String((e && e.message) || e) }; }
}, requestId);
check("payment initiated for the reserved request", initiated.ok,
  initiated.ok ? initiated.data.payment.providerReference : initiated.message);

if (initiated.ok) {
  const p = initiated.data.payment;
  const secret = process.env.TAFSEEL_WEBHOOK_SECRET
    || "local-dev-only-webhook-secret-not-real-32chars";
  const { createHmac } = await import("node:crypto");
  const payload = JSON.stringify({
    eventId: "convergence-e2e-" + requestId,
    providerReference: p.providerReference,
    amount: p.amount,
    currency: p.currency,
    succeeded: true
  });
  const signature = createHmac("sha256", secret).update(payload).digest("hex").toUpperCase();
  // Sent twice on purpose: a replayed callback must not create a second Order.
  const post = async () => (await fetch(`${BASE_URL}/api/v1/payments/webhooks/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mock-Signature": signature },
    body: payload
  })).status;
  const first = await post();
  const second = await post();
  check("mock payment callback accepted", first >= 200 && first < 300, `HTTP ${first}`);
  check("replayed callback is not an error path", second >= 200 && second < 400, `HTTP ${second}`);

  await payPage.waitForTimeout(1500);
  const settled = await apiCall(payPage, "get", `/open-marketplace/requests/${requestId}`);
  check("request converted to Order", settled.ok && Number(settled.data.status) === 7,
    settled.ok ? `status=${settled.data.status}` : settled.message);
  check("payment reservation consumed",
    settled.ok && !settled.data.paymentReservationExpiresAt);

  const orders = await apiCall(payPage, "get", "/orders/mine?page=1&pageSize=50");
  const forRequest = orders.ok
    ? (orders.data.items || []).filter(o => o.learningRequestId === requestId) : [];
  check("exactly one canonical Order exists", forRequest.length === 1, `count=${forRequest.length}`);
  if (forRequest.length === 1) {
    check("Order price equals the selected Offer amount", Number(forRequest[0].price) === 180,
      `price=${forRequest[0].price}`);
    check("Order is Paid", Number(forRequest[0].paymentStatus) === 1,
      `paymentStatus=${forRequest[0].paymentStatus}`);
  }
}
const orderEv = await evidencePage("Student", "Tafseel-Student-Dashboard.dc.html");
await shot(orderEv.page, "04-student-order-after-payment");

const teacherWorkEv = await evidencePage("Teacher", "Tafseel-Teacher-Dashboard.dc.html");
await shot(teacherWorkEv.page, "05-teacher-active-work-after-payment");

/* After payment the winning Offer is Accepted (2), not Selected (1) — Selected
   was already asserted above, before the callback settled the Order. */
const myOffer = await apiCall(tPage, "get", `/open-marketplace/requests/${requestId}/my-offer`);
check("Teacher's winning Offer is Accepted after payment",
  myOffer.ok && Number(myOffer.data.status) === 2, myOffer.ok ? `status=${myOffer.data.status}` : myOffer.message);

fs.writeFileSync(path.join(OUT, "e2e-log.txt"), log.join("\n"));
fs.writeFileSync(path.join(OUT, "e2e-state.json"), JSON.stringify({
  requestId, offerId,
  reservationExpiresAt: afterSelect.data.paymentReservationExpiresAt,
  reservationMinutes: remainingMin
}, null, 2));

await browser.close();
if (failures.length) { console.log("\nFAILURES:\n- " + failures.join("\n- ")); process.exit(1); }
console.log("\nE2E: all checks passed");
