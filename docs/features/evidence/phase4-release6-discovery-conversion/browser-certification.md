# Browser certification

`tests/browser/release6-discovery-cert.mjs` passed 16/16 against the isolated published server. It covered three responsive locale/theme modes, server filter/sort query propagation, URL state, zero recovery, contextual cards, Compare, Profile continuity and conversion surface. The accepted run had zero unexpected 429, pageerror, failed first-party resource, actionable console error or visible template leak. Guest `/auth/me` 401 is expected session probing and explicitly excluded.

The in-app browser independently inspected Profile and the 390px Browse/Compare UI. Authenticated Favorites and populated live conversion were not run because credentials/live fixtures were unavailable.
