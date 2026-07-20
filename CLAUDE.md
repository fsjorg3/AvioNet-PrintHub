# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AvioNet-PrintHub is a monorepo. Its backend is a Node.js (ES Modules) Express API that bridges WhatsApp users with a self-service printing kiosk. Users send documents via WhatsApp, the service stores them and returns a 6-digit PIN, and the kiosk retrieves the file using that PIN.

## Commands

```bash
cd backend
npm install          # install backend dependencies
npm start            # production: node src/app.js
npm run dev          # development: node --watch src/app.js (auto-reload on changes)
```

No test runner is configured. No build step is required.

## Environment

Copy `backend/.env.sample` to `backend/.env` and fill in the Meta/WhatsApp credentials. Required variables:

- `ACCESS_TOKEN` — Meta WhatsApp Cloud API token
- `VERIFY_TOKEN` — Shared secret used for both webhook handshake and kiosk auth
- `PHONE_NUMBER_ID` — Meta WhatsApp phone number ID
- `APP_SECRET` — Meta app secret for HMAC-SHA256 signature verification
- `API_VERSION` — Meta Graph API version (e.g. `v20.0`)
- `PORT` — defaults to 10000
- `ADMIN_USER` / `ADMIN_PASSWORD` — HTTP Basic Auth credentials for the `/v1/admin/*` panel endpoints

## Architecture

### Data flow

```
WhatsApp User → Meta → POST /v1/webhook → webhook.js → whatsapp.js (download) → db.js (save + PIN) → WhatsApp reply
Kiosk Terminal → GET /v1/kiosk/file-info?pin=... → kiosk.js → db.js → metadata
Kiosk Terminal → GET /v1/kiosk/download?pin=... → kiosk.js → db.js → file stream + auto-delete
Kiosk Device → POST /v1/kiosk/report (Bearer <kiosk_id>.<secret>) → kiosks.js → db.js → print job + consumables logged
Admin → GET/POST /v1/admin/* (Basic Auth) → admin.js → db.js → kiosks, KPIs, consumables
```

### Module responsibilities

| File | Role |
|------|------|
| `backend/src/app.js` | Express setup, rate limiters, route definitions, 60s cleanup cron |
| `backend/src/webhook.js` | Webhook verification handshake, HMAC-SHA256 signature check, document event processing |
| `backend/src/whatsapp.js` | HTTP calls to Meta Graph API (send messages, download media) |
| `backend/src/kiosk.js` | Token auth middleware, file-info and download handlers (WhatsApp→PIN pickup flow) |
| `backend/src/kiosks.js` | Per-kiosk API key auth, print job report handler (pages, revenue, consumables) |
| `backend/src/admin.js` | Admin Basic Auth middleware, kiosk management and KPI/consumables query handlers |
| `backend/src/db.js` | SQLite layer — `pending_prints`, `kiosks`, `print_jobs`, `kiosk_consumables` tables, PIN generation, expiry cleanup, KPI aggregation |
| `backend/src/config.js` | Env var loading, startup validation |

### Storage

SQLite (`backend/database.sqlite`, auto-created). Tables:

- `pending_prints(pin, filename, filepath, phone, created_at, downloaded_at, file_deleted_at)` — WhatsApp→PIN pickup flow. Files in `backend/temp_files/` are deleted automatically after 10 minutes (or 5 minutes after download) via `db.cleanupExpiredPrints`, but **the row itself is never deleted** — it's kept permanently as a historical record so `print_jobs.pin` can reference it. `file_deleted_at` marks when the physical file was removed.
- `kiosks(id, name, api_key_hash, price_per_page, created_at, last_seen_at)` — one row per physical kiosk; `api_key_hash` is a sha256 of a random secret, the plaintext secret is only ever shown once at creation time (`POST /v1/admin/kiosks`).
- `print_jobs(id, kiosk_id, pin, pages, revenue, idempotency_key, created_at)` — one row per completed print, reported by the kiosk itself. `idempotency_key` (optional, unique per kiosk) prevents double-counting on retry.
- `kiosk_consumables(id, kiosk_id, type, status, level_percent, reported_at)` — historical log (not overwritten) of consumable levels; `status` (`ok/low/critical/empty/unknown`) is the field to rely on, `level_percent` is best-effort and often unavailable depending on the printer's SNMP support.

### Security layers

1. **Webhook**: HMAC-SHA256 signature verified against `APP_SECRET` before any processing (request rejected outright if the signature header is missing)
2. **Kiosk pickup endpoints** (`/v1/kiosk/file-info`, `/v1/kiosk/download`): shared `VERIFY_TOKEN` required in query param or `Authorization` header
3. **Kiosk report endpoint** (`/v1/kiosk/report`): per-kiosk credential, `Authorization: Bearer <kiosk_id>.<secret>`, secret verified against a stored hash
4. **Admin endpoints** (`/v1/admin/*`): HTTP Basic Auth against `ADMIN_USER`/`ADMIN_PASSWORD`
5. **Rate limiting**: webhook 60 req/min, kiosk 30 req/15min, admin 100 req/15min

## Key quirks

- **Mexico phone numbers**: Meta sends `+521XXXXXXXXXX` (13 digits) for MX numbers; `webhook.js` strips the extra `1` to get `+52XXXXXXXXXX` (12 digits) before using the number as a reply target.
- **Accepted file types**: Only PDF, DOC, and DOCX are processed; other types receive an error reply.
- **ES Modules**: All files use `import`/`export` (`"type": "module"` in package.json). Do not use `require()`.
- **Reverse proxy**: `app.set('trust proxy', 1)` is enabled for Render/Heroku deployments where `X-Forwarded-For` carries the real IP.
