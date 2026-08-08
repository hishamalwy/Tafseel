# Browser certification

- Browser harness self-test: 5/5 passed.
- In-app browser: 390×844, 768×900, and 1440×900 had no horizontal overflow.
- Arabic at 390×844 resolved `lang=ar`, `dir=rtl`, localized title, and no overflow.
- No browser error-level logs occurred. Existing dashboard placeholder warnings appeared during unauthenticated redirect.
- Authenticated Order thread, 375px composer geometry, attachment upload, notification click, and two-context realtime could not run because UAT passwords were not supplied.

Result: conditional/partial browser evidence; this is the main reason the release is not declared Verified.
