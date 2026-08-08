# Parser-Sensitive Attribute Audit — Browser Certification

Audited every `.dc.html` file for interpolated attributes a browser parser might parse
eagerly (before JavaScript mounts) even without a network fetch — SVG `d`, `points`,
`transform`, `viewBox`, geometry attributes (`cx`/`cy`/`r`/`rx`/`ry`/`x1`/`y1`/`x2`/`y2`),
and generic `style`/`value` bindings, per Part 9's explicit list.

## Method

```
grep -oE '[[:space:]](d|points|transform|viewBox|cx|cy|r|rx|ry|x1|y1|x2|y2|dx|dy)="\{\{[^}]*\}\}"' Tafseel-*.dc.html
```
(strict attribute-boundary match — an earlier looser regex produced false positives by
matching the tail of `disabled=`/`placeholder=` as `d=`/`r=`; corrected before drawing
conclusions.)

## Classification

| Pattern | Occurrences found | Classification |
|---|---|---|
| SVG geometry (`d`, `points`, `cx`/`cy`/`r`/etc.) | 1 (`Tafseel-Teacher-Profile.dc.html` service icon `path d`) | **PROVEN ERROR** — fixed this pass (see `console-errors.md`) |
| `style="{{ x }}"` | dozens, all files | **SAFE** — invalid/incomplete CSS text is silently ignored by the browser's style parser (no console error, no visible break); this is the existing, long-standing convention throughout the codebase and was not observed to produce any console error across the full 384-cell matrix or the manual screenshot review |
| `value="{{ x }}"` on form controls | hundreds, all files | **SAFE** — React's controlled-component value sync overwrites this on mount; no browser-level parse error class exists for `value` |

## Result

Exactly one PROVEN ERROR existed in the entire codebase, and it has been fixed (Rule 3
added to the regression gate, negative-control test passed — see `f013-retention.md`).
No further occurrences of any parser-sensitive pattern were found. No mechanical,
blanket rewrite of every interpolated attribute was performed, per the prompt's explicit
instruction not to do so.
