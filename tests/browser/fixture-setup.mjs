// Drives the real, canonical Student->Teacher lifecycle through the real API to reach a
// legitimate Completed + Paid + Unrated order, so the actual Rate Teacher star-rating form can
// be live-certified. No raw SQL. All state changes go through the same endpoints a real user's
// browser would call.
const BASE = "http://127.0.0.1:5090";
const TEACHER_ID = "c6f1d8af-ffb2-4cae-9dd7-73047f999c53";
const SERVICE_ID = "f0b6f5da-3384-4096-a636-58fe0c1d49b3";

async function login(email, password) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.accessToken;
}

async function main() {
  const studentPassword = process.env.TAFSEEL_UAT_STUDENT_PASSWORD;
  const teacherPassword = process.env.TAFSEEL_UAT_TEACHER_PASSWORD;
  if (!studentPassword || !teacherPassword) throw new Error("Missing UAT passwords in env");

  const studentToken = await login("student.sprint02.uat@example.com", studentPassword);
  const teacherToken = await login("teacher.sprint02.uat@example.com", teacherPassword);
  console.log("logged in as Student + Teacher");

  // 1. Student creates a learning request
  const reqRes = await fetch(`${BASE}/api/v1/learning-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({
      teacherServiceId: SERVICE_ID,
      title: "Final Acceptance Gate - real rating fixture",
      description: "Automated fixture setup to certify the actual star-rating form.",
      preferredDeliveryAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      budget: 100
    })
  });
  const reqBody = await reqRes.json();
  if (!reqRes.ok) throw new Error(`request creation failed: ${reqRes.status} ${JSON.stringify(reqBody)}`);
  console.log("Learning request created:", reqBody.id || JSON.stringify(reqBody).slice(0, 200));
  const requestId = reqBody.id;

  // 2. Teacher accepts
  const assignedRes = await fetch(`${BASE}/api/v1/learning-requests/assigned?pageSize=100`, {
    headers: { Authorization: `Bearer ${teacherToken}` }
  });
  const assignedBody = await assignedRes.json();
  const items = assignedBody.items || assignedBody;
  const match = items.find(x => x.id === requestId);
  if (!match) throw new Error(`request ${requestId} not found in teacher's assigned list`);
  console.log("request version:", match.version);

  const acceptRes = await fetch(`${BASE}/api/v1/learning-requests/${requestId}/accept`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Authorization: `Bearer ${teacherToken}`,
      "Idempotency-Key": crypto.randomUUID(), "If-Match": `"${match.version}"`
    },
    body: JSON.stringify({
      finalPrice: 100, currency: "SAR",
      agreedDeliveryAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      revisionAllowance: 2
    })
  });
  const acceptBody = await acceptRes.json();
  if (!acceptRes.ok) throw new Error(`accept failed: ${acceptRes.status} ${JSON.stringify(acceptBody)}`);
  const orderId = acceptBody.orderId || acceptBody.id;
  console.log("Order created:", orderId);

  // 3. Payment init + mock confirm via webhook simulator requires signature we don't have from
  //    curl - drive it through the real payment init, then use the Mock Checkout confirm endpoint
  //    the browser UI itself calls (no signature needed there, matching prior sessions' pattern).
  const payInitRes = await fetch(`${BASE}/api/v1/payments/orders/${orderId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Authorization: `Bearer ${studentToken}`,
      "Idempotency-Key": crypto.randomUUID()
    },
    body: JSON.stringify({})
  });
  const payBody = await payInitRes.json();
  if (!payInitRes.ok) throw new Error(`payment init failed: ${payInitRes.status} ${JSON.stringify(payBody)}`);
  console.log("Payment initialized:", JSON.stringify(payBody).slice(0, 200));

  console.log(`FIXTURE_STAGE1_DONE orderId=${orderId} requestId=${requestId}`);
}

main().catch(err => { console.error(err); process.exit(1); });
