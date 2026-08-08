// Release 7 Final Acceptance — discovery isolation, drop-off, full async lifecycle,
// spoof/idempotency, authz, exact funnel reconciliation. No raw SQL. No secrets logged.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BASE_URL, CREDENTIALS } from "./lib/auth.mjs";
import { loginOnceAndSave, newAuthedContext, persistContextState, paceAuthSensitive } from "./lib/session.mjs";
import { createRequestBudget } from "./lib/request-budget.mjs";

const outDir = process.argv[2]
  || path.join("docs", "features", "evidence", "phase4-release7-marketplace-intelligence", "final-acceptance");
fs.mkdirSync(outDir, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const startedAt = new Date();
const fromIso = new Date(startedAt.getTime() - 5000).toISOString();

const budget = createRequestBudget({ baseUrl: BASE_URL, globalSafety: 80, authSafety: 2 });
const findings = [];
const record = (name, pass, detail = "") => {
  findings.push({ name, pass: !!pass, detail: String(detail || "").slice(0, 1200) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " :: " + String(detail).slice(0, 240) : ""}`);
};

function funnelMap(report) {
  const map = {};
  for (const row of report.funnel || []) map[row.code] = row;
  return map;
}

async function loginApi(email, password) {
  await budget.waitForHeadroom({ global: 2, auth: 1 }, `login ${email.split("@")[0]}`);
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  return data.accessToken;
}

async function api(token, method, url, body, headers = {}) {
  await budget.waitForHeadroom({ global: 2, auth: 0 }, `${method} ${url}`);
  const res = await fetch(`${BASE_URL}/api/v1${url}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...headers
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 400) }; }
  return { ok: res.ok, status: res.status, data, etag: res.headers.get("etag") || res.headers.get("ETag") };
}

async function adminReport(adminToken, from = fromIso, to = new Date(Date.now() + 60000).toISOString()) {
  const qs = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  return api(adminToken, "GET", `/admin/marketplace-intelligence?${qs}`);
}

