# Payment Flow

```mermaid
sequenceDiagram
    participant S as Student
    participant API as Tafseel API
    participant P as Payment Provider
    participant DB as SQL Server
    S->>API: Initiate Order payment + Idempotency-Key
    API->>P: Create provider payment
    API->>DB: Persist pending Payment and attempt
    P->>API: Signed webhook
    API->>API: Verify exact payload signature
    API->>DB: Payment confirmed + Order paid + escrow hold + ledger transfer
    S->>API: Approve delivered Order
    API->>DB: Complete Order + release escrow atomically
```

Payment success is accepted only from a verified provider callback. The Student total, fee, commission, Teacher net, and currency come from the immutable Order snapshot.

The Development/Test `MockPaymentProvider` uses an HMAC secret from User Secrets. It is rejected in Production. No card data is accepted or stored.

Automatic completion and escrow release are disabled. Full refunds are allowed only before release; post-release outcomes require a dispute decision.
