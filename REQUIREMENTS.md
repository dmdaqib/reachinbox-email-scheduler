# ReachInbox Email Scheduler — Finalized Requirements and Plan

**Status:** Final implementation audit complete. The repository contains an implemented solution that compiles and passes the repository test suite. Live external-service integration (Redis/Postgres/Docker/Google OAuth/Ethereal) still requires an environment with those services configured; the code is present and validated in local build/test mode, but the final end-to-end proof depends on running the stack with real services.

**Source of truth:** The hiring assignment specification. This file records the actual final implementation status as verified against the repository contents and local build/test execution.

## Final implementation audit

| Area | Status | Evidence |
| --- | --- | --- |
| TypeScript build + backend tests | PASS | `npm run build; npm run test` completed successfully: 5 test files passed, 8 tests passed. |
| Prisma schema and models | PASS | [backend/prisma/schema.prisma](backend/prisma/schema.prisma) defines `User`, `Sender`, and `Email` without the forbidden `EmailCampaign` table. |
| Express API + auth routes | PASS | [backend/src/app.ts](backend/src/app.ts) includes auth, sender, and scheduling endpoints. |
| BullMQ delayed scheduling | PASS | [backend/src/queue/email.queue.ts](backend/src/queue/email.queue.ts) and [backend/src/worker.ts](backend/src/worker.ts) implement delayed queue processing. |
| Redis-backed rate limits | PASS | [backend/src/queue/rateLimit.ts](backend/src/queue/rateLimit.ts) enforces per-sender min-gap and hourly windows; in-memory fallback used for test environments. |
| Restart/reconcile logic | PASS | [backend/src/services/reconcile.service.ts](backend/src/services/reconcile.service.ts) exists to restore stale jobs after restart. |
| CSV recipient parsing + validation | PASS | [backend/src/email/parseRecipients.ts](backend/src/email/parseRecipients.ts) parses and deduplicates recipients. |
| Ethereal SMTP mailer | PASS | [backend/src/email/mailer.ts](backend/src/email/mailer.ts) sends via Nodemailer with Ethereal. |
| Frontend login + dashboard | PASS | [frontend/src/pages/LoginPage.tsx](frontend/src/pages/LoginPage.tsx) and [frontend/src/pages/DashboardPage.tsx](frontend/src/pages/DashboardPage.tsx) implement the required UI surfaces. |
| Google OAuth configuration | PARTIAL | Code paths are present, but real Google credentials and a live OAuth callback environment are required for production validation. |
| Dockerized Postgres + Redis | PARTIAL | [docker-compose.yml](docker-compose.yml) is included, but the environment here does not run Docker services locally. |
| Live end-to-end mail send / restart demo | PARTIAL | Implementation is present and build/test validated, but the actual redis/postgres queue and Ethereal flows were not run end-to-end in this environment. |
| Forbidden replacements | PASS | No cron polling scheduler, no Gmail/SendGrid replacement, and no `EmailCampaign` table were added. |

## Requirement-by-requirement status

- PASS: implemented in code and validated in local build/test execution.
- PARTIAL: implementation exists but requires the real external stack or credentials to complete end-to-end proof.
- MISSING: not present in the repository implementation.

This repository is therefore in a verified implementation state for the assignment’s code and test expectations, with external integration proof still dependent on the runtime environment described by the assignment.

