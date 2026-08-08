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

  // Fixture A: fresh pending request for Accept Request modal (leave unaccepted)
  const reqA = await fetch(`${BASE}/api/v1/learning-requests`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({
      teacherServiceId: SERVICE_ID, title: "Final Acceptance Gate - Accept Request fixture",
      description: "Fixture for live Accept Request modal certification.",
      preferredDeliveryAt: new Date(Date.now() + 3 * 86400000).toISOString(), budget: 100
    })
  });
  const reqABody = await reqA.json();
  if (!reqA.ok) throw new Error(`fixture A request failed: ${JSON.stringify(reqABody)}`);
  console.log("Fixture A (Accept Request pending):", reqABody.id);

  // Fixture B: accepted + paid + started order for Delivery Upload modal (leave undelivered)
  const reqB = await fetch(`${BASE}/api/v1/learning-requests`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({
      teacherServiceId: SERVICE_ID, title: "Final Acceptance Gate - Delivery Upload fixture",
      description: "Fixture for live Delivery Upload modal certification.",
      preferredDeliveryAt: new Date(Date.now() + 3 * 86400000).toISOString(), budget: 100
    })
  });
  const reqBBody = await reqB.json();
  if (!reqB.ok) throw new Error(`fixture B request failed: ${JSON.stringify(reqBBody)}`);
  const requestBId = reqBBody.id;

  const assignedRes = await fetch(`${BASE}/api/v1/learning-requests/assigned?pageSize=100`, { headers: { Authorization: `Bearer ${teacherToken}` } });
  const assignedItems = (await assignedRes.json()).items;
  const matchB = assignedItems.find(x => x.id === requestBId);

  const acceptB = await fetch(`${BASE}/api/v1/learning-requests/${requestBId}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${teacherToken}`, "Idempotency-Key": crypto.randomUUID(), "If-Match": `"${matchB.version}"` },
    body: JSON.stringify({ finalPrice: 100, currency: "SAR", agreedDeliveryAt: new Date(Date.now() + 3 * 86400000).toISOString(), revisionAllowance: 2 })
  });
  const acceptBBody = await acceptB.json();
  if (!acceptB.ok) throw new Error(`fixture B accept failed: ${JSON.stringify(acceptBBody)}`);
  const orderBId = acceptBBody.orderId || acceptBBody.id;
  console.log("Fixture B order created:", orderBId);

  const payB = await fetch(`${BASE}/api/v1/payments/orders/${orderBId}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentToken}`, "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({})
  });
  if (!payB.ok) throw new Error(`fixture B payment init failed: ${await payB.text()}`);
  console.log("Fixture B payment initialized (needs browser confirm)");

  console.log(`FIXTURE_REMAINING_DONE requestAId=${reqABody.id} orderBId=${orderBId}`);
}
main().catch(err => { console.error(err); process.exit(1); });
