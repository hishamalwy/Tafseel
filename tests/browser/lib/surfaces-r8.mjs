import { BASE_URL } from "./auth.mjs";

// Release 8 entry points: 16 surfaces × 6 viewports × 4 modes = 384.
// Uses legitimate UAT fixtures; Compare opens via Browse deep-link tray when needed.
export const TEACHER_ID = "c6f1d8af-ffb2-4cae-9dd7-73047f999c53";
export const SERVICE_ID = "f0b6f5da-3384-4096-a636-58fe0c1d49b3";
export const DELIVERED_ORDER_ID = "8f4745ef-e1b8-42fb-988a-fdc899af066a";

export const SURFACES = [
  { id: "landing", label: "Landing", role: null, url: "Tafseel-Landing.dc.html" },
  { id: "browse", label: "Browse Teachers", role: null, url: "Tafseel-Browse-Teachers.dc.html" },
  { id: "teacher-profile", label: "Teacher Profile", role: null, url: `Tafseel-Teacher-Profile.dc.html?id=${TEACHER_ID}` },
  { id: "compare", label: "Teacher Compare", role: null, url: `Tafseel-Browse-Teachers.dc.html?compare=${TEACHER_ID}` },
  { id: "guided-request", label: "Guided Request", role: "Student", url: `Tafseel-Request.dc.html?teacherId=${TEACHER_ID}&serviceId=${SERVICE_ID}` },
  { id: "student-dashboard", label: "Student Dashboard", role: "Student", url: "Tafseel-Student-Dashboard.dc.html" },
  { id: "teacher-dashboard", label: "Teacher Dashboard", role: "Teacher", url: "Tafseel-Teacher-Dashboard.dc.html" },
  { id: "payment", label: "Payment", role: "Student", url: `Tafseel-Payment.dc.html?orderId=${DELIVERED_ORDER_ID}` },
  { id: "messages", label: "Order Communication", role: "Student", url: "Tafseel-Student-Dashboard.dc.html?section=messages" },
  { id: "live-booking", label: "Live Session Booking", role: "Student", url: `Tafseel-Book-Session.dc.html?teacherId=${TEACHER_ID}&serviceId=${SERVICE_ID}` },
  { id: "auth", label: "Auth", role: null, url: "Tafseel-Auth.dc.html" },
  { id: "teacher-apply", label: "Teacher Apply", role: null, url: "Tafseel-Teacher-Apply.dc.html" },
  { id: "quality", label: "Quality Dashboard", role: "QualityReviewer", url: "Tafseel-Quality-Dashboard.dc.html" },
  { id: "admin", label: "Admin Dashboard", role: "Admin", url: "Tafseel-Admin-Dashboard.dc.html" },
  { id: "admin-catalog", label: "Admin Service Catalog", role: "Admin", url: "Tafseel-Admin-Dashboard.dc.html?section=catalog" },
  { id: "admin-intelligence", label: "Admin Marketplace Intelligence", role: "Admin", url: "Tafseel-Admin-Dashboard.dc.html?section=intelligence" }
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
