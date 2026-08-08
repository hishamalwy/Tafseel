import { readFileSync } from "node:fs";

const browse = readFileSync("Tafseel-Browse-Teachers.dc.html", "utf8");
const profile = readFileSync("Tafseel-Teacher-Profile.dc.html", "utf8");
const contracts = readFileSync("src/Tafseel.Application/Marketplace/MarketplaceContracts.cs", "utf8");
const service = readFileSync("src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs", "utf8");

for (const token of [
  "serviceTypeId", "educationLevelId", "languageIds", "minimumRating",
  "maximumPrice", "verifiedOnly", "pageSize: s.pageSize", "contextOffer",
  "Tafseel.api.get('/services')", "browse_empty_constraints", "TEACHERS_BY_ID",
  "history.replaceState", "this._teacherRequest !== request"
]) if (!browse.includes(token)) throw new Error(`Release 6 Browse contract missing: ${token}`);

for (const forbidden of [
  "pageSize: 100", "filtered()", "Custom explanation', 'Assignment guidance",
  "Best Match", "Recommended", "Trending", "Top Teacher"
]) if (browse.includes(forbidden)) throw new Error(`Release 6 Browse contains unsupported behavior: ${forbidden}`);

for (const token of ["TeacherDiscoveryOfferDto", "ContextOffer"])
  if (!contracts.includes(token)) throw new Error(`Release 6 API projection missing: ${token}`);

for (const token of [
  "catalog.IsPublic && catalog.TeacherSelectable", "q.SubjectId == service.SubjectId",
  "offer.Service.Price <= input.MaximumPrice", "x.User.FullNameEnglish.Contains(term)",
  "offer.Catalog.NameAr.Contains(term)"
]) if (!service.includes(token)) throw new Error(`Release 6 query invariant missing: ${token}`);

for (const token of ["teacherServiceId", "summaryBookable", "browseHref", "availabilityServiceId", "Tafseel.authHref"])
  if (!profile.includes(token)) throw new Error(`Release 6 Profile continuity missing: ${token}`);

const shared = readFileSync("js/tafseel.js", "utf8");
if (!shared.includes("safeAppReturnHref") || !shared.includes("authHref"))
  throw new Error("Release 6 return-URL helpers missing from shared runtime.");
const authApi = readFileSync("js/api.js", "utf8");
if (!authApi.includes("window.Tafseel.authHref"))
  throw new Error("requireSession must reuse the canonical Auth return helper.");

console.log("Release 6 discovery integrity validation passed.");
