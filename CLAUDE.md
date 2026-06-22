# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AvioNet-PrintHub is a Node.js (ES Modules) Express API that bridges WhatsApp users with a self-service printing kiosk. Users send documents via WhatsApp, the service stores them and returns a 6-digit PIN, and the kiosk retrieves the file using that PIN.

## Commands

```bash
npm install          # install dependencies
npm start            # production: node src/app.js
npm run dev          # development: node --watch src/app.js (auto-reload on changes)
```

No test runner is configured. No build step is required.

## Environment

Copy `.env.sample` to `.env` and fill in the Meta/WhatsApp credentials. Required variables:

- `ACCESS_TOKEN` — Meta WhatsApp Cloud API token
- `VERIFY_TOKEN` — Shared secret used for both webhook handshake and kiosk auth
- `PHONE_NUMBER_ID` — Meta WhatsApp phone number ID
- `APP_SECRET` — Meta app secret for HMAC-SHA256 signature verification
- `API_VERSION` — Meta Graph API version (e.g. `v20.0`)
- `PORT` — defaults to 10000

## Architecture

### Data flow

```
WhatsApp User → Meta → POST /v1/webhook → webhook.js → whatsapp.js (download) → db.js (save + PIN) → WhatsApp reply
Kiosk Terminal → GET /v1/kiosk/file-info?pin=... → kiosk.js → db.js → metadata
Kiosk Terminal → GET /v1/kiosk/download?pin=... → kiosk.js → db.js → file stream + auto-delete
```

### Module responsibilities

| File | Role |
|------|------|
| `src/app.js` | Express setup, rate limiters, route definitions, 60s cleanup cron |
| `src/webhook.js` | Webhook verification handshake, HMAC-SHA256 signature check, document event processing |
| `src/whatsapp.js` | HTTP calls to Meta Graph API (send messages, download media) |
| `src/kiosk.js` | Token auth middleware, file-info and download handlers |
| `src/db.js` | SQLite layer — `pending_prints` table, PIN generation, expiry cleanup |
| `src/config.js` | Env var loading, `allowedNumbers` whitelist, startup validation |

### Storage

SQLite (`database.sqlite`, auto-created) with a single table `pending_prints(pin, filename, filepath, phone, created_at)`. Files are stored in `temp_files/` and deleted automatically after 10 minutes (via cleanup in `db.cleanupExpiredPrints`) or immediately on successful download.

### Security layers

1. **Webhook**: HMAC-SHA256 signature verified against `APP_SECRET` before any processing
2. **Kiosk endpoints**: `VERIFY_TOKEN` required in query param or `Authorization` header
3. **Rate limiting**: webhook 60 req/min, kiosk 30 req/15min
4. **Phone whitelist**: `allowedNumbers` in `config.js` (currently a single hardcoded number)

## Key quirks

- **Mexico phone numbers**: Meta sends `+521XXXXXXXXXX` (13 digits) for MX numbers; `webhook.js` strips the extra `1` to get `+52XXXXXXXXXX` (12 digits) before using the number as a reply target.
- **Accepted file types**: Only PDF, DOC, and DOCX are processed; other types receive an error reply.
- **ES Modules**: All files use `import`/`export` (`"type": "module"` in package.json). Do not use `require()`.
- **Reverse proxy**: `app.set('trust proxy', 1)` is enabled for Render/Heroku deployments where `X-Forwarded-For` carries the real IP.
