# AssetFlow ERD v0

```mermaid
erDiagram
  DEPARTMENT ||--o{ DEPARTMENT : contains
  DEPARTMENT ||--o{ USER : includes
  USER o|--o| DEPARTMENT : heads
  ASSET_CATEGORY ||--o{ ASSET : classifies
  ASSET ||--o{ ALLOCATION : custody
  ASSET ||--o{ TRANSFER_REQUEST : transfers
  ASSET ||--o{ BOOKING : reserves
  ASSET ||--o{ MAINTENANCE_REQUEST : repairs
  AUDIT_CYCLE ||--o{ AUDIT_ASSIGNMENT : assigns
  AUDIT_CYCLE ||--o{ AUDIT_FINDING : records
  ASSET ||--o{ AUDIT_FINDING : verifies
  USER ||--o{ BOOKING : books
  USER ||--o{ MAINTENANCE_REQUEST : raises
  USER ||--o{ NOTIFICATION : receives
  USER ||--o{ ACTIVITY_LOG : acts
```

The canonical fields are defined in `docs/PROJECT_SPEC.md`; migrations are the executable schema source. Polymorphic allocation holders and transfer endpoints are represented using a holder type/identifier or JSON payload until the domain layer finalizes repository mappings.

