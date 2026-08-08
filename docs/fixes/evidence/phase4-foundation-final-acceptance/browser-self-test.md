# Browser Harness Self-Test — Final Acceptance Gate

Re-run after all this pass's fixes: `node tests/browser/self-test.mjs`.

```
PASS harness-detects-overflowX :: overflow=true
PASS harness-detects-console-error :: count=1
PASS harness-detects-network-template-leak :: count=1
PASS harness-detects-wrong-dir :: dir=ltr expected=rtl
PASS harness-detects-missing-modal :: dialogPresent=false

SELF_TEST_PASS (5/5)
```

No new self-test was added this pass — the prompt's Part 13 preference for a
"surface-specific identifying assertion" over an arbitrary CSS coupling was instead
implemented directly inside the matrix harness itself (`run-matrix.mjs`'s
`ratingCriteriaCount` check, counting the 5 canonical `.../5` score markers unique to
the real Rate Teacher form), rather than as a sixth isolated self-test — this is the
semantic/form-marker approach the prompt explicitly preferred, applied where it
actually matters (distinguishing the real surface during live certification), not
duplicated as a synthetic self-test against fabricated markup.
