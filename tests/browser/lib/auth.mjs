// Development-only UAT credentials. Never print these; never use outside this harness.
// Sourced from Phase 4 Sprint 0.2's additive Development seeding (see DependencyInjection.cs
// SeedDevelopmentAdditionalReviewerAsync) and this run's own live-driven Student/Teacher UAT setup.
export const BASE_URL = process.env.TAFSEEL_BASE_URL || "http://127.0.0.1:5090";

export const CREDENTIALS = {
  Student: { email: process.env.TAFSEEL_UAT_STUDENT_EMAIL || "student.sprint02.uat@example.com", password: process.env.TAFSEEL_UAT_STUDENT_PASSWORD || "" },
  Teacher: { email: process.env.TAFSEEL_UAT_TEACHER_EMAIL || "teacher.sprint02.uat@example.com", password: process.env.TAFSEEL_UAT_TEACHER_PASSWORD || "" },
  QualityReviewer: { email: "qa.reviewer.sprint02@example.com", password: process.env.TAFSEEL_UAT_ADMIN_PASSWORD || "" },
  Admin: { email: "qa.admin.sprint02@example.com", password: process.env.TAFSEEL_UAT_ADMIN_PASSWORD || "" }
};

// Logs in via the real Auth page (legitimate application login, not a forged token) and
// returns the page ready for use. Caller is responsible for closing.
export async function loginAs(context, role, attempt = 1, existingPage = null) {
  const creds = CREDENTIALS[role];
  if (!creds || !creds.password) throw new Error(`No credentials configured for role ${role}`);
  const page = existingPage || await context.newPage();
  const ownsPage = !existingPage;
  try {
    await page.goto(`${BASE_URL}/app/Tafseel-Auth.dc.html`);
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.fill('input[type="email"]', creds.email);
    await page.fill('input[type="password"]', creds.password);
    await page.click('button[type="submit"]');
    await page.waitForFunction(
      () => !location.pathname.includes("Tafseel-Auth"),
      { timeout: 15000 }
    );
    return page;
  } catch (err) {
    if (ownsPage) await page.close();
    // The Development "auth" policy is 10 req/min; back off and retry once on a transient
    // rate-limit/timeout rather than failing the whole harness run over app-level throttling.
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 20000));
      return loginAs(context, role, attempt + 1, existingPage);
    }
    throw err;
  }
}

export async function setThemeAndLang(page, theme, lang) {
  await page.evaluate(({ theme, lang }) => {
    localStorage.setItem("tafseel-theme", theme);
    localStorage.setItem("tafseel-lang", lang);
  }, { theme, lang });
}
