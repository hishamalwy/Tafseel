# System events

System rows are a presentation projection, not Message rows. They come from the existing Order timeline (`OrderStatusHistory`, payment confirmation/refund timestamps, deliveries, and revision records) plus `LearningRequest.CreatedAt`. The UI distinguishes them from user bubbles and never assigns a fake avatar/sender.

The client cannot submit a message type; `SendMessage` accepts body only. F-005 remains unchanged: revision events expose sequence only and do not invent a DeliveryId.
