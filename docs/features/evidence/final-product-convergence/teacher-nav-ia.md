# Teacher navigation IA — blocker closure

## Before

Flat list (~14 equal-weight destinations) with Unicode dingbat icons.

## Final groups

| Group | Destinations |
|---|---|
| Overview | Overview |
| Work | New Requests, Active Orders, Live Sessions, Messages |
| Marketplace | Services, Qualifications, Teaching Samples, Availability |
| Business | Reviews, Earnings, Withdrawals |
| Account | Profile, Settings |

## Design

- Group labels: `.tf-dash-nav-group-label` (small uppercase muted)
- Items: `.tf-dash-nav-item` with inset active indicator + SVG `.tf-dash-nav-ico`
- Icons: shared `Tafseel.dashNavIconPath(key)` stroke set (24 viewBox)
- Notifications remain header-only (not in sidebar)
- Routes / section keys unchanged

## Priority preserved

Work group surfaces high-frequency action destinations first (requests, orders, sessions, messages).