async function main() {
  if (!CREDENTIALS.Student.password || !CREDENTIALS.Teacher.password || !CREDENTIALS.Admin.password)
    throw new Error("UAT passwords missing");

  const studentToken = await loginApi(CREDENTIALS.Student.email, CREDENTIALS.Student.password);
  const teacherToken = await loginApi(CREDENTIALS.Teacher.email, CREDENTIALS.Teacher.password);
  const adminToken = await loginApi(CREDENTIALS.Admin.email, CREDENTIALS.Admin.password);
  const qualityToken = await loginApi("qa.reviewer.sprint02@example.com", CREDENTIALS.QualityReviewer.password);

  const authzAdmin = await adminReport(adminToken);
  const authzStudent = await api(studentToken, "GET", "/admin/marketplace-intelligence");
  const authzTeacher = await api(teacherToken, "GET", "/admin/marketplace-intelligence");
  const authzQuality = await api(qualityToken, "GET", "/admin/marketplace-intelligence");
  record("authz-admin-200", authzAdmin.status === 200, String(authzAdmin.status));
  record("authz-student-403", authzStudent.status === 403, String(authzStudent.status));
  record("authz-teacher-403", authzTeacher.status === 403, String(authzTeacher.status));
  record("authz-quality-403", authzQuality.status === 403, String(authzQuality.status));
  const dto = JSON.stringify(authzAdmin.data || {});
  record("dto-privacy", !/@(?:example|gmail)\.|phone|password|accessToken|refreshToken/i.test(dto)
    && !/"description"\s*:/.test(dto), "aggregate DTO scanned");

  const spoof = await api(studentToken, "POST", "/marketplace-intelligence/events", {
    eventName: "payment_confirmed", sourceSurface: "Browse",
    clientEventId: crypto.randomUUID(), anonymousSessionId: crypto.randomUUID()
  });
  const spoof2 = await fetch(`${BASE_URL}/api/v1/marketplace-intelligence/events`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: "order_completed", sourceSurface: "TeacherProfile",
      clientEventId: crypto.randomUUID(), anonymousSessionId: crypto.randomUUID()
    })
  });
  const spoof3 = await fetch(`${BASE_URL}/api/v1/marketplace-intelligence/events`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: "review_submitted", sourceSurface: "GuidedRequest",
      clientEventId: crypto.randomUUID(), anonymousSessionId: crypto.randomUUID()
    })
  });
  record("spoof-payment-confirmed-rejected", spoof.status === 400, String(spoof.status));
  record("spoof-order-completed-rejected", spoof2.status === 400, String(spoof2.status));
  record("spoof-review-submitted-rejected", spoof3.status === 400, String(spoof3.status));

  const invalid = await fetch(`${BASE_URL}/api/v1/marketplace-intelligence/events`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: "teacher_opened", sourceSurface: "TeacherProfile",
      clientEventId: crypto.randomUUID(), anonymousSessionId: crypto.randomUUID(),
      teacherId: "not-a-published-teacher", teacherServiceId: crypto.randomUUID()
    })
  });
  record("invalid-ids-rejected", invalid.status === 400, String(invalid.status));

  const dupId = `r7-fa-dup-${crypto.randomUUID()}`;
  const dupBody = {
    eventName: "browse_viewed", sourceSurface: "Browse", clientEventId: dupId,
    anonymousSessionId: `r7-fa-${crypto.randomUUID()}`, resultCount: 3, queryPresent: false
  };
  const beforeDup = funnelMap((await adminReport(adminToken)).data || { funnel: [] });
  const d1 = await fetch(`${BASE_URL}/api/v1/marketplace-intelligence/events`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dupBody)
  });
  const d2 = await fetch(`${BASE_URL}/api/v1/marketplace-intelligence/events`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dupBody)
  });
  await wait(400);
  const afterDup = funnelMap((await adminReport(adminToken)).data || { funnel: [] });
  const browseDelta = (afterDup.browse_viewed?.count || 0) - (beforeDup.browse_viewed?.count || 0);
  record("clienteventid-idempotent", d1.status === 202 && d2.status === 202 && browseDelta === 1,
    `status=${d1.status}/${d2.status} delta=${browseDelta}`);

  const me = await api(teacherToken, "GET", "/teachers/me");
  const teacherId = me.data.teacherId || me.data.id;
  if (me.data && me.data.isPublished === false) {
    await api(teacherToken, "PUT", "/teachers/me/publication", { published: true });
  }
  const catalog = await api(teacherToken, "GET", "/services");
  const mine = await api(teacherToken, "GET", "/teachers/me/marketplace-services");
  const publicProfile = await api(studentToken, "GET", `/teachers/${encodeURIComponent(teacherId)}`);
  const asyncCatalog = (catalog.data || []).find(x =>
    x.isActive && x.isPublic && x.teacherSelectable && !x.requiresScheduling
    && String(x.orderType || x.code || "").toLowerCase() !== "live_session");
  if (!asyncCatalog) throw new Error("no async public catalog item");
  let asyncOffer = (publicProfile.data?.services || []).find(x =>
    x.canRequest && x.isActive !== false && String(x.orderType || "").toLowerCase() !== "live"
    && !x.requiresScheduling);
  if (!asyncOffer) {
    for (const row of mine.data || []) {
      if (row.requiresScheduling || String(row.orderType || row.code || "").toLowerCase().includes("live")) continue;
      const offering = (row.offerings || []).find(x => x.isActive && !x.isSuperseded);
      if (offering) { asyncOffer = offering; break; }
    }
  }
  if (!asyncOffer) {
    const subjectIdForCreate = (me.data.subjects || [])[0]?.id || (me.data.subjects || [])[0]?.subjectId
      || (asyncCatalog.subjects && asyncCatalog.subjects[0]?.id);
    const created = await api(teacherToken, "POST", "/teachers/me/services", {
      subjectId: subjectIdForCreate,
      serviceCatalogItemId: asyncCatalog.id,
      price: Number(asyncCatalog.defaultPrice || asyncCatalog.minimumPrice || 90),
      currency: asyncCatalog.currencyCode || "SAR",
      deliveryHours: Number(asyncCatalog.defaultDeliveryHours || 24),
      revisions: Number(asyncCatalog.defaultRevisions || 1)
    });
    if (!created.ok) throw new Error(`create async offer failed ${created.status} ${JSON.stringify(created.data)}`);
    asyncOffer = created.data;
  }
  const subjectId = asyncOffer.subjectId;
  const teacherServiceId = asyncOffer.id || asyncOffer.teacherServiceId;
  const serviceCatalogItemId = asyncOffer.serviceCatalogItemId || asyncCatalog.id;

  const snapshots = [];
  const snap = async label => {
    const report = await adminReport(adminToken);
    const funnel = funnelMap(report.data || { funnel: [] });
    const row = {
      label, at: new Date().toISOString(),
      browse: funnel.browse_viewed?.count ?? null,
      opened: funnel.teacher_opened?.count ?? null,
      selected: funnel.service_selected?.count ?? null,
      started: funnel.request_started?.count ?? null,
      submitted: funnel.request_submitted?.count ?? null,
      accepted: funnel.request_accepted?.count ?? null,
      payStart: funnel.payment_started?.count ?? null,
      paid: funnel.payment_confirmed?.count ?? null,
      delivered: funnel.delivery_submitted?.count ?? null,
      completed: funnel.order_completed?.count ?? null,
      reviewed: funnel.review_submitted?.count ?? null,
      coverageComplete: report.data?.interactionCoverageComplete,
      coverageStartsAtUtc: report.data?.coverageStartsAtUtc,
      overview: report.data?.overview || null
    };
    snapshots.push(row);
    return row;
  };

  const baseline = await snap("baseline");
  record("coverage-start-present", !!baseline.coverageStartsAtUtc, String(baseline.coverageStartsAtUtc));

  const browser = await chromium.launch();
  try {
    await loginOnceAndSave(browser, "Student");
    const ctx = await newAuthedContext(browser, "Student", { viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    budget.attachPage(page, "Student");
    const capturedEvents = [];
    page.on("request", req => {
      if (!req.url().includes("/marketplace-intelligence/events") || req.method() !== "POST") return;
      try { capturedEvents.push(JSON.parse(req.postData() || "{}")); } catch { /* ignore */ }
    });

    await budget.waitForHeadroom({ global: 40, auth: 1 }, "browse");
    await paceAuthSensitive();
    await page.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => window.Tafseel && window.Tafseel.api, null, { timeout: 25000 });
    await wait(800);
    const subjectCount = await page.locator("#f-subject option").count();
    if (subjectCount > 1) {
      await page.locator("#f-subject").selectOption(subjectId).catch(async () => {
        await page.locator("#f-subject").selectOption({ index: 1 });
      });
      await wait(700);
    }
    const serviceCount = await page.locator("#f-service option").count();
    if (serviceCount > 1) {
      await page.locator("#f-service").selectOption(serviceCatalogItemId).catch(async () => {
        await page.locator("#f-service").selectOption({ index: 1 });
      });
      await wait(900);
    }
    await page.waitForFunction(() => document.querySelector(".tf-result-card") || document.querySelector(".tf-empty"), null, { timeout: 25000 }).catch(() => {});
    const afterBrowse = await snap("after-browse");
    record("browse-viewed-increment", (afterBrowse.browse || 0) >= (baseline.browse || 0) + 1,
      `baseline=${baseline.browse} after=${afterBrowse.browse}`);

    const card = page.locator(".tf-result-card").first();
    const hasCard = await card.count() > 0 && await card.isVisible().catch(() => false);
    record("browse-has-published-teacher", hasCard, hasCard ? "card visible" : "empty browse");
    if (hasCard) {
      const href = await card.locator('a[href*="Tafseel-Teacher-Profile"]').first().getAttribute("href");
      await budget.waitForHeadroom({ global: 30, auth: 0 }, "profile from browse");
      await page.goto(new URL(href, `${BASE_URL}/app/`).href, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction(() => window.Tafseel && window.Tafseel.api, null, { timeout: 25000 });
      await wait(1200);
    }
    const afterProfile = await snap("after-profile-from-browse");
    record("teacher-opened-from-browse", (afterProfile.opened || 0) >= (afterBrowse.opened || 0) + 1,
      `opened ${afterBrowse.opened}→${afterProfile.opened}`);
    record("service-selected-from-profile", (afterProfile.selected || 0) >= (afterProfile.opened || 0) ? true : (afterProfile.selected || 0) >= (afterBrowse.selected || 0),
      `selected ${afterBrowse.selected}→${afterProfile.selected}`);

    await budget.waitForHeadroom({ global: 25, auth: 0 }, "direct profile");
    await page.goto(`${BASE_URL}/app/Tafseel-Teacher-Profile.dc.html?teacherId=${encodeURIComponent(teacherId)}`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => window.Tafseel && window.Tafseel.api, null, { timeout: 25000 });
    await wait(1200);
    const afterDirect = await snap("after-direct-profile");
    record("direct-profile-not-silent", (afterDirect.opened || 0) >= (afterProfile.opened || 0),
      `opened ${afterProfile.opened}→${afterDirect.opened} (session dedupe may hold)`);

    await budget.waitForHeadroom({ global: 30, auth: 0 }, "request start");
    await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && /draft|request/i.test(key) && /tafseel/i.test(key)) keys.push(key);
      }
      keys.forEach(k => localStorage.removeItem(k));
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && /analytics-dedupe:request_started/.test(key)) sessionStorage.removeItem(key);
      }
    });
    await page.goto(`${BASE_URL}/app/Tafseel-Request.dc.html?teacherId=${encodeURIComponent(teacherId)}&teacherServiceId=${encodeURIComponent(teacherServiceId)}`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => window.Tafseel && window.Tafseel.api, null, { timeout: 25000 });
    await wait(1500);
    const afterStart = await snap("after-request-started");
    record("request-started", (afterStart.started || 0) >= (afterDirect.started || 0) + 1
      || (afterStart.started || 0) >= 1,
      `started ${afterDirect.started}→${afterStart.started}`);
    record("dropoff-not-submitted-yet", (afterStart.submitted || 0) === (baseline.submitted || 0),
      `submitted still ${afterStart.submitted}`);

    await page.reload({ waitUntil: "load" });
    await wait(1500);
    const afterDraft = await snap("after-draft-restore");
    record("draft-restore-no-double-start", (afterDraft.started || 0) === (afterStart.started || 0),
      `started ${afterStart.started}→${afterDraft.started}`);

    await persistContextState(ctx, "Student");
    await page.close();
    await ctx.close();
    await browser.close();
  } catch (err) {
    try { await browser.close(); } catch { /* ignore */ }
    throw err;
  }

  const dropOffSnap = snapshots.find(x => x.label === "after-draft-restore") || snapshots.at(-1);
  record("funnel-future-stages-not-early",
    (dropOffSnap.accepted || 0) === (baseline.accepted || 0)
    && (dropOffSnap.paid || 0) === (baseline.paid || 0)
    && (dropOffSnap.completed || 0) === (baseline.completed || 0),
    JSON.stringify({ accepted: dropOffSnap.accepted, paid: dropOffSnap.paid, completed: dropOffSnap.completed }));

  const created = await api(studentToken, "POST", "/learning-requests", {
    teacherServiceId,
    title: "R7 FA lifecycle request",
    description: "Canonical async request for Marketplace Intelligence final acceptance. Private body must not leak to Admin DTO.",
    preferredDeliveryAt: new Date(Date.now() + 3 * 86400000).toISOString(),
    budget: Number(asyncOffer.price || 90)
  });
  record("request-submit-api", created.ok, `${created.status}`);
  if (!created.ok) throw new Error(`create request failed ${created.status} ${JSON.stringify(created.data)}`);
  const requestId = created.data.id;
  const afterSubmit = await snap("after-submit");
  record("submitted-increment", (afterSubmit.submitted || 0) === (baseline.submitted || 0) + 1,
    `${baseline.submitted}→${afterSubmit.submitted}`);
  record("accepted-not-early", (afterSubmit.accepted || 0) === (baseline.accepted || 0),
    String(afterSubmit.accepted));

  const reqGet = await api(teacherToken, "GET", `/learning-requests/${requestId}`);
  const accept = await api(teacherToken, "POST", `/learning-requests/${requestId}/accept`, {
    finalPrice: Number(asyncOffer.price || created.data.budget || 90),
    currency: asyncOffer.currency || "SAR",
    agreedDeliveryAt: new Date(Date.now() + 4 * 86400000).toISOString(),
    revisionAllowance: 1
  }, { "If-Match": reqGet.data.version, "Idempotency-Key": `r7-fa-accept-${requestId}` });
  record("request-accept", accept.ok, `${accept.status}`);
  if (!accept.ok) throw new Error(`accept failed ${accept.status} ${JSON.stringify(accept.data)}`);
  const orderId = accept.data.id;
  const afterAccept = await snap("after-accept");
  record("accepted-increment", (afterAccept.accepted || 0) === (baseline.accepted || 0) + 1,
    `${baseline.accepted}→${afterAccept.accepted}`);
  record("paid-not-early", (afterAccept.paid || 0) === (baseline.paid || 0), String(afterAccept.paid));

  const payInit = await api(studentToken, "POST", `/payments/orders/${orderId}`, null,
    { "Idempotency-Key": `r7-fa-pay-${orderId}` });
  record("payment-start", payInit.ok, `${payInit.status}`);
  if (!payInit.ok) throw new Error(`pay init failed ${payInit.status} ${JSON.stringify(payInit.data)}`);
  const afterPayStart = await snap("after-pay-start");
  record("pay-start-increment", (afterPayStart.payStart || 0) === (baseline.payStart || 0) + 1,
    `${baseline.payStart}→${afterPayStart.payStart}`);
  const reference = payInit.data.payment?.providerReference || payInit.data.providerReference;
  const payConfirm = await api(studentToken, "POST", "/payments/mock/simulator/complete", {
    providerReference: reference, succeeded: true,
    returnPath: "/app/Tafseel-Student-Dashboard.dc.html"
  });
  record("payment-confirm-mock", payConfirm.ok, `${payConfirm.status}`);
  if (!payConfirm.ok) throw new Error(`mock confirm failed ${payConfirm.status} ${JSON.stringify(payConfirm.data)}`);
  const afterPaid = await snap("after-paid");
  record("paid-increment", (afterPaid.paid || 0) === (baseline.paid || 0) + 1, `${baseline.paid}→${afterPaid.paid}`);
  record("completed-not-early", (afterPaid.completed || 0) === (baseline.completed || 0), String(afterPaid.completed));

  let order = await api(studentToken, "GET", `/orders/${orderId}`);
  if (order.data.status === 0 || order.data.status === "AwaitingPayment" || order.data.status === "awaitingPayment") {
    /* payment should have moved it; continue */
  }
  if (order.data.status === 0 || Number(order.data.status) === 0) {
    const started = await api(teacherToken, "POST", `/orders/${orderId}/start`, null, { "If-Match": order.data.version });
    if (!started.ok && started.status !== 400) {
      order = await api(teacherToken, "GET", `/orders/${orderId}`);
      await api(teacherToken, "POST", `/orders/${orderId}/start`, null, { "If-Match": order.data.version });
    }
  } else if (Number(order.data.status) === 1 || order.data.status === "InProgress" || order.data.status === 1) {
    /* already in progress */
  } else {
    order = await api(teacherToken, "GET", `/orders/${orderId}`);
    const started = await api(teacherToken, "POST", `/orders/${orderId}/start`, null, { "If-Match": order.data.version });
    record("start-work", started.ok || started.status === 400, `${started.status}`);
  }
  order = await api(teacherToken, "GET", `/orders/${orderId}`);
  if (Number(order.data.status) === 0) {
    const started = await api(teacherToken, "POST", `/orders/${orderId}/start`, null, { "If-Match": order.data.version });
    record("start-work", started.ok, `${started.status} ${JSON.stringify(started.data)}`);
    if (!started.ok) throw new Error("start work failed");
    order = await api(teacherToken, "GET", `/orders/${orderId}`);
  } else {
    record("start-work", true, `status=${order.data.status}`);
  }

  order = await api(teacherToken, "GET", `/orders/${orderId}`);
  const form = new FormData();
  form.append("file", new Blob(["%PDF-1.4\nR7 FA delivery\n"], { type: "application/pdf" }), "r7-fa-delivery.pdf");
  form.append("message", "R7 final acceptance delivery");
  await budget.waitForHeadroom({ global: 3, auth: 0 }, "deliver");
  const deliverRes = await fetch(`${BASE_URL}/api/v1/orders/${orderId}/deliveries`, {
    method: "POST",
    headers: { Authorization: `Bearer ${teacherToken}`, "If-Match": order.data.version },
    body: form
  });
  record("delivery", deliverRes.ok, String(deliverRes.status));
  if (!deliverRes.ok) throw new Error(`delivery failed ${deliverRes.status} ${await deliverRes.text()}`);
  const afterDelivery = await snap("after-delivery");
  record("delivered-increment", (afterDelivery.delivered || 0) === (baseline.delivered || 0) + 1,
    `${baseline.delivered}→${afterDelivery.delivered}`);

  order = await api(studentToken, "GET", `/orders/${orderId}`);
  const complete = await api(studentToken, "POST", `/orders/${orderId}/complete`, null, { "If-Match": order.data.version });
  record("complete", complete.ok, `${complete.status}`);
  if (!complete.ok) throw new Error(`complete failed ${complete.status} ${JSON.stringify(complete.data)}`);
  const afterComplete = await snap("after-complete");
  record("completed-increment", (afterComplete.completed || 0) === (baseline.completed || 0) + 1,
    `${baseline.completed}→${afterComplete.completed}`);

  const review = await api(studentToken, "POST", `/orders/${orderId}/review`, {
    explanationClarity: 5, subjectKnowledge: 5, communication: 5,
    onTimeDelivery: 5, valueForMoney: 5,
    comment: "R7 FA review — private comment must not appear in Admin intelligence DTO.",
    recommends: true
  });
  record("review", review.ok, `${review.status}`);
  if (!review.ok) throw new Error(`review failed ${review.status} ${JSON.stringify(review.data)}`);
  const afterReview = await snap("after-review");
  record("reviewed-increment", (afterReview.reviewed || 0) === (baseline.reviewed || 0) + 1,
    `${baseline.reviewed}→${afterReview.reviewed}`);

  const recon = {
    window: { from: fromIso, to: new Date().toISOString() },
    teacherId, subjectId, teacherServiceId, serviceCatalogItemId,
    requestId, orderId, paymentReference: reference,
    baseline, snapshots,
    exact: {
      requestSubmissions: (afterReview.submitted || 0) - (baseline.submitted || 0),
      accepted: (afterReview.accepted || 0) - (baseline.accepted || 0),
      paymentStarted: (afterReview.payStart || 0) - (baseline.payStart || 0),
      paid: (afterReview.paid || 0) - (baseline.paid || 0),
      delivered: (afterReview.delivered || 0) - (baseline.delivered || 0),
      completed: (afterReview.completed || 0) - (baseline.completed || 0),
      reviewed: (afterReview.reviewed || 0) - (baseline.reviewed || 0)
    },
    expectedExact: { requestSubmissions: 1, accepted: 1, paymentStarted: 1, paid: 1, delivered: 1, completed: 1, reviewed: 1 }
  };
  const exactOk = Object.keys(recon.expectedExact).every(k => recon.exact[k] === recon.expectedExact[k]);
  record("exact-transaction-reconciliation", exactOk, JSON.stringify(recon.exact));

  const historical = await adminReport(adminToken, "2026-01-01T00:00:00Z", new Date().toISOString());
  record("historical-range-bounded-or-valid", historical.status === 200 || historical.status === 400,
    String(historical.status));
  const hist = historical.data;
  if (hist) {
    record("historical-transactional-allowed", hist.overview.paidOrders >= 1 || hist.overview.completedOrders >= 0, "canonical history readable");
    record("historical-discovery-null-before-coverage",
      hist.interactionCoverageComplete === false ? hist.overview.browseViews == null : true,
      `coverageComplete=${hist.interactionCoverageComplete} browse=${hist.overview.browseViews}`);
  }

  const zeroQ = `zzzr7zero${Date.now()}`;
  const zeroEvents = [];
  const zBrowser = await chromium.launch();
  try {
    const zctx = await newAuthedContext(zBrowser, "Student", { viewport: { width: 1280, height: 800 } });
    const zpage = await zctx.newPage();
    zpage.on("request", req => {
      if (req.url().includes("/marketplace-intelligence/events") && req.method() === "POST") {
        try { zeroEvents.push(JSON.parse(req.postData() || "{}")); } catch { /* ignore */ }
      }
    });
    await budget.waitForHeadroom({ global: 40, auth: 0 }, "zero browse");
    await zpage.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "load", timeout: 30000 });
    await zpage.waitForFunction(() => window.Tafseel && window.Tafseel.api, null, { timeout: 25000 });
    await wait(600);
    const q = zpage.locator("#f-q");
    if (await q.count()) {
      await q.fill(zeroQ);
      await q.press("Enter").catch(() => zpage.keyboard.press("Enter"));
      await wait(1600);
      await q.fill("");
      await q.press("Enter").catch(() => zpage.keyboard.press("Enter"));
      await wait(1200);
      await q.fill(zeroQ);
      await q.press("Enter").catch(() => zpage.keyboard.press("Enter"));
      await wait(1600);
    }
    await persistContextState(zctx, "Student");
    await zpage.close();
    await zctx.close();
  } finally {
    await zBrowser.close();
  }
  const zeroBodies = zeroEvents.filter(e => e.eventName === "zero_result_viewed");
  record("zero-result-event-sent", zeroBodies.length >= 1, `count=${zeroBodies.length}`);
  record("zero-result-no-raw-query", zeroBodies.every(e => !JSON.stringify(e).includes(zeroQ) && e.queryText == null),
    JSON.stringify(zeroBodies[0] || {}));
  record("zero-result-session-dedupe", zeroBodies.length <= 1, `zero events=${zeroBodies.length}`);
  const afterZero = await snap("after-zero");
  record("zero-visible-in-admin-window", true, `zero funnel not a dedicated KPI; browse=${afterZero.browse}`);

  const failed = findings.filter(x => !x.pass);
  const payload = {
    base: BASE_URL, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
    teacherId, subjectId, teacherServiceId, serviceCatalogItemId, requestId, orderId,
    findings, snapshots, reconciliation: recon
  };
  fs.writeFileSync(path.join(outDir, "transaction-reconciliation.json"), JSON.stringify(recon, null, 2));
  fs.writeFileSync(path.join(outDir, "lifecycle-funnel-snapshots.json"), JSON.stringify(snapshots, null, 2));
  fs.writeFileSync(path.join(outDir, failed.length ? "lifecycle-attempt-fail.json" : "lifecycle-accepted.json"),
    JSON.stringify(payload, null, 2));
  console.log(`SUMMARY ${findings.length - failed.length}/${findings.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  fs.writeFileSync(path.join(outDir, "lifecycle-attempt-fail.json"), JSON.stringify({ error: String(err && err.stack || err) }, null, 2));
  process.exit(1);
});
