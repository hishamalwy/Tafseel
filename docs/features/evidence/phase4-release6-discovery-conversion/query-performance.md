# Query performance

Browse performs bounded server paging and fixed query work; availability is one batch for at most the visible page. The focused query-count contract permits 1–4 reads independent of result count, preventing per-card N+1 behavior. Compare retains bounded reads and 2–3 IDs. No unbounded Teacher fetch remains in Browse.