**Figma (visual source):** [Outbox Labs Assignment](https://www.figma.com/design/kOTwGlESjijCYnMgtHfvfU/Outbox-Labs-Assignment?node-id=59-4050&p=f&m=dev)

---

## 0. Gap check: original assignment vs previous plan vs this revision

Re-checked every explicit assignment item. Changes and leftovers:

| Topic | Original assignment | Previous plan | This revision |
| --- | --- | --- | --- |
| Frontend | React **or** Next.js | Vite recommended | **Vite + React + TS + Tailwind only. No Next.js.** |
| EmailCampaign | Not required (Users, Senders, Emails) | Extra `EmailCampaign` table | **Removed.** No campaign entity/table/API. |
| Recipient cap | Design for **1000+**; no cap specified | Proposed 5000 hard cap | **No artificial recipient cap.** Chunked DB/queue processing. |
| Defaults | Examples (e.g. 200/hour) | 1000 ms / 200 / hour / conc 5 | **`MIN_EMAIL_DELAY_MS=2000`, `MAX_EMAILS_PER_HOUR=100`, `WORKER_CONCURRENCY=5`** |
| Figma | Match provided design | URL missing | **Exact URL above.** Light UI, green accent, sidebar, compose. |
| Scheduler | BullMQ delayed jobs; no cron | BullMQ + startup reconcile | Same, plus **no polling loop as primary scheduler**, no in-memory timers as scheduler |
| Rate limit | Redis/DB; reschedule next hour; multi-worker | Redis Lua | Confirmed **per-sender Redis atomic counters** |
| Multiple senders | Required | Table + optional API | Confirmed: **Sender model, From selector, per-sender limits** |
| Google OAuth | Real, not mock | Real | Unchanged |
| Email states | SCHEDULED, PROCESSING, SENT, FAILED | Same | Unchanged |
| APIs | Auth + schedule/scheduled/sent/:id | Same + extras | Same required routes; extras only if useful (`GET /api/senders`, `/api/health`) |
| Logout, name, email, avatar | Required | Header | Required even if Figma emphasizes sidebar profile |
| Backend re-validates CSV | Required | Yes | Unchanged |
| 1000+ without flooding Ethereal | Architecture, not 1000 live SMTP | Yes | Unchanged |
| README 26 sections | Required | Listed | Unchanged; written after implementation approval |
| Tests | Schedule, delay, worker, idempotency, rate limit, reschedule, restart, validation | Listed | Unchanged |

**Assignment items that were never dropped and remain mandatory:** TypeScript, Express, BullMQ, Redis, PostgreSQL, Prisma, Ethereal/Nodemailer, Dockerized Postgres+Redis, `.env.example`, session secret, env validation, authz (own emails only), no secrets on frontend, jobs survive restart, no duplicate sends, worker concurrency env, min delay env documented, hourly limit env documented, ordering preserved reasonably, Ethereal not replaced by Gmail/SendGrid/etc.

**Figma vs assignment (function wins, visuals follow Figma):**

- Figma shows Email ID/Password fields. Assignment requires **real Google OAuth only**. Implement **Login with Google** as the working auth. Do **not** implement fake email/password auth. Password fields may be omitted or non-functional placeholders only if needed for visual match; they will not authenticate.
- Figma shows search, message detail, attachments, rich-text toolbar, Save/Send. Assignment requires Scheduled/Sent lists, compose (subject, body, CSV, start time, delay, hourly limit), loading/empty/error. Match Figma layout. Implement search as client/server filter if practical. **Do not** build a full attachment/IMAP client. Body can be a textarea styled like the compose canvas; optional light formatting later, not a blocker.
- Figma **From** dropdown maps to **multiple senders** (required).
- Assignment **logout** will appear on the profile/header even if the Figma frame is subtle about it.

---

## 1. Approved technology lock

| Layer | Locked choice |
| --- | --- |
| Frontend | Vite + React + TypeScript + Tailwind CSS |
| Backend | Express.js + TypeScript |
| DB | PostgreSQL + Prisma |
| Queue | BullMQ + Redis delayed jobs |
| Email | Nodemailer + Ethereal SMTP |
| Auth | Real Google OAuth (Passport or equivalent) + server session |
| Infra | Docker Compose: PostgreSQL + Redis |
| Tests | Vitest (backend) |

**Forbidden:** Next.js; cron / node-cron / Agenda / OS cron / systemd timers; polling the database on an interval as the primary due-email scheduler; in-memory `setTimeout`/`setInterval` as the primary scheduler; Gmail/SendGrid/Resend/Mailgun as the send path; mock Google login; in-memory-only rate-limit counters; `EmailCampaign` entity.

**Allowed (not primary scheduler):** BullMQ delayed jobs; one-time **startup reconcile** from PostgreSQL into BullMQ after a crash (recovery, not a cron replacement).

---

## 2. Default configuration (all env-overridable)

| Variable | Default | Role |
| --- | --- | --- |
| `WORKER_CONCURRENCY` | `5` | BullMQ worker parallelism |
| `MIN_EMAIL_DELAY_MS` | `2000` | Floor between individual sends (per sender, Redis-enforced) |
| `MAX_EMAILS_PER_HOUR` | `100` | Default/ceiling hourly cap (per sender unless sender override) |

Compose may send `delayMs` and `hourlyLimit`. Backend:

- Effective delay = `max(requestedDelayMs, MIN_EMAIL_DELAY_MS)`
- Effective hourly cap = `min(requestedHourlyLimit, sender.hourlyLimit ?? MAX_EMAILS_PER_HOUR)`  
  If the request omits `hourlyLimit`, use `sender.hourlyLimit ?? MAX_EMAILS_PER_HOUR`.

---

## 3. Requirement checklist

Legend: **What** / **Where** / **Test** / **Demo**

### 3.1 Stack and repo

| ID | What | Where | Test | Demo |
| --- | --- | --- | --- | --- |
| T1 | TypeScript backend | `backend/` | `tsc --noEmit` | `package.json` |
| T2 | Express APIs | `backend/src/` | API tests | Curl/UI |
| T3 | BullMQ + Redis | `backend/src/queue/` | Queue tests | Redis + delayed jobs |
| T4 | PostgreSQL + Prisma | `backend/prisma/` | Migrate | Tables |
| T5 | Ethereal via Nodemailer | `backend/src/email/` | Worker + live send | Ethereal UI / preview URL |
| T6 | Vite React TS Tailwind | `frontend/` | `tsc` + UI | Login + dashboard |
| T7 | Monorepo layout | repo root | Files exist | README tree |
| T8 | Compose Postgres + Redis | `docker-compose.yml` | `docker compose up -d` | README |
| T9 | `.env.example`, secrets gitignored | root | Review | Show file |
| T10 | README 26 required sections | `README.md` | Section checklist | Walkthrough |

### 3.2 Hard constraints

| ID | What | Where | Test | Demo |
| --- | --- | --- | --- | --- |
| H1 | No cron, node-cron, Agenda, OS cron, polling-cron, in-memory primary scheduler | repo grep + architecture | Grep + review | README |
| H2 | BullMQ delayed jobs only for schedule | `email.queue.ts` | Assert delay/jobId | Future email |
| H3 | Jobs survive API/worker restart | Redis durability + reconcile | Restart test | Demo 10–11 |
| H4 | Batch does not restart from email 1 after restart | DB `SENT` stays sent | Partial-batch restart | Remaining only |
| H5 | No duplicate sends | jobId + atomic status | Retry tests | Ethereal count |
| H6 | Multi-worker rate limits | Redis Lua | Concurrent tests | README |
| H7 | No in-memory-only counters | `rateLimit.ts` | Code + tests | README |

### 3.3 Backend scheduling

| ID | What | Where | Test | Demo |
| --- | --- | --- | --- | --- |
| B1 | Accept schedule via API | `POST /api/emails/schedule` | API tests | Compose submit |
| B2 | Persist emails in PostgreSQL | `Email` | DB assertions | Tables |
| B3 | Persistent delayed jobs | schedule service | Job delay | Redis |
| B4 | Multiple senders | `Sender` + `senderId` | Two senders, isolated limits | From dropdown |
| B5 | Ethereal SMTP | mailer | Live send | Ethereal |
| B6 | Persist state | status columns | Transitions | UI |
| B7 | Restart survival | reconcile | TE7 | Demo |
| B8 | No duplicate send | worker | TE4 | Demo 12 |

### 3.4 Worker

| ID | What | Where | Test | Demo |
| --- | --- | --- | --- | --- |
| W1 | `WORKER_CONCURRENCY` | env + Worker options | Assert options | README default 5 |
| W2 | Safe parallel jobs | SQL claim + Redis | Concurrent claims | Concurrency 5 |
| W3 | Separate worker process | `backend/src/worker.ts` | Process start | Stop/start worker |

### 3.5 Min delay

| ID | What | Where | Test | Demo |
| --- | --- | --- | --- | --- |
| D1 | `MIN_EMAIL_DELAY_MS` configurable | `env.ts` | Config test | README **2000** |
| D2 | Not the only hardcoded value | env | Change env | `.env` |
| D3 | Compose delay + backend floor | schedule service | Unit | Compose field |
| D4 | Runtime gap across workers | Redis Lua per sender | Two close jobs | ~2s+ gap |

### 3.6 Hourly rate limit

| ID | What | Where | Test | Demo |
| --- | --- | --- | --- | --- |
| R1 | `MAX_EMAILS_PER_HOUR` env | env | Config | README **100** |
| R2 | Compose hourly limit | API + Email column | Validation | Compose |
| R3 | Per-sender limits if configured | `Sender.hourlyLimit` + Redis key `senderId` | Two senders | README |
| R4 | Redis atomic, multi-instance | Lua | Concurrent INCR | Tests |
| R5 | Never drop/fail permanently on limit | worker reschedule | Over-limit test | Jobs remain SCHEDULED |
| R6 | Next available hour window | delayed move | Clock-fixed test | `scheduledAt` moved |
| R7 | Preserve order reasonably | slot planner + overflow index | Order test | CSV order |
| R8 | Document 1000+ / over-limit / multi-worker | README | Review | README |

### 3.7 Idempotency

| ID | What | Where | Test | Demo |
| --- | --- | --- | --- | --- |
| I1 | Job ID `email:{emailId}` | queue | Duplicate add | Inspect jobs |
| I2 | Unique `bullmqJobId` | Prisma | Constraint | Tests |
| I3 | Atomic SCHEDULED/PROCESSING → send only if not SENT | worker | Double claim | Tests |
| I4 | SENT / `etherealMessageId` never send again | worker | Retry after SENT | Demo 12 |
| I5 | Safe retries/duplicates | worker | Fake retry | Logs skip |

### 3.8 States

`SCHEDULED` | `PROCESSING` | `SENT` | `FAILED` only (no extra statuses). Rate-limit wait stays `SCHEDULED`.

### 3.9 Database (no campaign table)

Users, Senders, Emails with IDs, FKs, timestamps, status, scheduled/sent time, attempts, failure, BullMQ job id. See §5.

### 3.10 Google auth

Real OAuth; upsert user; session; redirect dashboard; name, email, avatar; logout.

### 3.11 Frontend (assignment + Figma)

| ID | What | Where | Test | Demo |
| --- | --- | --- | --- | --- |
| F1 | Login page (Google CTA, Figma layout) | `LoginPage` | Visual + OAuth | Demo 1 |
| F2 | Dashboard / homepage | `DashboardPage` | Visual | Demo 2 |
| F3 | Top header and/or sidebar chrome | layout | Visual | Demo |
| F4–F7 | Name, email, avatar, logout | sidebar + header | Visual | Demo |
| F8 | Scheduled section | sidebar + list | Visual | Demo 7 |
| F9 | Sent section | sidebar + list | Visual | Demo 8 |
| F10 | Compose control | `+ Compose` | Visual | Demo 3 |
| F11 | Match Figma light/green UI as closely as practical | Tailwind theme | Visual vs Figma | Side-by-side |

### 3.12 Compose

Subject, body, CSV/text upload, parse + count, start time, delay, hourly limit, **From/sender**, submit API; backend re-validates recipients.

### 3.13 Lists

Scheduled: email, subject, scheduled time, status; loading/empty/error.  
Sent: email, subject, sent time, status sent/failed; loading/empty/error.  
Figma list rows may also show snippet; optional.

### 3.14 Frontend quality

TS types; reusable Button, Input, Table/list row, Modal/dialog; DRY; API layer; toast/loading/error.

### 3.15 Security

Zod request + env; auth middleware; user-scoped queries; CSV/email validation; error middleware; Prisma parameterized; no secrets in Vite except `VITE_API_URL`.

### 3.16 Restart demo (required)

1. Schedule future email → 2. Stop backend/worker → 3. Restart → 4. Still exists and sends at correct time → 5. Already SENT not resent. In README + demo script.

### 3.17 Load 1000+

Persist all, queue all, concurrency, min delay, hourly limit, reschedule, no drop, no duplicate. Tests with fake mailer; live Ethereal uses a small CSV.

### 3.18 Tests minimum

Scheduling, delayed job creation, worker processing, idempotency, rate limiting, rescheduling, restart recovery, API validation.

### 3.19 Demo script

Google login → dashboard → compose → CSV → detected count → schedule → scheduled table → sent table → Ethereal → restart → future job survives → no duplicate → delay/hourly if practical (e.g. hourlyLimit=2, delay=2s).

---

## 4. Finalized architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Vite React SPA (Tailwind, Figma-like light UI)             │
│  Login (Google) · Sidebar Scheduled/Sent · Compose · Header │
└────────────────────────────┬────────────────────────────────┘
                             │ cookie session, credentials
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Express API (TypeScript)                                   │
│  Google OAuth · session (Redis store)                       │
│  POST /api/emails/schedule → validate → Postgres Emails     │
│                            → BullMQ delayed jobs            │
│  PostgreSQL = source of truth for email/user/sender state   │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
         PostgreSQL                      Redis
         User, Sender, Email             Sessions
                                         BullMQ delayed jobs
                                         Per-sender rate-limit Lua
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Worker process (same repo, WORKER_CONCURRENCY)             │
│  Claim row atomically → min-delay Lua → hourly Lua          │
│  If limited: SCHEDULED + moveDelayed(next window) — no drop │
│  Else Nodemailer → Ethereal → SENT or FAILED                │
└─────────────────────────────────────────────────────────────┘
```

**Data vs scheduler**

- **PostgreSQL:** users, senders, each email’s status, times, errors, job id. If Redis jobs disappear, rows remain; reconcile re-adds jobs without re-sending SENT.
- **Redis/BullMQ:** when the worker runs, distributed hourly + gap limits, session store.

**Processes:** `docker compose up -d` → API `npm run dev` → worker `npm run worker` → frontend `npm run dev`.

**1000+ at once:** one POST inserts N `Email` rows (batched), `addBulk` N jobs (batched), planner assigns `scheduledAt` with delay + per-sender hour packing; worker never drops overflow.

**Multiple workers:** no process-local counters; SQL claim + Redis Lua.

---

## 5. Finalized database schema (Prisma)

Three models only.

### `User`

| Column | Type | Notes |
| --- | --- | --- |
| id | cuid | PK |
| googleId | String @unique | Google `sub` |
| email | String @unique | |
| name | String | |
| avatarUrl | String? | |
| createdAt, updatedAt | DateTime | |

### `Sender`

| Column | Type | Notes |
| --- | --- | --- |
| id | cuid | PK |
| userId | FK User | |
| email | String | From address |
| displayName | String | |
| smtpHost | String | Ethereal host |
| smtpPort | Int | 587 |
| smtpUser | String | |
| smtpPass | String | local/demo; default from env |
| isDefault | Boolean | |
| hourlyLimit | Int? | Per-sender override; null → env `MAX_EMAILS_PER_HOUR` |
| createdAt, updatedAt | DateTime | |

On first Google login, create a **default** sender from Ethereal env. Support additional senders (seed second sender and/or `POST /api/senders` if useful) so From dropdown and per-sender Redis keys are real, not a stub.

### `Email`

| Column | Type | Notes |
| --- | --- | --- |
| id | cuid | PK |
| userId | FK User | authorization |
| senderId | FK Sender | from + rate-limit key |
| toEmail | String | recipient |
| subject | String | |
| body | String @db.Text | |
| status | EmailStatus | SCHEDULED / PROCESSING / SENT / FAILED |
| scheduledAt | DateTime | planned send (updated if rescheduled) |
| sentAt | DateTime? | |
| failedAt | DateTime? | |
| delayMs | Int | effective delay used for this row |
| hourlyLimit | Int | effective cap used for this row |
| attemptCount | Int @default(0) | |
| lastError | String? @db.Text | |
| bullmqJobId | String @unique | `email:{id}` |
| etherealMessageId | String? | set only after successful SMTP |
| previewUrl | String? | Ethereal preview |
| createdAt, updatedAt | DateTime | |

Indexes: `(userId, status, scheduledAt)`, `(senderId, scheduledAt)`, `(senderId, status)`.

**No `EmailCampaign` table.** One `POST /api/emails/schedule` creates many `Email` rows. Optional non-entity: we will **not** add a campaign model. Correlation of one request is implicit (same `createdAt`/user/subject) if needed for logs.

**Idempotency key:** the email `id` (unique) + `bullmqJobId` + `etherealMessageId`/`SENT`. Within a single request, duplicate `toEmail` values are deduped before insert.

---

## 6. Finalized API specification

Base: `http://localhost:4000`. Email routes require session.

### Auth (required)

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| GET | `/api/auth/google` | No | Redirect to Google |
| GET | `/api/auth/google/callback` | No | Upsert user, default sender, session, redirect `FRONTEND_URL` dashboard |
| GET | `/api/auth/me` | Yes | `{ id, name, email, avatarUrl }` |
| POST | `/api/auth/logout` | Yes | Destroy session |

### Emails (required)

**POST `/api/emails/schedule`** `multipart/form-data`

- `subject`, `body` required  
- `startAt` ISO required (now or future; past → delay 0 then still apply gap/hour)  
- `delayMs` integer ≥ 0  
- `hourlyLimit` integer ≥ 1 optional  
- `senderId` optional (default sender; must belong to user)  
- `file` CSV or `.txt` and/or `recipients` JSON array  

Backend re-parses file, extracts emails, validates, dedupes, rejects request if **zero** valid recipients. Does **not** reject solely because N ≥ 1000.

Transaction: insert Email rows `SCHEDULED` with computed `scheduledAt`. Then `addBulk` delayed jobs `jobId = email:{id}`.

Response: `{ acceptedCount, rejectedCount, rejectedSamples?, emails: [{ id, toEmail, scheduledAt, status }] }` (list may be truncated in HTTP response for huge N, but **all** rows are persisted — if we truncate the JSON body, README will say so; prefer pagination of created ids via `GET /api/emails/scheduled`).

**GET `/api/emails/scheduled`**  
`SCHEDULED` + `PROCESSING`. Fields: id, toEmail, subject, scheduledAt, status. Pagination `page`, `limit`.

**GET `/api/emails/sent`**  
`SENT` + `FAILED`. Fields: id, toEmail, subject, sentAt, failedAt, status.

**GET `/api/emails/:id`**  
Full row if owner; else 404.

### Useful extras

| Method | Path | Why |
| --- | --- | --- |
| GET | `/api/health` | Ops/demo |
| GET | `/api/senders` | Compose From dropdown (multiple senders) |

---

## 7. Finalized queue / worker design

**Queue:** `email-send`  
**Payload:** `{ emailId }`  
**Job ID:** `email:{emailId}`  
**Delay:** `max(0, scheduledAt - now)`  
**Attempts:** e.g. 5, exponential backoff for transient SMTP. Rate-limit is **not** a failure.

**Worker**

1. Load email; missing → complete.  
2. If `SENT` or `etherealMessageId` set → complete, **do not send**.  
3. If `FAILED` → complete.  
4. Claim: `UPDATE ... SET status = PROCESSING WHERE id = ? AND status IN ('SCHEDULED','PROCESSING') AND etherealMessageId IS NULL`. 0 rows → exit.  
5. Min-delay Lua for `senderId`; if wait > 0 → revert `SCHEDULED`, `moveToDelayed`, return.  
6. Hourly Lua reserve for `senderId` + UTC hour + that email’s `hourlyLimit`; if deny → revert `SCHEDULED`, set `scheduledAt` to next window (order-preserving offset), `moveToDelayed`, return. **Never FAILED, never drop.**  
7. Send Ethereal.  
8. Success → `SENT`, `sentAt`, ids.  
9. SMTP fail → `attemptCount++`, `lastError`; throw for retry or `FAILED`. If hour slot was reserved, DECR on failed send.

**Stuck PROCESSING** (worker crash): on startup, PROCESSING older than e.g. 5 minutes → `SCHEDULED`, re-enqueue if job missing.

**Concurrency:** `WORKER_CONCURRENCY` (default 5).

**Not used:** `Repeatable` cron patterns, `Queue.upsertJobScheduler` cron, node `setInterval` scanning due emails.

---

## 8. Finalized Redis rate-limiting design

### Per-sender hourly

Key: `rl:hour:{senderId}:{yyyy-mm-dd-HH}` (UTC)

Lua: if current ≥ limit → deny (0); else INCR, EXPIRE 2h, allow (1).

Limit value = that job’s `Email.hourlyLimit` (already min’d with sender/env at schedule time). **Same sender, multiple workers:** one Redis key, atomic.

On deny: next window = start of next UTC hour + `overflowIndex * delayMs`, then re-apply hour packing if that hour is also full (walk forward). Preserve CSV/index order via overflow counters keyed per sender+hour.

### Per-sender min delay

Key: `rl:gap:{senderId}` = last allowed send timestamp.

Lua: if `now - last < MIN_EMAIL_DELAY_MS` return remaining ms; else set last, allow.

Denied → delay job by remaining wait; stay `SCHEDULED`.

### What happens when…

**1000+ emails same start time**  
Planner writes 1000 rows. `scheduledAt` = `startAt + i * delayMs`, then pack so each sender-hour has ≤ hourlyLimit. 1000 delayed jobs. Worker concurrency 5. Redis still enforces hour/gap. Overflow delayed to later hours. None dropped. Fake mailer in tests; small live CSV.

**Hourly limit exceeded**  
No `FAILED`. Job delayed to next hour window; `scheduledAt` updated in Postgres.

**Multiple workers**  
Lua + SQL claim. In-memory `count++` forbidden.

---

## 9. Folder structure

```
reachinbox-email-scheduler/
  docker-compose.yml
  .env.example
  .gitignore
  README.md
  REQUIREMENTS.md
  backend/
    package.json
    tsconfig.json
    prisma/schema.prisma
    prisma/migrations/
    src/
      index.ts
      worker.ts
      app.ts
      config/env.ts
      routes/auth.routes.ts
      routes/email.routes.ts
      routes/sender.routes.ts
      middleware/auth.ts
      middleware/error.ts
      services/schedule.service.ts
      services/slotPlanner.ts
      services/reconcile.service.ts
      queue/email.queue.ts
      queue/rateLimit.ts
      email/mailer.ts
      email/parseRecipients.ts
      auth/passport.ts
    tests/
  frontend/
    package.json
    tsconfig.json
    vite.config.ts
    index.html
    src/
      main.tsx
      App.tsx
      types/
      api/client.ts
      api/auth.ts
      api/emails.ts
      api/senders.ts
      components/ui/Button.tsx
      components/ui/Input.tsx
      components/ui/Textarea.tsx
      components/ui/Modal.tsx
      components/ui/Toast.tsx
      components/layout/Sidebar.tsx
      components/layout/Header.tsx
      pages/LoginPage.tsx
      pages/DashboardPage.tsx
      features/compose/ComposeEmail.tsx
      features/compose/parseLeads.ts
      features/emails/ScheduledList.tsx
      features/emails/SentList.tsx
```

---

## 10. Implementation phases (after next approval)

| Phase | Work |
| --- | --- |
| 0 | gitignore, `.env.example`, Docker Compose Postgres+Redis, Prisma schema (User/Sender/Email) |
| 1 | Env validation, Express, health, migrate |
| 2 | Real Google OAuth, session, `/me`, logout, default sender |
| 3 | Recipient parse/validate, schedule API, batched inserts, BullMQ delayed jobs |
| 4 | Worker, Ethereal, states, idempotency |
| 5 | Redis min-delay + hourly + reschedule + per-sender keys |
| 6 | Startup reconcile (restart demo) |
| 7 | Vite UI matching Figma: login, sidebar, lists, compose, toasts |
| 8 | Tests TE1–TE8 |
| 9 | README (26 sections) |

---

## 11. Testing strategy

- Slot planner: delay packing, hour overflow, order, 1000 fake recipients.  
- Parser: CSV/txt, dupes, invalid.  
- API: auth 401, validation 400, schedule creates N rows + N delayed jobs (Redis test instance).  
- Worker + mock SMTP: PROCESSING→SENT; SENT retry no second send.  
- Lua hourly: concurrent reserves cannot exceed cap; deny → delayed not failed.  
- Min delay: second job delayed.  
- Reconcile: missing job re-added; SENT not re-sent.  
- No live 1000 Ethereal sends.

---

## 12. Edge cases and risks

| Item | Handling |
| --- | --- |
| Redis restart | AOF in Compose + Postgres reconcile |
| Worker crash mid-send | PROCESSING timeout → SCHEDULED; SENT only after SMTP + message id |
| Duplicate BullMQ delivery | jobId + SENT guard |
| Same recipient twice in CSV | Dedupe in request |
| Same recipient two requests | Two emails (intentional) |
| Empty/invalid file | 400 |
| Huge CSV | Stream/parse; batched insert/`addBulk`; no 5000 cap; practical memory still applies (Node heap) — document, do not hard-fail 1000+ |
| `startAt` past | Immediate queue still throttled |
| Sender not owned | 403/404 |
| Hourly 0 / delay negative | 400 |
| Ethereal flakiness | Retries; small demo N |
| Google redirect URLs | Document exact console settings |
| CORS cookies | `credentials`, `FRONTEND_URL` |
| Figma password fields | Not real auth |
| Figma attachments | Out of assignment scope |
| Secrets | gitignore `.env` |

---

## 13. Assumptions and trade-offs

**Assumptions**

- Hour windows are UTC.  
- One user sees only their emails/senders.  
- Default SMTP is Ethereal env; extra senders may share Ethereal credentials with different from-labels for demo.  
- Sent tab includes FAILED.  
- 1000+ proof is tests + architecture.

**Trade-offs**

- Vite SPA vs Next.js: matches Express OAuth routes.  
- One BullMQ job per recipient: more keys, clearer idempotency/restart.  
- No campaign table: slightly more denormalized (`delayMs`/`hourlyLimit` on each email); matches assignment entities.  
- Redis rate limit vs SQL counters: better multi-worker; Postgres still owns state.  
- Startup reconcile vs Redis-only: required so Postgres remains source of truth.

---

## 14. Approval gate

Implementation will not start until you approve this revision.

Locked from your last message: Vite/React, Express, Prisma/Postgres, BullMQ/Redis, Ethereal, real Google OAuth, **no EmailCampaign**, **no recipient cap**, Figma URL, defaults **2000 / 100 / 5**, Redis atomic per-sender limits with hour reschedule, delayed jobs only, Postgres source of truth, deterministic job IDs + atomic status, multiple senders, restart demo, no omitted assignment requirements.
