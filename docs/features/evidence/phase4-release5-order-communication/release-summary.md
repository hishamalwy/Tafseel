# Release summary

Implemented canonical Order entry points, selected-thread generic inbox behavior, contextual header/files/timeline, message attachments, persisted unread badges, deep-link opening, contextual privacy-safe notifications, deterministic realtime de-duplication, and bounded history loading.

Verification: isolated Release build and publish passed; health and six static surfaces returned 200; Architecture 1/1, Domain 89/89, Application 5/5, focused SQL 4/4, frontend/localization/template/auth/guided-request/notification/browser-self-test gates passed. EF reports no pending model changes. Full integration compiled/runs only when the concurrent Release 4 WIP source is excluded: 208/215 passed; seven unrelated migration-path/showcase failures remain.

Verdict: **RELEASE 5 — ORDER COMMUNICATION PARTIALLY COMPLETED** pending authenticated Playwright/mobile/realtime certification and a clean full regression after Release 4 stabilizes.
