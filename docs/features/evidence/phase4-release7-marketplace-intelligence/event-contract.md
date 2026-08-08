# Event contract

Allowed names: `browse_viewed`, `teacher_opened`, `service_selected`, `compare_opened`, `request_started`, `zero_result_viewed`. Controlled surfaces: Landing, Browse, TeacherProfile, Compare, GuidedRequest, StudentDashboard, TeacherDashboard, LiveScheduler. Fields are server UTC, client event ID, first-party session/internal user ID, optional canonical dimensions, bounded result count, and three safe filter-presence booleans. No arbitrary metadata exists.
