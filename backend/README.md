# Farlands Hackathon Backend

This directory encapsulates the entire backend infrastructure, business logic, security modules, database migrations, tests, and documentation for the Farlands Hackathon registration, team management, and payment verification system.

## Directory Structure

- **`lib/`**: Core backend business logic and services
  - `admin.ts`: Admin authorization and JSON helpers
  - `audit.ts`: Auditing and audit-log sanitization
  - `auth.ts`: Authentication, session verification, and PostgREST sanitization
  - `edge-limiter.ts`: Edge-compatible sliding-window rate limiter
  - `env.ts`: Environment variable schemas and validation (Zod)
  - `http.ts`: Standard HTTP responses, status codes, and opaque error masking
  - `manual-payment.ts`: Magic-byte screenshot inspection (PNG, JPEG, WebP) and MIME normalization
  - `rate-limit.ts`: Distributed PostgreSQL-backed rate limiter
  - `security.ts`: Timing-safe comparison, HMAC verification, and audit scrubbing
  - `session.ts`: Secure HttpOnly session cookie handling
  - `team-id.ts`: Unambiguous CSPRNG Team ID generation (`FL26-XXXXXX`)
  - `validation.ts`: Zod schemas for registrations, payments, and admin actions
  - `supabase/`: Database clients (service role admin, server bearer, client anon)
- **`database/migrations/`**: Production SQL migrations
  - `001_registration_system_schema.sql`: Standalone schema for new Supabase project
  - `016_manual_upi_payment_proofs.sql`: Manual payment proofs and verification RPCs
  - `017_team_id_and_admin_management.sql`: Team IDs and admin management schema
- **`docs/`**: Comprehensive specifications
  - `BACKEND_API.md`: Complete API specification with request/response examples
  - `DATABASE.md`: Relational database schema, tables, and constraints
  - `SECURITY.md`: Security architecture, threat model, and defense-in-depth measures
- **`tests/`**: Automated test suite (41+ tests)
  - `team-id.test.ts`: Team ID generator and collision resistance
  - `validation.test.ts`: Input validation schemas
  - `rate-limit.test.ts`: Sliding-window limiter and IP resolution
  - `manual-payment.test.ts`: Binary magic-byte detection and MIME normalization
  - `security-authorization.test.ts`: Audit sanitization and PostgREST injection protection
  - `api-authorization.test.ts`: Fast-reject auth guards
  - `live-integration.test.ts`: Supabase connectivity, RPCs, and bucket checks
- **`index.ts`**: Unified export module for backend services and schemas
