#!/usr/bin/env bash
# Probes routes on a running host without following redirects.
#   BASE=http://localhost:5199 bash probe-routes.sh
# The inventory sections print what the host answers. The "expected" section (Wave 1: the
# Angular client is the site) asserts status and Location and exits non-zero on a mismatch.
set -u
B=${BASE:?set BASE to the running host, e.g. http://localhost:5199}
G=00000000-0000-0000-0000-000000000001
probe() {
  local out
  out=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" -X "$1" -H "Accept-Language: ar" "$B$2")
  printf '%-7s %-62s %s\n' "$1" "$2" "$out"
}
echo "## root, locales, SPA fallback"
for p in / /ar /en /en/teachers /en/student/overview "/orders/$G" "/en/orders/$G" "/en/conversations/$G" "/en/live-sessions/$G"; do probe GET "$p"; done
echo "## legacy pages (redirect table since Wave 1)"
for p in Landing Auth Confirm-Email Browse-Teachers Teacher-Profile Request Book-Session Payment Mock-Checkout \
         Open-Marketplace Disputes Policies About Student-Dashboard Teacher-Dashboard Quality-Dashboard Admin-Dashboard Teacher-Apply; do
  probe GET "/app/Tafseel-$p.dc.html"
done
for p in /app/Tafseel-Chat.dc.html /app/js/api.js /app/js/open-marketplace.js /app/js/open-marketplace-locales.js /app/css/tafseel.css /app/support.js /favicon.ico; do probe GET "$p"; done
echo "## health"
probe GET /health/live
probe GET /health/ready
echo "## API calls the Angular client makes that the endpoint table rejects"
probe POST /api/v1/favorite-teachers
probe GET  /api/v1/open-marketplace/requests
probe POST "/api/v1/open-marketplace/requests/$G/offers"
probe POST "/api/v1/open-marketplace/offers/$G/accept"
probe POST "/api/v1/learning-requests/$G/publish"
probe GET  "/api/v1/teachers/availability?subjectId=$G"
probe PUT  "/api/v1/admin/coupons/$G/active"
probe PUT  "/api/v1/admin/promotions/$G/active"
probe PUT  "/api/v1/admin/catalog/subjects/$G/active"
echo "## controls"
probe GET  /api/v1/teachers
probe GET  /api/v1/does-not-exist
probe PATCH "/api/v1/admin/coupons/$G/active"

echo "## expected (Wave 1)"
failures=0
# check METHOD PATH ACCEPT-LANGUAGE STATUS [LOCATION]
check() {
  local out code location
  out=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" -X "$1" -H "Accept-Language: $3" "$B$2")
  code=${out%% *}
  location=${out#* }
  location=${location#"$B"}
  if [ "$code" = "$4" ] && { [ -z "${5-}" ] || [ "$location" = "$5" ]; }; then
    printf 'PASS  %-6s %-62s %s %s\n' "$1" "$2" "$code" "$location"
  else
    printf 'FAIL  %-6s %-62s got %s %s, want %s %s\n' "$1" "$2" "$code" "$location" "$4" "${5-}"
    failures=$((failures + 1))
  fi
}
check GET / ar 302 /ar/
check GET / en 302 /en/
check GET '/?ref=mail&x=a%2Bb' en 302 '/en/?ref=mail&x=a%2Bb'
check GET "/orders/$G" ar 302 "/ar/orders/$G"
for p in /ar/ /en/ "/ar/orders/$G" "/en/live-sessions/$G" "/en/conversations/$G" "/ar/requests/$G" \
         "/ar/requests/$G/offers" "/en/disputes/$G" "/ar/teacher/reviews/$G" /en/admin/operations/sessions \
         /en/messages /ar/no/such/page; do
  check GET "$p" ar 200
done
check GET /api/v1/does-not-exist en 404
check GET /hubs/does-not-exist en 404
check GET /health/does-not-exist en 404
check GET /health/live en 200
check GET /app/Tafseel-Landing.dc.html ar 302 /ar/
check GET '/app/Tafseel-Auth.dc.html?mode=reset&email=a%40b.test&token=t%2B1' en 302 '/en/auth?mode=reset&email=a@b.test&token=t%2B1'
check GET /app/Tafseel-Chat.dc.html en 302 /en/messages
check GET '/app/Tafseel-Student-Dashboard.dc.html?section=messages' en 302 /en/messages
check GET "/app/Tafseel-Teacher-Profile.dc.html?id=$G" ar 302 "/ar/teachers/$G"
check GET /en/app/Tafseel-Disputes.dc.html ar 302 /en/disputes
for p in /app/ /app/support.js /app/js/api.js /app/js/vendor/babel.min.js /app/css/tafseel.css \
         /app/assets/fonts/thmanyah-sans/thmanyah-sans-regular.woff2 /app/Tafseel-Nope.dc.html /app/appsettings.json; do
  check GET "$p" ar 404
done
check GET /app/assets/brand/tafseel-mark-dark.png ar 200
check GET /favicon.ico ar 200
csp=$(curl -s -D - -o /dev/null "$B/en/" | tr -d '\r' | grep -i '^content-security-policy:')
if [ -z "$csp" ]; then
  echo "FAIL  no Content-Security-Policy header on /en/"; failures=$((failures + 1))
elif printf '%s' "$csp" | grep -q "unsafe-eval"; then
  echo "FAIL  CSP allows 'unsafe-eval'"; failures=$((failures + 1))
else
  echo "PASS  CSP has no 'unsafe-eval'"
fi
echo "expected checks failed: $failures"
exit "$failures"
