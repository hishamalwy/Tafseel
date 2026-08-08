# Authorization E2E

Live Dev `:5090` against `/api/v1/admin/marketplace-intelligence`:

| Role | Status |
|---|---|
| Admin `qa.admin.sprint02@example.com` | 200 |
| Student `student.sprint02.uat@example.com` | 403 |
| Teacher `teacher.sprint02.uat@example.com` | 403 |
| Quality `qa.reviewer.sprint02@example.com` | 403 |
| Anonymous (publish smoke `:5092`) | 401 |

DTO scan: no email/phone/password/accessToken/request description. Isolated publish repeated Admin 200 + anon 401.
