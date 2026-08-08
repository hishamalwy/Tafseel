# Browse query contract

`GET /api/v1/teachers` accepts bounded Search, SubjectId, ServiceTypeId, TopicId, EducationLevelId, MinimumRating, MaximumPrice, repeated LanguageIds, VerifiedOnly, supported Sort, Page and PageSize. Browse requests page size 9 and renders the returned page; it no longer fetches 100 rows or sorts/filters/paginates them locally.

`contextOffer` is deterministic and describes the exact eligible TeacherService used for filtering, sorting, price and conversion.
