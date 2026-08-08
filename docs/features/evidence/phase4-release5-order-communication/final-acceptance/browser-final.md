# Browser final

Surfaces exercised: Student/Teacher inbox+conversation (AR RTL Dark + EN LTR Light × 390/768/1440), live send, attachment, notification deep link, unread API, completed CTA, mobile composers.

Matrix i18n/dir/overflow/template-leak: PASS. Matrix `console.error`: some **429** cells (Test Issue). `templateRequests` empty — no `%7B%7B` / `{{` first-party fetch.

Live functional runner: **15/16** (`completed-open` remount timeout). Realtime 2/2 + dedup 2/2 + composers 4/4.
