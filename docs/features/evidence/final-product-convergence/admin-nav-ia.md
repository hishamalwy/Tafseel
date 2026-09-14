# Admin navigation IA — blocker closure

## Before

Flat list (~17 equal-weight destinations) with Unicode dingbat icons.

## Final groups

| Group | Destinations |
|---|---|
| Overview | Dashboard overview |
| Marketplace | Teachers, Students, Reviewers, Subjects, Topics, Qualification Assignments, Services, Users |
| Operations | Requests, Sessions, Reviews, Disputes |
| Finance | Payments, Withdrawals, Coupons |
| Intelligence | Marketplace Intelligence (reports) |
| Configuration | Settings |

## Design

Same shared `.tf-dash-nav*` system as Teacher. Marketplace Intelligence remains a top-level group for discoverability.

## Preserved rules

- Notifications not in sidebar
- Application review queue stays on Quality dashboard (not Admin nav)
- Route keys / `navigateTo` behavior unchanged
