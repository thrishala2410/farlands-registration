# Farlands Hackathon: Database Schema & Entity Relationships

This document details the normalized PostgreSQL database schema for the dedicated Hackathon Registration and Payment Verification system.

---

## 1. Entity-Relationship Model

```
       +--------------------+
       |       teams        |
       +--------------------+
       | id (UUID, PK)      |
       | team_id (TEXT, UQ) |<----------+
       | team_name (TEXT)   |           |
       | status (TEXT)      |           |
       +---------+----------+           |
                 | 1                    | 1
                 |                      |
                 | N                    | 1
       +---------v----------+  +--------+-----------+
       |    participants    |  |   registrations    |
       +--------------------+  +--------------------+
       | id (UUID, PK)      |  | id (UUID, PK)      |
       | participant_id(UQ) |  | team_id (UUID, FK) |
       | name, email, phone |  | reg_number (UQ)    |
       | college, year      |  | status (ENUM)      |
       | team_id (UUID, FK) |  | fee_amount (INT)   |
       | auth_user_id (UQ)  |  +---------+----------+
       +---------+----------+            | 1
                 | 1                     |
                 | 1                     | N
       +---------v----------+  +---------v----------+
       |   auth_profiles    |  |   payment_proofs   |
       +--------------------+  +--------------------+
       | user_id (UUID, PK) |  | id (UUID, PK)      |
       | role (ENUM)        |  | registration_id(FK)|
       | participant_id(FK) |  | utr (TEXT, UQ)     |
       | username (TEXT)    |  | amount (INT)       |
       +--------------------+  | status (ENUM)      |
                               | screenshot_path    |
                               +--------------------+
```

---

## 2. Table Specifications

### 2.1 `teams`
Represents participating teams.
- `id`: `UUID` (Primary Key, default `gen_random_uuid()`).
- `team_id`: `TEXT` (Unique, Not Null). Public unpredictable identifier (e.g. `FL26-7K4P9X`).
- `team_name`: `TEXT` (Not Null, check length between 3 and 50). Case-insensitive unique index.
- `status`: `TEXT` (`'active'` | `'disabled'`). Defaults to `'active'`.
- `created_at`, `updated_at`: `TIMESTAMPTZ`.

### 2.2 `participants`
Represents student participants belonging to a team.
- `id`: `UUID` (Primary Key).
- `participant_id`: `TEXT` (Unique, format `P-XXXXXXXXXXXX`).
- `name`: `TEXT` (Not Null, 2–100 chars).
- `email`: `TEXT` (Not Null, unique case-insensitive).
- `phone`: `TEXT` (Optional, validated format `^\+?[0-9]{10,15}$`).
- `college`: `TEXT` (Optional).
- `course`: `TEXT` (Optional).
- `year`: `TEXT` (Optional).
- `team_id`: `UUID` (Foreign Key -> `teams(id)` on delete set null).
- `status`: `participant_status` (`'active'` | `'disabled'`).
- `is_checked_in`: `BOOLEAN` (Default `false`).
- `auth_user_id`: `UUID` (Unique Foreign Key -> `auth.users(id)`).
- `created_at`, `updated_at`: `TIMESTAMPTZ`.

### 2.3 `auth_profiles`
Maintains server-enforced role assignments for Supabase Auth accounts.
- `user_id`: `UUID` (Primary Key -> `auth.users(id)`).
- `role`: `TEXT` (`'participant'` | `'admin'`).
- `participant_id`: `UUID` (Unique -> `participants(id)`). Required when role is `'participant'`.
- `username`: `TEXT` (Unique). Required when role is `'admin'`.
- `created_at`: `TIMESTAMPTZ`.

### 2.4 `registrations`
Tracks the formal entry and payment requirement of a team.
- `id`: `UUID` (Primary Key).
- `team_id`: `UUID` (Unique Foreign Key -> `teams(id)` on delete restrict).
- `registration_number`: `TEXT` (Unique, format `REG-2026-FL26-XXXXXX-XXXX`).
- `status`: `registration_status` (`'pending_payment'` | `'payment_processing'` | `'confirmed'`).
- `fee_amount`: `INTEGER` (in paise, default `100000` = ₹1,000).
- `currency`: `TEXT` (`'INR'`).
- `confirmed_at`: `TIMESTAMPTZ` (Populated upon admin verification).
- `created_at`, `updated_at`: `TIMESTAMPTZ`.

### 2.5 `payment_proofs`
Stores manual UPI payment transaction references and screenshot paths.
- `id`: `UUID` (Primary Key).
- `registration_id`: `UUID` (Foreign Key -> `registrations(id)`).
- `team_id`: `UUID` (Foreign Key -> `teams(id)`).
- `submitted_by`: `UUID` (Foreign Key -> `participants(id)`).
- `utr`: `TEXT` (Unique, 6–64 alphanumeric characters).
- `amount`: `INTEGER` (Must match registration fee).
- `currency`: `TEXT` (`'INR'`).
- `screenshot_path`: `TEXT` (Relative path in private storage: `{team_id}/{uuid}.{ext}`).
- `status`: `manual_payment_proof_status` (`'pending_verification'` | `'paid'` | `'payment_failed'`).
- `rejection_reason`: `TEXT` (Required when status is `'payment_failed'`).
- `reviewed_by`: `UUID` (Foreign Key -> `auth.users(id)`).
- `reviewed_at`: `TIMESTAMPTZ`.
- `created_at`, `updated_at`: `TIMESTAMPTZ`.

### 2.6 `audit_logs`
Append-only log of security and administrative operations.
- `id`: `UUID` (Primary Key).
- `action`: `TEXT` (e.g. `'registration.created'`, `'payment.proof_verified'`).
- `actor_role`: `TEXT` (`'participant'` | `'admin'` | `'system'`).
- `actor_id`: `UUID` (ID of the actor).
- `registration_id`: `UUID` (Optional).
- `payment_proof_id`: `UUID` (Optional).
- `metadata`: `JSONB` (Sanitized structured event payload).
- `created_at`: `TIMESTAMPTZ`.

### 2.7 `payment_rate_limits`
Distributed rate-limit counters shared by serverless functions.
- `subject_hash`: `TEXT` (SHA-256 hash of IP or User ID).
- `action`: `TEXT` (e.g. `'public-registration'`, `'payment-proof-submission'`).
- `window_started_at`: `TIMESTAMPTZ`.
- `request_count`: `INTEGER`.
- Primary Key: `(subject_hash, action)`.

---

## 3. Database Functions & Triggers

- `submit_manual_payment_proof(p_registration_id, p_participant_id, p_utr, p_screenshot_path)`: Atomic transaction ensuring participant team ownership, duplicate UTR prevention, and registration status advancement.
- `review_manual_payment_proof(p_proof_id, p_admin_user_id, p_approve, p_reason)`: Atomic approval or rejection of payment proof, advancing registration status and writing audit log.
- `take_payment_rate_limit(p_subject, p_action, p_limit, p_window_seconds)`: Atomic counter increment and sliding window reset.
