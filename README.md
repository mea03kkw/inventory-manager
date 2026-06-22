# HC R&amp;D Sample Library v2.0.1

Internal web application for managing sample inventory, checkout, and return tracking.

## Features

- Sample inventory management
- **Auto-generated SampleCode/SerialNum** from Brand + DateReceived
- **Master data dropdowns** for Category, Department, Storage Location
- **Live preview** of generated fields in the admin form
- Sample photo attachment (Admin: upload/replace/delete, auto-compressed to ≤300 KB)
- Checkout and return tracking
- Role-based access control (Admin / User)
- Responsive UI for desktop and mobile
- Internal operational workflow support

## Development Setup

PostgreSQL is required. The app no longer supports SQLite.

### PostgreSQL (required)

```bash
# 1. Start local PostgreSQL
docker compose up -d

# 2. Ensure .env points to local PostgreSQL (see .env.example)
#    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sample_library

# 3. Install dependencies and run
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

#### Resetting the local database

```bash
docker compose down -v
docker compose up -d
```

Then restart the app. `init_db()` recreates all tables and seeds the admin user.

> **Warning:** `DATABASE_URL` must only point to a local PostgreSQL instance (`localhost`/`127.0.0.1`/`::1`). The app refuses remote PostgreSQL hosts in non-production mode. Railway production runtime is exempt from this guard. Never use a Railway production database URL as `DATABASE_URL` for local development.

> `.env` is gitignored. Never commit secrets.

## Cloning Railway PostgreSQL into Local PostgreSQL for Testing

This workflow copies production data from Railway into your local Docker PostgreSQL for testing.

### Prerequisites

- Docker Compose PostgreSQL running locally (`docker compose up -d`)
- `pg_dump` and `pg_restore` installed on your machine
- `RAILWAY_DATABASE_URL` set in `.env` (the Railway production PostgreSQL URL)
- `DATABASE_URL` in `.env` pointing to the local Docker PostgreSQL

### Warning

- This is a **read-only operation** against Railway. No production data is modified.
- The restore **overwrites** the local PostgreSQL database. Run `docker compose down -v && docker compose up -d` first if you want a clean reset.
- **Never commit `RAILWAY_DATABASE_URL`** or dump files. The `tmp/` and `*.dump` patterns are in `.gitignore`.

### Workflow

```bash
# 1. Ensure local PostgreSQL is running
docker compose up -d

# 2. Set RAILWAY_DATABASE_URL in .env (never in code)
#    RAILWAY_DATABASE_URL=postgresql://user:pass@host:port/db

# 3. Run the clone script
python scripts/clone_railway_to_local.py

# 4. Restart the local app
python -m uvicorn main:app --reload
```

The script validates:
- It is not running on Railway itself
- The source URL is a remote host (not localhost)
- The target URL is a local host
- `pg_dump` and `pg_restore` are available
- The dump file is cleaned up after restore

## Authentication

### Production

- No default credentials are provided.
- All accounts must be created by Admin.
- Users should change their password on first login.

### Development

For local development, credentials are configured in `.env` via environment variables.
Do not use weak or default passwords in production.

Example `.env` values:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_this_to_a_strong_local_password
```

Never commit real credentials into the repository.

## API Routes Summary

### Master Data
- `GET /api/master/departments` — list active departments
- `GET /api/master/storage-locations` — list active storage racks
- `GET /api/master/categories` — list active categories

### Authentication
- `POST /api/auth/login`
- `POST /api/auth/logout`

### Sample Library
- `GET /api/items`
- `POST /api/items` (Admin)
- `PUT /api/items/{id}` (Admin)
- `DELETE /api/items/{id}` (Admin)

### Sample Photo Management
- `POST /api/items/{id}/photo` (Admin)
- `DELETE /api/items/{id}/photo` (Admin)
- `GET /api/items/{id}/photo` (Authenticated)

### Checkout / Return
- `POST /api/checkout`
- `POST /api/return`

### User Management
- Admin creates, updates, and disables users

## Security Notes

- Default credentials are not allowed in production.
- Passwords are hashed using bcrypt.
- API documentation should be disabled in production.
- Admin-only account creation is enforced.
- Ongoing hardening items include session security, CSRF protection, and audit logging.

## Version History

### V2.0.1
Focus: UX patch — checkout flow, session recovery, photo save reliability, dashboard alignment

- **Checkout modal**: borrower email auto-filled from session profile; client-side quantity validation with inline error and disabled submit on excess
- **Session expiry**: global fetch 401 interceptor shows "Session Expired" overlay with "Sign In" recovery; redundant error toasts suppressed when overlay is visible
- **Photo save feedback**: two-phase submit (record save → photo upload/delete) keeps modal open on photo failure; operation-specific retry button (Retry Upload / Retry Removal)
- **Rack Summary alignment**: changed from status-string-based counting (`Status = 'IN_STOCK'`) to quantity-state gating (`available_quantity > 0`), matching Dashboard Stats — fixes record-count mismatch for partially-checked-out samples
- Global version bumped from v2.0.0 → v2.0.1

### V2.0.0
Focus: sample identity redesign with auto-generated codes and master data

