const BASE = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5092";
const password = process.env.TAFSEEL_UAT_SESSION_PASSWORD;
const email = process.argv[2] || "student.sprint02.uat@example.com";
const res = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password })
});
console.log(email, res.status);
if (!res.ok) process.exitCode = 1;
else {
  const session = await res.json();
  const messages = await fetch(`${BASE}/api/v1/conversations?pageSize=1`, {
    headers: { Authorization: `Bearer ${session.accessToken}` }
  });
  console.log("conversations", messages.status);
}
