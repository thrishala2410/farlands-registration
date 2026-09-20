# Farlands Hackathon: Security Architecture & Controls

This document details the security posture, access controls, rate limiting, and data protection mechanisms implemented in this backend.

---

## 1. Authentication & Role-Based Authorization

1. **Password Security**: Passwords are never stored in plain text or handled by custom hashing algorithms; all participant and admin authentication is delegated to Supabase Auth.
2. **Role Isolation in `auth_profiles`**:
   - `auth_profiles.role` holds the authoritative role (`participant` or `admin`).
   - Normal users cannot alter or assign their own role. RLS on `auth_profiles` prevents client-side updates.
   - Public registration strictly assigns `role: 'participant'`.
3. **Session Management**:
   - Authentication tokens (`farlands-access`, `farlands-refresh`) are issued as `HttpOnly`, `SameSite=Strict`, `Secure` (in production) cookies.
   - JavaScript in the browser cannot read session tokens.
4. **Team Ownership & Session Context**:
   - The backend never trusts a client-supplied `teamId` in request bodies or query parameters for authorization.
   - The user's authenticated `auth_user_id` is looked up in `participants` to derive their authorized `team_id`.
   - Any attempt by Team A to view or submit data for Team B returns `403 Forbidden`.

---

## 2. Team ID Security

- **Identifier vs. Credential**: The Team ID (e.g. `FL26-7K4P9X`) is a public identifier, not a secret password.
- **Generation**: Generated exclusively on the trusted server using Node.js cryptographically secure randomness (`randomBytes`).
- **Collision Resistance**: Rejection of duplicates via database UNIQUE constraint and collision-retry loops.
- **Unambiguous Alphabet**: Excludes confusing visual glyphs (0, O, 1, I, L) to prevent human errors during manual entry.

---

## 3. Defense-in-Depth Middleware & Rate Limiting

1. **Next.js Edge Middleware**:
   - Early fast-rejection: Any request to `/api/admin/*` lacking credentials is immediately rejected with `401 Unauthorized` before invoking the route handler.
   - In-memory sliding window rate limiter at the edge protects endpoints against automated scans and denial of service.
2. **PostgreSQL Distributed Rate Limiter**:
   - Distributed serverless deployments share counters stored in `public.payment_rate_limits` via the `take_payment_rate_limit` RPC function.
3. **Tiers**:
   - `registration`: 10 attempts per hour.
   - `auth`: 10 attempts per 15 minutes.
   - `payment`: 10 attempts per minute.
   - `admin`: 60 requests per minute.

---

## 4. Payment Verification Security

1. **Manual UPI Anti-Fraud Controls**:
   - The frontend cannot mark a payment as confirmed.
   - A newly submitted payment proof is locked in status `pending_verification` until an authenticated administrator reviews it.
2. **File Upload Magic Byte Inspection**:
   - The client-provided MIME type and file extension are untrusted.
   - The server inspects the raw file buffer header magic bytes:
     - PNG: `89 50 4E 47 0D 0A 1A 0A`
     - JPEG: `FF D8 FF`
     - WebP: `52 49 46 46 ... 57 45 42 50`
   - Disguised binaries, shell scripts, or HTML files are rejected with `400 Bad Request`.
   - File size is capped at 5 MB.
3. **Storage Privacy**:
   - Screenshots are uploaded to a private Supabase bucket (`payment-proofs`).
   - Public access to the bucket is disabled.
   - Only 60-second temporary signed URLs (`createSignedUrl`) are generated for authorized viewers.

---

## 5. Data Leakage & Injection Defenses

1. **Audit Metadata Sanitization**:
   - The `sanitizeAuditMetadata` function recursively redacts passwords, tokens, API keys, secret credentials, and card numbers before writing to `audit_logs`.
2. **Wildcard & Injection Protection**:
   - All search queries using ILIKE/LIKE pass through `escapeLikeWildcards` to escape `%` and `_` characters, preventing wildcard Denial of Service or enumeration.
3. **Structured Errors**:
   - Internal database errors (such as connection strings, table details, or stack traces) are caught and mapped to safe client-facing errors (`apiError`).
4. **Timing-Safe Equality**:
   - Token and HMAC comparisons utilize constant-time comparison (`timingSafeEqual`) to mitigate timing attacks.
