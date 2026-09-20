# Farlands Hackathon: Backend API Specification

This document details the backend endpoints for the Hackathon Registration, Payment Verification, and Admin Management system.

---

## 1. Authentication & Session Model

- **Session Type**: HttpOnly Cookies (`__Host-farlands-access` in production, `farlands-access` in dev) and optional `Authorization: Bearer <token>`.
- **RBAC Roles**:
  - `participant`: Can access payment status, submit proof, view their team's submitted screenshot.
  - `admin`: Full access to admin management, stats, verification, team status toggles.
- **Team ID**: Generated strictly server-side using CSPRNG. Format: `FL26-XXXXXX` (e.g. `FL26-7K4P9X`). Unpredictable, unique, immutable. Serves as the primary public team login identifier alongside team credentials.

---

## 2. Public Endpoints

### 2.1 Team Registration
**`POST /api/registration`**

Creates a new team, provisions Supabase Auth credentials for leader and members, stores participant and registration records with status `pending_payment`, generates the unique Team ID, and logs the leader in via HttpOnly session cookies.

**Request Headers**:
`Content-Type: application/json`

**Request Body Schema** (new frontend format — `teammates[0]` is the team leader):
```json
{
  "teamName": "Code Warriors",
  "teammates": [
    {
      "name": "Alex Mercer",
      "email": "alex@example.com",
      "phone": "+919876543210"
    },
    {
      "name": "Sarah Connor",
      "email": "sarah@example.com",
      "phone": "+919876543211"
    }
  ],
  "submittedAt": "2026-02-10T10:30:00.000Z"
}
```

**Legacy format is still accepted** (`leader`/`members`, with optional `college`/`course`/`year`/`password`); the server normalizes both to the same internal participant model.

**Constraints**:
- `teamName`: 3–50 characters, unique.
- `teammates`: 1 to 4 members (`teammates[0]` is the leader).
- `email`: Valid email format, lowercase, unique across all participants.
- `name`: 2+ characters, required for every teammate.
- `phone`: Optional, format `+?[0-9]{10,15}`.
- `password` (legacy only): Optional (8–128 characters). If omitted, auto-provisions the account using the generated Team ID as default credential.
- `submittedAt`: Optional ISO timestamp.

**Success Response (201 Created)**:
```json
{
  "success": true,
  "team": {
    "id": "fc116fe7-fc9d-474b-a085-2338d9408bcb",
    "teamId": "FL26-7K4P9X",
    "name": "Code Warriors",
    "teamName": "Code Warriors"
  },
  "registration": {
    "id": "72959506-71c2-4374-83ee-69b401d6996c",
    "registrationId": "72959506-71c2-4374-83ee-69b401d6996c",
    "registrationNumber": "FL26-7K4P9X",
    "registration_number": "FL26-7K4P9X",
    "teamId": "FL26-7K4P9X",
    "status": "pending_payment",
    "feeAmount": 120000,
    "currency": "INR"
  },
  "participants": [
    {
      "id": "4b058a80-3b6d-44ca-bbb4-85cd2f242ae6",
      "participantId": "P-4A9CCF26199A",
      "name": "Alex Mercer",
      "email": "alex@example.com"
    }
  ]
}
```

---

### 2.2 Team / Participant / Admin Login
**`POST /api/auth/login`**

Allows logging in with **Team ID** + member password, **Email** + password, or **Participant ID** + password. Sets HttpOnly session cookies upon success.

**Request Body Schema**:
```json
{
  "teamId": "FL26-7K4P9X",
  "password": "SecurePassword123!"
}
```
*Or:*
```json
{
  "email": "alex@example.com",
  "password": "SecurePassword123!"
}
```

**Success Response (200 OK)**:
```json
{
  "success": true,
  "user": {
    "role": "participant",
    "participantId": "4b058a80-3b6d-44ca-bbb4-85cd2f242ae6",
    "teamId": "fc116fe7-fc9d-474b-a085-2338d9408bcb"
  }
}
```

---

## 3. Participant Payment Endpoints (Authenticated)

### 3.1 Get Payment Status & UPI Details
**`GET /api/payments/status`**

Returns registration fee amount, current payment verification status, and official organizer UPI ID and QR code path.

