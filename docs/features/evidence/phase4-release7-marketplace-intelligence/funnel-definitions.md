# Funnel definitions

`browse_viewed → teacher_opened → service_selected → request_started → LearningRequest persisted → Order created → Payment created → Payment confirmed → OrderDelivery persisted → Order Completed transition → TeacherReview persisted`. The first four are minimized interaction signals; all later stages are canonical transactional truth. Count, next-stage difference, prior-stage conversion, and source are returned. Zero denominators return null/N/A.
