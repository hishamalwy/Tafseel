import { BASE_URL } from "./auth.mjs";

// Real, live UAT fixture identifiers used by this harness (Development-only, not secret).
export const TEACHER_ID = "c6f1d8af-ffb2-4cae-9dd7-73047f999c53";
export const SERVICE_ID = "f0b6f5da-3384-4096-a636-58fe0c1d49b3";
export const DELIVERED_ORDER_ID = "8f4745ef-e1b8-42fb-988a-fdc899af066a"; // Delivered, unrated -> Review Delivery modal
export const COMPLETED_ORDER_ID = "6dc022a5-242a-440c-9a08-d44270aaa9d8"; // Completed
// Dedicated, stable Completed+Paid+Unrated order for the matrix's Rate Teacher surface -
// Final Acceptance Gate pass. Never submit a rating against this order; doing so would collapse
// it back to the Order Timeline modal for every subsequent matrix cell (see the history note in
// docs/testing/BROWSER_CERTIFICATION.md on the Order-Timeline-vs-Rate-Teacher mislabeling this
// fixture exists specifically to prevent).
export const RATE_READY_ORDER_ID = "255f5c11-460f-4cc6-9310-a0ffde6699b7";

// role: null = public/unauthenticated. url: relative to /app/.
export const SURFACES = [
  { id: "landing", label: "Landing", role: null, url: "Tafseel-Landing.dc.html" },
  { id: "browse", label: "Browse Teachers", role: null, url: "Tafseel-Browse-Teachers.dc.html" },
  { id: "teacher-profile", label: "Teacher Profile", role: null, url: `Tafseel-Teacher-Profile.dc.html?id=${TEACHER_ID}` },
  { id: "request-wizard", label: "Request Wizard", role: "Student", url: `Tafseel-Request.dc.html?teacherId=${TEACHER_ID}&serviceId=${SERVICE_ID}` },
  { id: "payment", label: "Payment", role: "Student", url: `Tafseel-Payment.dc.html?orderId=${DELIVERED_ORDER_ID}` },
  { id: "student-active-order", label: "Student Dashboard - Active Order", role: "Student", url: "Tafseel-Student-Dashboard.dc.html?section=orders" },
  { id: "student-completed-order", label: "Student Dashboard - Completed Order", role: "Student", url: "Tafseel-Student-Dashboard.dc.html?section=orders&filter=completed" },
  { id: "review-modal", label: "Review Delivery Modal", role: "Student", url: `Tafseel-Student-Dashboard.dc.html?orderId=${DELIVERED_ORDER_ID}&focus=review`, isModal: true },
  { id: "rate-modal", label: "Rate Teacher Modal", role: "Student", url: `Tafseel-Student-Dashboard.dc.html?orderId=${RATE_READY_ORDER_ID}&focus=rate`, isModal: true, requiresRatingForm: true },
  { id: "teacher-qualifications", label: "Teacher Dashboard - My Qualifications", role: "Teacher", url: "Tafseel-Teacher-Dashboard.dc.html?section=qualifications" },
  { id: "teacher-videos", label: "Teacher Dashboard - Profile Videos", role: "Teacher", url: "Tafseel-Teacher-Dashboard.dc.html?section=samples" },
  { id: "teacher-orders", label: "Teacher Dashboard - Requests / Orders", role: "Teacher", url: "Tafseel-Teacher-Dashboard.dc.html" },
  { id: "quality-applications", label: "Quality Dashboard - Applications", role: "QualityReviewer", url: "Tafseel-Quality-Dashboard.dc.html?section=applications" },
  { id: "quality-media", label: "Quality Dashboard - Media Review", role: "QualityReviewer", url: "Tafseel-Quality-Dashboard.dc.html?section=showcases" },
  { id: "admin-catalog", label: "Admin Dashboard - Service Catalog", role: "Admin", url: "Tafseel-Admin-Dashboard.dc.html" },
  { id: "auth", label: "Auth", role: null, url: "Tafseel-Auth.dc.html" }
];

export const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 }
];

export const MODES = [
  { lang: "ar", theme: "dark" },
  { lang: "ar", theme: "light" },
  { lang: "en", theme: "dark" },
  { lang: "en", theme: "light" }
];

export function fullUrl(surface) {
  return `${BASE_URL}/app/${surface.url}`;
}
