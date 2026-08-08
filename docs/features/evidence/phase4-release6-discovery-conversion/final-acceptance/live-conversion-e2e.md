# Live conversion E2E

Accepted browser path:

1. Browse with live Subject + live catalog service — teacher card visible (`06-live-teacher-on-browse`)
2. Profile selects exact live TeacherService; primary CTA is Book Session with that id (`07-live-profile-exact-service`)
3. Book Session route keeps `teacherId` + `teacherServiceId` (`08-live-book-session-routing`)
4. Scheduler UI listed slots; API reported 157 slots (`scheduler-context-slots`)

Screenshot: `screenshots/live-profile-conversion.png`. Payment not driven (not required for this closure).
