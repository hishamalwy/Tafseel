# Metric catalog

| Metric | Purpose | Numerator / source | Denominator | Time | Null | Class |
|---|---|---|---|---|---|---|
| Browse views | Discovery interest | `browse_viewed` | none | server event UTC | N/A before coverage | Internal |
| Teacher opens | Profile interest | `teacher_opened` | Browse views for rate | server event UTC | N/A if denominator 0 | Internal |
| Service selections | Offer interest | `service_selected` | Teacher opens | server event UTC | N/A if denominator 0 | Internal |
| Request starts | Guided intent | `request_started` | Teacher opens | server event UTC | N/A if denominator 0 | Internal |
| Request submissions | Persisted demand | `LearningRequest.CreatedAt` | Request starts | record UTC | N/A if denominator 0 | Internal |
| Accepted requests | Commercial relationship | `Order.CreatedAt` | submissions | record UTC | N/A if denominator 0 | Internal |
| Payment starts | Checkout intent | `Payment.CreatedAt`, async Order | accepted | record UTC | N/A if denominator 0 | Internal |
| Paid orders | Confirmed payment | `Payment.Status=Confirmed`, `ConfirmedAt` | payment starts | confirmation UTC | N/A if denominator 0 | Internal |
| Deliveries | Persisted delivery | `OrderDelivery.CreatedAt` | paid | record UTC | N/A if denominator 0 | Internal |
| Completed orders | Completed transition | `OrderStatusHistory.NextStatus=Completed` | paid | transition UTC | N/A if denominator 0 | Internal |
| Reviews | Eligible persisted review | `TeacherReview.CreatedAt` | completed | record UTC | N/A if denominator 0 | Internal |
| Zero-result rate | Unmet discovery state | `zero_result_viewed / browse_viewed` | Browse views | event UTC | N/A if 0/no coverage | Internal |
| Eligible teachers | Current supply | distinct Teacher with active approved unrevoked qualification and active offer | none | query-time snapshot | 0 | Internal |
| Active offers | Current supply | active, unsuperseded TeacherService with active Subject/catalog and active qualification | none | query-time snapshot | 0 | Internal |

Filters are server-side date `[from,to)`, Subject ID, and ServiceCatalogItem ID. Subject names use stable IDs plus current localized names. Historical service attribution prefers immutable request/order ServiceCatalogItem snapshots; Subject uses the referenced TeacherService stable ID.
