# Messaging

Messages belong to a two-participant conversation scoped to a pre-request teacher inquiry, Learning Request, Order, or Live Session. Resource-scoped conversations require both users to match the resource participants. General inquiries require a Student and a published Teacher.

Message history is persisted and paginated before SignalR broadcast. SignalR clients must authenticate and explicitly join a conversation group that is checked against persisted membership. Attachments use authenticated private downloads.
