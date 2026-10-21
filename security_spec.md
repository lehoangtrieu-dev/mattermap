# Security Specification & Threat Model for MatterMap Trips

## 1. Data Invariants
1. **User Identity Boundary**: A trip document in `/users/{userId}/trips/{tripId}` can ONLY be created, read, updated, or deleted by the authenticated user whose `request.auth.uid == userId`.
2. **Email Verification**: Writes require `request.auth.token.email_verified == true`.
3. **Payload Immutability**: The `userId` field must match `request.auth.uid` and cannot be altered during updates (`incoming().userId == existing().userId`).
4. **Temporal Integrity**: `createdAt` must be server-timestamped (`request.time`) on create and immutable on update. `updatedAt` must be set to `request.time`.
5. **Denial-of-Wallet & Schema Bounds**: `destinationName` <= 200 chars, `daysCount` <= 30, `days` array bounded.

## 2. The Dirty Dozen Payloads & Invariant Tests
1. **Unauthenticated Read**: Anonymous/unauthenticated query on `/users/{userId}/trips` -> `PERMISSION_DENIED`.
2. **Cross-User Snooping**: User A attempts `get` or `list` on `/users/userB/trips/trip1` -> `PERMISSION_DENIED`.
3. **Identity Spoofing**: User A attempts to write a trip with `userId = 'userB'` under `/users/userA/trips/trip1` -> `PERMISSION_DENIED`.
4. **Path Variable Mismatch**: User A writes to `/users/userB/trips/trip1` with matching body `userId = 'userB'` -> `PERMISSION_DENIED`.
5. **Unverified Email Write**: User with `email_verified == false` attempts create -> `PERMISSION_DENIED`.
6. **Ghost Key Injection**: Payload contains unauthorized fields like `isAdmin: true` or `shadowField: 'xyz'` -> `PERMISSION_DENIED`.
7. **Created-At Tampering**: Update request tries to rewrite `createdAt` to arbitrary past timestamp -> `PERMISSION_DENIED`.
8. **Client Timestamp Forgery**: `createdAt` or `updatedAt` provided as arbitrary client string rather than `request.time` -> `PERMISSION_DENIED`.
9. **Oversized String Bomb**: `destinationName` exceeds 200 chars -> `PERMISSION_DENIED`.
10. **Negative/Extreme Days**: `daysCount` < 1 or > 30 -> `PERMISSION_DENIED`.
11. **Malicious ID Injection**: Path ID `{tripId}` contains invalid punctuation or exceeds 128 characters -> `PERMISSION_DENIED`.
12. **Foreign User Delete**: User A attempts to delete `/users/userB/trips/trip1` -> `PERMISSION_DENIED`.