**Success Response (200 OK)**:
```json
{
  "registration": {
    "id": "72959506-71c2-4374-83ee-69b401d6996c",
    "number": "REG-2026-FL26-7K4P9X-A1B2",
    "status": "pending_payment",
    "feeAmount": 100000,
    "currency": "INR",
    "confirmedAt": null
  },
  "payment": null,
  "paymentInstructions": {
    "upiId": "organizer@oksbi",
    "qrPath": "/payment/upi-qr.jpeg"
  }
}
```

### 3.2 Submit UPI Payment Proof
**`POST /api/payments/submit-proof`**

Submits UPI transaction ID (UTR) and payment screenshot.

**Request**: `multipart/form-data`
- `utr`: String, 6–64 alphanumeric characters.
- `screenshot`: File (PNG, JPEG, WebP, max 5 MB). File magic bytes are verified server-side.

**Success Response (201 Created)**:
```json
{
  "success": true,
  "message": "Payment proof submitted successfully. It is under organizer verification.",
  "data": {
    "paymentId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending_verification"
  }
}
```

### 3.3 View Payment Screenshot
**`GET /api/payments/proof/:id`**

Generates a 60-second signed URL for authorized team members or admins. Cross-team access is blocked with 403 Forbidden.

**Success Response (200 OK)**:
```json
{
  "url": "https://<supabase-url>/storage/v1/object/sign/payment-proofs/...?token=...",
  "expiresIn": 60
}
```

---

## 4. Admin Management Endpoints (Admin-Only)

All admin endpoints require `role === 'admin'`. Unauthenticated requests receive 401 Unauthorized; participant sessions receive 403 Forbidden.

### 4.1 Dashboard Statistics
**`GET /api/admin/stats`**

Returns real-time aggregate statistics from the database.

**Success Response (200 OK)**:
```json
{
  "statistics": {
    "totalTeams": 24,
    "totalParticipants": 86,
    "totalRegistrations": 24,
    "pendingPayments": 5,
    "verifiedPayments": 18,
    "rejectedPayments": 1,
    "verifiedAmount": 1800000,
    "currency": "INR",
    "todayRegistrations": 4
  }
}
```

### 4.2 Teams Directory
**`GET /api/admin/teams?page=1&pageSize=25&search=warriors&status=active`**

Supports pagination, case-insensitive search (by team name or Team ID), and status filtering (`active` / `disabled`).

### 4.3 View Team Details
**`GET /api/admin/teams/:id`**

Returns team details, member roster, registration record, and payment history.

### 4.4 Update / Toggle Team Status
**`PATCH /api/admin/teams/:id`**

**Request Body**:
```json
{
  "status": "disabled"
}
```
Disables a team. Automatically blocks all team members from accessing participant routes. Creates an audit log entry.

### 4.5 Participants Directory
**`GET /api/admin/participants?page=1&pageSize=25&search=alex&status=active`**

Lists participants with pagination, search (by name, email, phone, participant ID), and status filter.

### 4.6 Update / Toggle Participant Status
**`PATCH /api/admin/participants/:id`**

**Request Body**:
```json
{
  "status": "disabled"
}
```

### 4.7 Registrations List
**`GET /api/admin/registrations?page=1&pageSize=25&status=pending_payment`**

Lists registrations with linked team and payment status.

### 4.8 Payment Proofs Review Queue
**`GET /api/admin/payments?page=1&pageSize=25&status=pending_verification`**

Lists payment proofs awaiting organizer review.

### 4.9 Verify / Approve Payment Proof
**`POST /api/admin/payments/:id/verify`**

Approves the payment proof. Transitions `payment_proofs.status` to `paid` and `registrations.status` to `confirmed`. Creates an audit log entry.

### 4.10 Reject Payment Proof
**`POST /api/admin/payments/:id/reject`**

**Request Body**:
```json
{
  "reason": "UTR not found in bank statement"
}
```
Rejects the proof with a mandatory reason (3–500 chars). Sets registration back to `pending_payment` for re-submission.

### 4.11 Audit Log Stream
**`GET /api/admin/audit-logs?page=1&pageSize=50&action=payment.proof_verified`**

Lists tamper-evident audit records.
