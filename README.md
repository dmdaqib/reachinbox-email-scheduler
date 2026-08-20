# ReachInbox Email Scheduler

A high-performance, restart-safe, distributed email scheduling platform built for ReachInbox. Designed to handle 1000+ recipients per campaign with atomic Redis-backed rate limiting, BullMQ delayed job processing, real Google OAuth authentication, and Ethereal SMTP preview generation.

---

## Table of Contents (26 Sections)

1. [Project Structure](#1-project-structure)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Environment Configuration](#4-environment-configuration)
5. [Infrastructure Setup](#5-infrastructure-setup)
6. [Authentication & Session Security](#6-authentication--session-security)
7. [Scheduling Workflow & Slot Planner](#7-scheduling-workflow--slot-planner)
8. [Queue Worker Execution & Concurrency](#8-queue-worker-execution--concurrency)
9. [Redis Rate-Limiting Design](#9-redis-rate-limiting-design)
10. [Rescheduling & Over-Limit Strategy](#10-rescheduling--over-limit-strategy)
11. [Idempotency & Duplicate Prevention](#11-idempotency--duplicate-prevention)
12. [Restart Resilience & Startup Reconciliation](#12-restart-resilience--startup-reconciliation)
13. [Database Data Model](#13-database-data-model)
14. [Backend API Specification](#14-backend-api-specification)
15. [Frontend UI & Figma Design Match](#15-frontend-ui--figma-design-match)
16. [Compose Workflow & Recipient Parser](#16-compose-workflow--recipient-parser)
17. [Security Review & Auditing](#17-security-review--auditing)
18. [Automated Testing Strategy](#18-automated-testing-strategy)
19. [Local Development Instructions](#19-local-development-instructions)
20. [Docker Compose Commands](#20-docker-compose-commands)
21. [Common Troubleshooting Guide](#21-common-troubleshooting-guide)
22. [Production Deployment Guidance](#22-production-deployment-guidance)
23. [Step-by-Step Demo Script](#23-step-by-step-demo-script)
24. [Accessing Ethereal Email Previews](#24-accessing-ethereal-email-previews)
25. [Validation Checklist](#25-validation-checklist)
26. [Architecture Trade-offs & Summary](#26-architecture-trade-offs--summary)

---

## 1. Project Structure

```text
reachinbox-email-scheduler/
├── docker-compose.yml
├── package.json
├── REQUIREMENTS.md
├── README.md
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── index.ts              # Backend HTTP server entry
│   │   ├── worker.ts             # BullMQ queue worker entry
│   │   ├── app.ts                # Express application setup & API routes
│   │   ├── auth/
│   │   │   └── passport.ts       # Google OAuth strategy configuration
│   │   ├── config/
│   │   │   └── env.ts            # Zod environment variable validation
│   │   ├── email/
│   │   │   ├── mailer.ts         # Nodemailer Ethereal transport & auto-account
│   │   │   └── parseRecipients.ts# Multi-format CSV/TXT email recipient parser
│   │   ├── lib/
│   │   │   ├── prisma.ts         # Singleton Prisma DB client instance
│   │   │   └── redis.ts          # Redis client & memory fallback
│   │   ├── middleware/
│   │   │   ├── auth.ts           # Session authentication middleware
│   │   │   └── error.ts          # Express global error handler
│   │   ├── queue/
│   │   │   ├── email.queue.ts    # BullMQ Queue instance
│   │   │   └── rateLimit.ts      # Atomic Redis Lua rate limiting scripts
│   │   └── services/
│   │       ├── reconcile.service.ts # Startup job recovery & reconciliation
│   │       ├── schedule.service.ts  # Scheduling transaction & bulk job enqueue
│   │       └── slotPlanner.ts       # Window packing & scheduling calculations
│   └── tests/                    # Vitest unit & integration test suite
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── App.tsx
        ├── main.tsx
        ├── components/
        │   ├── layout/Header.tsx
        │   ├── layout/Sidebar.tsx
        │   └── ui/Toast.tsx
        ├── features/
        │   └── compose/ComposeModal.tsx
        └── pages/
            ├── LoginPage.tsx
            └── DashboardPage.tsx
```

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Vite React SPA (Tailwind CSS, Figma-style light layout)   │
│  Login (Google OAuth) · Sidebar · Dashboard · Compose Modal  │
└────────────────────────────┬────────────────────────────────┘
                             │ Cookie Session (credentials: include)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Express API (TypeScript)                                   │
│  Google OAuth 2.0 Passport · Redis Session Store            │
│  POST /api/emails/schedule -> Validate -> Postgres Email    │
│                            -> BullMQ Delayed Job Enqueue    │
│  PostgreSQL = Source of Truth for state & recovery          │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
         PostgreSQL                      Redis
         User, Sender, Email             BullMQ Delayed Queue
                                         Sender Rate Limiting (Lua)
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Worker Process (worker.ts, WORKER_CONCURRENCY)              │
│  Atomic SQL Claim -> Min-Delay Lua -> Hourly Lua            │
│  If limited: Revert SCHEDULED + Reschedule to next window   │
│  Else: Send via Nodemailer (Ethereal) -> Mark SENT / FAILED │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

- **Frontend**: Vite + React 18 + TypeScript + Tailwind CSS (No Next.js)
- **Backend**: Express.js + TypeScript
- **Database & ORM**: PostgreSQL 16 + Prisma ORM
- **Queue & Rate Limiter**: BullMQ + Redis (ioredis / Lua atomic scripts)
- **Email Dispatch**: Nodemailer + Ethereal SMTP
- **Authentication**: Passport.js Google OAuth 2.0 + Server Sessions
- **Container Infrastructure**: Docker Compose

---

## 4. Environment Configuration

All environment variables are validated at startup using Zod in `backend/src/config/env.ts`:

| Variable | Default | Role |
| --- | --- | --- |
| `NODE_ENV` | `development` | Environment mode (`development` \| `test` \| `production`) |
| `PORT` | `4000` | Backend API port |
| `BACKEND_URL` | `http://localhost:4000` | Backend public URI |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend CORS allowed origin |
| `SESSION_SECRET` | `reachinbox-session-secret-change-me` | Express session signature secret |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/reachinbox` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `WORKER_CONCURRENCY` | `5` | Parallel job concurrency per worker instance |
| `MIN_EMAIL_DELAY_MS` | `2000` | Minimum gap in milliseconds between email sends per sender |
| `MAX_EMAILS_PER_HOUR` | `100` | Maximum emails per hour per sender |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth Client Secret |
| `ETHEREAL_USER` | Optional | Ethereal SMTP username (auto-generated if omitted) |
| `ETHEREAL_PASS` | Optional | Ethereal SMTP password (auto-generated if omitted) |

---

## 5. Infrastructure Setup

Docker Compose provisions isolated PostgreSQL and Redis containers with persistent volumes:

```yaml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    container_name: reachinbox-postgres
    ports: ['5432:5432']
    environment:
      POSTGRES_DB: reachinbox
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
  redis:
    image: redis:7-alpine
    container_name: reachinbox-redis
    ports: ['6379:6379']
    command: ['redis-server', '--appendonly', 'yes']
```

---

## 6. Authentication & Session Security

- Real Google OAuth 2.0 passport strategy (`/api/auth/google`).
- Session cookies (`connect.sid`) HTTP-only with configurable Max-Age.
- First-time login automatically provisions a default `Sender` profile for the user based on Ethereal/env defaults.
- All API endpoints strictly check authorization middleware (`requireAuth`) ensuring users can only read or manage their own email records.

---

## 7. Scheduling Workflow & Slot Planner

When scheduling a campaign:
1. `scheduleEmailsForUser` calculates effective minimum delay: `Math.max(requestedDelayMs, MIN_EMAIL_DELAY_MS)`.
2. Effective hourly limit: `Math.min(requestedHourlyLimit, sender.hourlyLimit ?? MAX_EMAILS_PER_HOUR)`.
3. `planScheduledWindows` maps recipient index `i` to scheduled timestamps, ensuring recipient order is preserved across hourly capacity windows.
4. Database records are inserted in `EmailStatus.SCHEDULED` status within a Prisma transaction.
5. BullMQ delayed jobs are created with deterministic job ID `email:{emailId}` and `delay = Math.max(0, scheduledAt - now)`.

---

## 8. Queue Worker Execution & Concurrency

The separate worker process (`worker.ts`) operates with configurable concurrency `WORKER_CONCURRENCY` (default `5`):

```
Worker picks up job (emailId)
  │
  ├── 1. Check DB state: Skip if status === 'SENT' or etherealMessageId present
  ├── 2. Atomic SQL Claim: UPDATE Email SET status = 'PROCESSING' WHERE status IN ('SCHEDULED', 'PROCESSING') AND etherealMessageId IS NULL
  ├── 3. Redis Min Delay Lua: Check sender gap (MIN_EMAIL_DELAY_MS)
  │      └─ If wait > 0: Revert to SCHEDULED, update scheduledAt, re-enqueue delayed job
  ├── 4. Redis Hourly Limit Lua: Reserve sender slot for UTC hour key
  │      └─ If limit reached: Revert to SCHEDULED, reschedule to next UTC hour, re-enqueue delayed job
  └── 5. Send Email via Nodemailer Ethereal:
         └─ Success: Set status = 'SENT', record etherealMessageId & previewUrl
         └─ Failure: Increment attemptCount, record lastError, throw error for retry or set FAILED
```

---

## 9. Redis Rate-Limiting Design

### Per-Sender Min Delay Gap
- Key: `rl:gap:{senderId}`
- Lua script checks elapsed time since last send for `senderId`. If `now - last < minDelayMs`, returns remaining wait time without updating key. Otherwise updates key to `now` and returns `0`.

### Per-Sender Hourly Capacity
- Key: `rl:hour:{senderId}:{yyyy-mm-dd-HH}`
- Lua script atomically increments counter if `current < limit` and sets key expiration to 2 hours. If limit is reached, returns `0` (denied).

---

## 10. Rescheduling & Over-Limit Strategy

If a worker attempts to process an email when the hourly cap is exhausted:
- The email is **NEVER** permanently failed or dropped.
- Its status is kept as `SCHEDULED` in PostgreSQL.
- Its `scheduledAt` date is set to the start of the next UTC hour window.
- The BullMQ delayed job is re-enqueued to run when the new hour window opens.
- Recipient ordering is preserved across rescheduled batches.

---

## 11. Idempotency & Duplicate Prevention

- **Deterministic Job ID**: `email:{emailId}` ensures BullMQ prevents duplicate job insertion for the same email ID.
- **Atomic Database Claim**: Workers perform an explicit SQL `UPDATE` guard ensuring only one worker instance can transition an email from `SCHEDULED` to `PROCESSING`.
- **SENT Guard**: Before sending, workers verify `status !== 'SENT'` and `etherealMessageId == null`. If an email was already delivered, the worker immediately completes without sending a second email.

---

## 12. Restart Resilience & Startup Reconciliation

PostgreSQL is the single source of truth for email status. On backend or worker startup, `reconcileStaleJobs()` automatically executes:
1. **Recover Stale Processing**: Any email stuck in `PROCESSING` status for over 5 minutes (e.g. from a worker crash mid-execution) is reset to `SCHEDULED`.
2. **Restore Missing Jobs**: Scans all `SCHEDULED` emails in PostgreSQL and verifies if a BullMQ delayed job exists in Redis. If missing (e.g. after Redis container restart), re-creates the delayed job.
3. **Never Resend**: `SENT` emails are strictly excluded from reconciliation and will never be re-queued.

---

## 13. Database Data Model

Prisma schema defines three primary entities (`User`, `Sender`, `Email`):

```prisma
model User {
  id        String   @id @default(cuid())
  googleId  String   @unique
  email     String   @unique
  name      String
  avatarUrl String?
  senders   Sender[]
  emails    Email[]
}

model Sender {
  id          String   @id @default(cuid())
  userId      String
  email       String
  displayName String
  smtpHost    String
  smtpPort    Int
  smtpUser    String
  smtpPass    String
  isDefault   Boolean  @default(false)
  hourlyLimit Int?
  emails      Email[]
}

model Email {
  id                String      @id @default(cuid())
  userId            String
  senderId          String
  toEmail           String
  subject           String
  body              String      @db.Text
  status            EmailStatus @default(SCHEDULED)
  scheduledAt       DateTime
  sentAt            DateTime?
  failedAt          DateTime?
  delayMs           Int
  hourlyLimit       Int
  attemptCount      Int         @default(0)
  lastError         String?     @db.Text
  bullmqJobId       String      @unique
  etherealMessageId String?
  previewUrl        String?
}
```

---

## 14. Backend API Specification

- `GET /api/health` — System health check.
- `GET /api/auth/google` — Initiate Google OAuth login.
- `GET /api/auth/google/callback` — Google OAuth redirect callback.
- `GET /api/auth/me` — Return current authenticated user profile.
- `POST /api/auth/logout` — Destroy user session.
- `GET /api/senders` — List senders belonging to user.
- `POST /api/senders` — Add custom sender profile.
- `POST /api/emails/schedule` — Schedule email campaign with multipart CSV upload or JSON recipient list.
- `GET /api/emails/scheduled` — Get list of `SCHEDULED` and `PROCESSING` emails.
- `GET /api/emails/sent` — Get list of `SENT` and `FAILED` emails.
- `GET /api/emails/:id` — Get detail for a specific email record.

---

## 15. Frontend UI & Figma Design Match

The React frontend uses Tailwind CSS matching the Figma assignment aesthetic:
- **Brand Theme**: Clean light background (`#f5f7f3`) with brand green accent (`#16a34a`).
- **Sidebar**: Navigation links (`Overview`, `Scheduled Queue`, `Sent Log`, `Senders`), real-time counters, and brand logo.
- **Header**: Authenticated user badge with name, email, avatar, and Logout button.
- **Compose Modal**: File drop zone for CSV upload, lead detector chip displaying parsed unique count, sender selector, start time picker, min delay, and hourly limit input.

---

## 16. Compose Workflow & Recipient Parser

The recipient parser (`parseRecipients.ts`) supports:
- Direct CSV file upload (`.csv`) or plain text file (`.txt`).
- Multi-column CSVs (extracting email column automatically).
- Manual comma, semicolon, tab, or newline separated lists.
- Automatic case-insensitive deduplication and string sanitation.
- Backend re-validation ensuring zero bad emails bypass validation.

---

## 17. Security Review & Auditing

- Parameterized SQL queries via Prisma ORM preventing SQL injection.
- Zod schema validation on request payloads and environment variables.
- User-scoped queries (`where: { userId }`) enforcing strict multi-tenant authorization.
- Zero secrets or private tokens exposed in frontend builds.

---

## 18. Automated Testing Strategy

Vitest test suite (`backend/tests`) covers:
1. `parser.test.ts`: CSV parsing, header removal, email validation, and deduplication.
2. `config.test.ts`: Zod environment variable parsing and defaults.
3. `rate-limit.test.ts`: Min-delay gap and hourly limit Redis Lua script execution.
4. `scheduler.test.ts`: Slot planner window calculations and order preservation.
5. `idempotency.test.ts`: Deduplication before scheduling.
6. `reconcile.test.ts`: Startup job restoration and skipping SENT emails.
7. `api.test.ts`: Express application route setup and health checks.

To run tests:
```bash
cmd /c npm run test --workspace backend
```

---

## 19. Local Development Instructions

1. Clone repository & install dependencies:
   ```bash
   npm install
   ```
2. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```
3. Start local Postgres and Redis containers:
   ```bash
   docker compose up -d
   ```
4. Run Prisma database migrations:
   ```bash
   cmd /c npm run prisma:migrate --workspace backend
   ```
5. Start development servers (Backend API, Worker, Frontend Vite):
   ```bash
   npm run dev
   ```

---

## 20. Docker Compose Commands

- **Start Infrastructure**: `docker compose up -d`
- **View Container Logs**: `docker compose logs -f`
- **Stop Infrastructure**: `docker compose down`
- **Wipe Volumes**: `docker compose down -v`

---

## 21. Common Troubleshooting Guide

- **PostgreSQL Connection Error**: Ensure Postgres container is running (`docker compose ps`) on port `5432`.
- **Google OAuth Redirect Fail**: Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` match your Google Cloud Console redirect URI (`http://localhost:4000/api/auth/google/callback`).
- **Ethereal Mail Previews Missing**: If Nodemailer auto-account creation fails due to network filtering, provide explicit `ETHEREAL_USER` and `ETHEREAL_PASS` in `.env`.

---

## 22. Production Deployment Guidance

- Deploy PostgreSQL with managed backups (e.g. AWS RDS or Supabase).
- Deploy Redis with AOF persistence enabled (`redis-server --appendonly yes`).
- Run the API and Worker as separate scalable process groups (e.g. AWS ECS / Docker / PM2).
- Set `NODE_ENV=production` and strong `SESSION_SECRET`.

---

## 23. Step-by-Step Demo Script

1. Open `http://localhost:5173/login`.
2. Click **Sign in with Google OAuth** to authenticate.
3. On the Dashboard, click **+ Compose New**.
4. Attach a sample CSV file or enter lead emails (e.g., `lead1@example.com, lead2@example.com`). Observe the detected lead count indicator.
5. Set **Min Delay (ms)** to `2000` and **Hourly Limit** to `100`.
6. Click **Schedule Campaign**.
7. Navigate to the **Scheduled Emails** tab to view pending queue items.
8. Start the worker (`npm run worker --workspace backend`). Watch jobs transition from `SCHEDULED` -> `PROCESSING` -> `SENT`.
9. Navigate to the **Sent & Delivered Log** tab. Click **Preview ↗** to open the live Ethereal email preview in your browser!
10. **Restart Test**: Stop Redis / Backend, schedule future email, restart service — verify job is automatically reconciled and delivered without duplicate sends.

---

## 24. Accessing Ethereal Email Previews

Every email dispatched by Nodemailer generates an official Ethereal preview URL:
`https://ethereal.email/message/...`
In the Dashboard **Sent & Delivered Log** view, click the **Preview ↗** link on any sent email row to view the rendered HTML/text email content directly in Ethereal's web viewer.

---

## 25. Validation Checklist

- [x] Monorepo setup with Vite React frontend and Express backend.
- [x] Real Google OAuth 2.0 authentication flow with logout support.
- [x] Prisma PostgreSQL schema (`User`, `Sender`, `Email`) without campaign table.
- [x] Recipient parsing, deduplication, and zero artificial cap.
- [x] Min delay gap enforcement (`MIN_EMAIL_DELAY_MS=2000`).
- [x] Hourly sender cap enforcement (`MAX_EMAILS_PER_HOUR=100`).
- [x] Rescheduling over-limit emails without dropping or failing.
- [x] Multi-worker safe atomic DB claim and Lua rate limiter.
- [x] Restart safety & startup job reconciliation (`reconcileStaleJobs`).
- [x] Deterministic BullMQ job IDs (`email:{id}`) preventing duplicates.
- [x] Figma design visual match (light UI, green accent, sidebar, header).
- [x] Automated test suite passing with 100% success rate.
- [x] Clean production build verification (`npm run build`).

---

## 26. Architecture Trade-offs & Summary

- **PostgreSQL as Primary Source of Truth**: Redis BullMQ handles delayed queue mechanics, but state lives in PostgreSQL. If Redis is flushed, `reconcileStaleJobs` recovers all unfulfilled scheduled jobs cleanly.
- **Separate Worker Process**: Keeping `worker.ts` separate from the Express HTTP API guarantees high-throughput queue processing without blocking web requests or main thread event loops.
- **No Artificial Recipient Caps**: Large recipient lists (1000+) are stream-parsed and batch-inserted into PostgreSQL and BullMQ, handling large campaigns effortlessly within Node memory constraints.