- **New schema**: added `sample_code`, `record_state`, `Environment` columns to inventory
- **Master data tables**: `department_master`, `storage_location_master`, `category_master` with seed data
- **Auto-generation**: SampleType derived from Brand (Philips → Philips, else Competitor), SampleCode = `[PHI|CMT][YYYY]-[XXXX]` (XXXX = DB id), SerialNum derived from SampleCode
- **Backend generation**: create and update endpoints recompute identity fields when Brand/DateReceived changes
- **Master data API**: endpoints for departments, storage locations, and categories
- **Admin form refactored**: grey read-only generated block + master data dropdowns + live preview
- **Front page columns**: ProductName, Brand, Category, Type, Rack, Status
- **Detail modal**: shows SampleCode, Box Number, and all new fields
- **DJ Jenny baseline import**: 231 sample rows imported with full normalization
- **Import safety**: production-host guard (`--allow-remote` flag required for remote DBs)
- **Unique constraints**: `uq_sample_code` and `uq_serial_num` (non-blocking on startup)
- **Startup robustness**: constraint creation wrapped in try/except with commit/rollback isolation
- Bumped version from v1.6.6 → v2.0.0

### V1.6.6
Focus: retire SQLite — PostgreSQL-only backend

- Removed all `if is_postgres(): ... else: aiosqlite` endpoint branches (54 sites)
- Removed `is_postgres()`, `placeholder()`, `_get_sync_db()` sqlite fallback
- Removed `aiosqlite` dependency; `DATABASE_URL` is now required
- Simplified `init_db()` to PostgreSQL-only DDL
- Updated README to remove SQLite setup instructions
- App now requires PostgreSQL for both development and production

### V1.6.5
Focus: safe Railway-to-local DB clone utility for testing

- Added `scripts/clone_railway_to_local.py` — manual utility to copy Railway PostgreSQL into local Docker PostgreSQL
- Added safety guards: refuses Railway runtime, validates source is remote, target is local
- Added `tmp/` and `*.dump` to `.gitignore` to prevent accidental dump commits
- Updated `.env.example` with clarified `RAILWAY_DATABASE_URL` documentation
- Documented clone workflow in README

### V1.6.4
Focus: PostgreSQL as default local development workflow

- Reordered README: PostgreSQL first as default, SQLite second as fallback
- Added `.env.example` for standardized onboarding
- Documented Docker Compose reset workflow
- Fixed README route naming: `/api/samples` → `/api/items`
- Fixed README auth examples: `DEV_ADMIN_USERNAME`/`DEV_ADMIN_PASSWORD` → `ADMIN_USERNAME`/`ADMIN_PASSWORD`

### V1.6.3
Focus: hotfix — prevent Railway production regression from local DB safety guard

- Fixed critical production regression: safety guard no longer blocks Railway startup (detected via `RAILWAY_SERVICE_ID`)
- Normalized `APP_ENV` with case-insensitive handling (`production`/`Production`/`PRODUCTION`)
- Gated `load_dotenv()` behind non-Railway check to prevent accidental `.env` loading in deployed environments
- Added `::1` (IPv6 loopback) to local PostgreSQL host whitelist

### V1.6.2
Focus: safe local PostgreSQL development

- Added `python-dotenv` for local `.env` loading
- Added whitelist-based safety guard that blocks remote PostgreSQL hosts in non-production mode
- Added `docker-compose.yml` for local PostgreSQL (Docker)
- Updated `.env` with local development values (production URL removed)
- Documented local PostgreSQL setup in README

### V1.6.1
Focus: Railway build fix and security cleanup

- Fixed Railway build failure by replacing exact Python pin `python-3.11.9` with `python-3.11` in `runtime.txt`
- Removed tracked sensitive files (`seed_dummy_inventory.py`, `SampleLibrary_Data.xlsx`) from repository
- Updated `.gitignore` to exclude Excel files and uploads directory
- Full-page V7 guest login entry replacing modal-only login
- Desktop table Photo column with 36x36 thumbnails
- Mobile card left-thumbnail photo preview (52x52)
- App renamed to "HC R&D Sample Library"
- Admin-mode body background changed to Philips blue
- Guest login micro-fixes: redundant hint removed, button/field reset on logout

### V1.5
Focus: single-photo attachment for samples

- Admin-only photo upload, replace, and delete
- Client-side Canvas-based image compression (target ≤300 KB)
- Server-side Pillow image validation and compression
- Compact photo section in existing Add/Edit Sample modal
- Desktop file picker and mobile camera capture support
- Photo thumbnail display in sample detail view
- Railway persistent volume storage for photo files
- Authenticated photo serving endpoint

### V1.4
Focus: documentation cleanup and release control

- Separated production and development authentication guidance
- Added structured Security Notes section
- Added formal Version History tracking in README
- Improved deployment and release documentation clarity

### V1.3
Focus: UI/UX and modal optimization

- Compact modal layout improvements
- Mobile modal scrolling improvements
- Checkout and Return modal refinement
- Table and spacing density improvements
- CSS adjustments for more consistent layout behavior

### V1.2
Focus: authentication and baseline security hardening

- Admin-only account creation
- Public registration disabled
- Password hashing with bcrypt
- Production API docs exposure removed

### V1.1
Focus: core business workflow

- Sample inventory CRUD
- Checkout and return workflow
- Basic role separation between Admin and User

### V1.0
Initial release

- Basic sample tracking system
- Initial UI and workflow foundation
- Early database-backed implementation

## Deployment Notes

- Hosted on Railway
- PostgreSQL database (production)
- Set `APP_ENV=production` on Railway for correct session cookie security (`https_only`) and production guard behavior. The PostgreSQL safety guard is automatically bypassed on Railway regardless, but `APP_ENV=production` is needed for other production hardening.
- `docker-compose.yml` provided for local PostgreSQL only — the app itself is not Dockerized
- Manual deploy is recommended for controlled release management

## Important

This system is intended for internal use only.

Ensure:
- strong passwords
- controlled repository access
- secure environment variable handling