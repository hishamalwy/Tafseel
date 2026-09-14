# Admin i18n audit — blocker closure

Date: 2026-08-09
Scope: `Tafseel-Admin-Dashboard.dc.html` product chrome
Method: source inventory → locale key wiring → `Tafseel.t` / `data-i18n` → AR visual review (pending matrix)

## Classification legend

- **chrome** — product UI labels (must localize)
- **data** — user/content values (do not translate)
- **tech** — codes, schema names, currency codes (preserve)

## Sweep actions (high impact)

| string | file | class | action | locale key | status |
|---|---|---|---|---|---|
| Users | Admin dashboard | chrome | wired `{{ usersHeading }}` | `admin_users_heading` | done |
| Search users / placeholder | Admin | chrome | wired | `admin_search_users`, `admin_search_name_email` | done |
| All roles / Students / Teachers / Reviewers | Admin | chrome | wired | `admin_all_roles`, `admin_nav_*` | done |
| N selected / Suspend / Activate / Clear | Admin | chrome | wired | `admin_users_selected`, `admin_suspend/activate/clear` | done |
| Name/Role/Joined/Status/Actions | Admin | chrome | wired | `admin_col_*` | done |
| Showing X of Y users | Admin | chrome | wired | `admin_users_showing` | done |
| Payments & withdrawals / Open disputes | Admin | chrome | wired | `admin_payments_title`, `admin_open_disputes_heading` | done |
| Resources / Edit / Active | Admin catalog | chrome | wired | `admin_resources`, `common_edit`, `admin_service_active` | done |
| Platform settings / commission / quality / maintenance | Admin settings | chrome | wired | `admin_platform_*` / related | done |
| Email | Admin settings | chrome | wired | `admin_email` | done |
| Catalog modal titles Add subject/topic/service/coupon | Admin RV | chrome | `Tafseel.t` | `admin_modal_add_*` | done |
| Subject / Choose subject / Difficulty options | Admin modal | chrome | wired | `admin_nav_subjects`, `admin_choose_subject`, `admin_difficulty_*` | done |
| Assignment resources modal chrome | Admin | chrome | wired | `admin_assignment_resources`, `admin_resource_*`, `common_close` | done |
| Intelligence surface (was `intelText`) | Admin | chrome | converted to `Tafseel.t` | `admin_intel_*` | done |
| Admin sidebar badge / nav aria / doc title | Admin shell | chrome | wired | `admin_role_badge`, `admin_nav_aria`, `admin_doc_title` | done |
| Open (reviews ops) | Admin | chrome | `data-i18n` | `admin_reviews_ops_open` | done (runtime translate) |
| Hide / Restore review | Admin | chrome | already `Tafseel.t` | `admin_review_hide` / restore | preserved |
| Approve / Reject withdrawal | Admin | chrome | already `Tafseel.t` + confirm | `admin_approve/reject` | preserved |
| User names / emails / review text | Admin | data | leave | — | intentional |
| LearningRequest.CreatedAt etc. | Intel formulas | tech | leave | — | intentional |
| SAR unit suffix in price inputs | Catalog | tech | leave code | — | intentional |
| AD initials | Header | tech | leave | — | intentional |

## Remaining English (classified)

- Technical formula strings in Intelligence KPI footnotes (`Payment.ConfirmedAt`, …)
- Currency code `SAR` in commercial policy inputs
- Role filter **values** (`Student`/`Teacher`/`Reviewer`) — identity codes for filtering
- User-generated content and proper names

## EN parity

EN Admin remains driven by the same locale keys; no EN-only hardcodes introduced for chrome.
