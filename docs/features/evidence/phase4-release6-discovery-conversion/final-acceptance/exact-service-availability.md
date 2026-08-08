# Exact-service availability

Profile fetches availability only for the selected TeacherService when that service requires scheduling / is a bookable live offer (`availabilityServiceId = preferredRequest.id`, else omitted).

Booking CTA requires `availabilitySummary.teacherServiceId === bookService.id` plus a bookable summary state. There is no `bookService` fallback to a different live service.

API fixture: `summaryTeacherServiceId === teacherServiceId`, `bookable: true`.  
Browser: `09-exact-service-availability` PASS.

No-availability remains truthful: missing/mismatched summary does not invent a Book CTA. Cross-service availability fallback is absent by construction. Payment was not completed.
