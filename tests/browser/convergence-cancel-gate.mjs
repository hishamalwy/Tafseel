/* Phase 6 — Student cancels a selection before paying.

   Canonical rule: cancellation returns the request to OpenForOffers, returns the
   selected Offer to Submitted, and clears the reservation. No Order is created.

   Runs against every request the Student currently holds in AwaitingPayment, so
   it doubles as cleanup for reservations abandoned by interrupted E2E runs. */
import { chromium } from "@playwright/test";
import { BASE_URL, loginAs } from "./lib/auth.mjs";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await loginAs(ctx, "Student", 1, await ctx.newPage()).then(p => p.close());
const page = await ctx.newPage();
await page.goto(`${BASE_URL}/app/Tafseel-Landing.dc.html`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);

const call = (m, u, b, h) => page.evaluate(async ([mm, uu, bb, hh]) => {
  try {
    const r = mm === "get" ? await window.Tafseel.api.get(uu)
      : await window.Tafseel.api.post(uu, bb, hh || undefined);
    return { ok: true, data: r };
  } catch (e) { return { ok: false, status: e && e.status, message: String((e && e.message) || e) }; }
}, [m, u, b || null, h || null]);

const results = [];
const fail = [];
const ok = (n, c, d) => { results.push([n, !!c, d]); if (!c) fail.push(n); };

const mine = await call("get", "/learning-requests/mine?page=1&pageSize=50");
const awaiting = mine.ok
  ? (mine.data.items || []).filter(x => Number(x.status) === 6) : [];
ok("found requests awaiting payment to cancel", awaiting.length > 0, `count=${awaiting.length}`);

let cancelled = 0;
for (const r of awaiting) {
  const before = await call("get", `/open-marketplace/requests/${r.id}`);
  if (!before.ok) continue;
  const selectedOfferId = before.data.selectedOfferId;

  const res = await call("post", `/open-marketplace/requests/${r.id}/cancel-selection`, null,
    { "If-Match": before.data.version });
  if (!res.ok) { ok(`cancel ${r.id.slice(0, 8)}`, false, res.message); continue; }

  const after = await call("get", `/open-marketplace/requests/${r.id}`);
  const offers = await call("get", `/open-marketplace/requests/${r.id}/offers`);
  const freed = offers.ok ? (offers.data || []).find(o => o.id === selectedOfferId) : null;

  ok(`request ${r.id.slice(0, 8)} reopened for Offers`,
    after.ok && Number(after.data.status) === 5, after.ok ? `status=${after.data.status}` : after.message);
  ok(`request ${r.id.slice(0, 8)} reservation cleared`,
    after.ok && !after.data.paymentReservationExpiresAt);
  ok(`request ${r.id.slice(0, 8)} selection released`,
    after.ok && !after.data.selectedOfferId);
  if (freed) ok(`offer ${selectedOfferId.slice(0, 8)} returned to Submitted`,
    Number(freed.status) === 0, `status=${freed.status}`);
  cancelled++;
}

// No Order may exist for a cancelled request.
const orders = await call("get", "/orders/mine?page=1&pageSize=50");
const orphan = orders.ok
  ? (orders.data.items || []).filter(o => awaiting.some(a => a.id === o.learningRequestId)) : [];
ok("cancellation created no Order", orphan.length === 0, `orders=${orphan.length}`);

for (const [n, p, d] of results) console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`);
console.log(`\ncancelled ${cancelled} reservation(s)`);
await ctx.close();
await browser.close();
if (fail.length) { console.log("\nFAILURES:\n- " + fail.join("\n- ")); process.exit(1); }
console.log("cancellation gate: all checks passed");
