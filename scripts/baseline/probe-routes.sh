#!/usr/bin/env bash
# Probes routes on a running host without following redirects.
#   BASE=http://localhost:5199 bash probe-routes.sh
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
echo "## legacy pages (Program.cs allowlist)"
for p in Landing Auth Confirm-Email Browse-Teachers Teacher-Profile Request Book-Session Payment Mock-Checkout \
         Open-Marketplace Disputes Policies About Student-Dashboard Teacher-Dashboard Quality-Dashboard Admin-Dashboard Teacher-Apply; do
  probe GET "/app/Tafseel-$p.dc.html"
done
for p in /app/Tafseel-Chat.dc.html /app/js/open-marketplace.js /app/js/open-marketplace-locales.js /app/css/tafseel.css /app/support.js /favicon.ico; do probe GET "$p"; done
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
