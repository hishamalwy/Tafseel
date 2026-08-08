# Responsive retention

Targeted accepted coverage:

| Viewport / mode | Result |
|---|---|
| 390 AR/RTL dark Browse | `14-ar-rtl-discovery` PASS — lang=ar, dir=rtl, no overflow, H1=1, no template leak |
| 1440 EN/LTR light Browse | `15-en-ltr-discovery` PASS |
| 375×667 Profile CTA | `16-375-profile-cta` PASS — overflow false, tapSafe true, CTA visible, bar `pointer-events:none`, clearance `116.03125px` |

Prior 390/768/1440 visual evidence from the first R6 pass remains under `../browser/screenshots/`.

375 first-paint: identity Save/Share/Message sit above the fixed Book bar after Sprint 2.1 clearance is actually consumed as negative margin; action row is `max-content` so Message does not land under the Book link. Visual identity-card/video overlap from the pull-up is a known tradeoff, not a 10/10 polish claim.
