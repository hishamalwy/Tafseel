const BASE = "http://127.0.0.1:5090";
const SERVICE_ID = "f0b6f5da-3384-4096-a636-58fe0c1d49b3";

async function login(email, password) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  return (await res.json()).accessToken;
}

async function main() {
  const studentToken = await login("student.sprint02.uat@example.com", process.env.TAFSEEL_UAT_STUDENT_PASSWORD);
  const teacherToken = await login("teacher.sprint02.uat@example.com", process.env.TAFSEEL_UAT_TEACHER_PASSWORD);

  const req = await fetch(`${BASE}/api/v1/learning-requests`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({
      teacherServiceId: SERVICE_ID, title: "Final Acceptance Gate - stable matrix Rate Teacher fixture",
      description: "Dedicated, never-submitted Completed+Paid+Unrated order for the 384-cell matrix Rate Teacher surface.",
      preferredDeliveryAt: new Date(Date.now() + 3 * 86400000).toISOString(), budget: 100
    })
  });
  const reqBody = await req.json();
  if (!req.ok) throw new Error(`request failed: ${JSON.stringify(reqBody)}`);
  const requestId = reqBody.id;

  const assignedRes = await fetch(`${BASE}/api/v1/learning-requests/assigned?pageSize=100`, { headers: { Authorization: `Bearer ${teacherToken}` } });
  const items = (await assignedRes.json()).items;
  const match = items.find(x => x.id === requestId);

  const accept = await fetch(`${BASE}/api/v1/learning-requests/${requestId}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${teacherToken}`, "Idempotency-Key": crypto.randomUUID(), "If-Match": `"${match.version}"` },
    body: JSON.stringify({ finalPrice: 100, currency: "SAR", agreedDeliveryAt: new Date(Date.now() + 3 * 86400000).toISOString(), revisionAllowance: 2 })
  });
  const acceptBody = await accept.json();
  if (!accept.ok) throw new Error(`accept failed: ${JSON.stringify(acceptBody)}`);
  const orderId = acceptBody.orderId || acceptBody.id;
  console.log("Order created:", orderId);

  const pay = await fetch(`${BASE}/api/v1/payments/orders/${orderId}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentToken}`, "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({})
  });
  if (!pay.ok) throw new Error(`payment init failed: ${await pay.text()}`);
  console.log(`FIXTURE_MATRIX_STAGE1_DONE orderId=${orderId}`);
}
main().catch(err => { console.error(err); process.exit(1); });
