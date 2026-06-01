# HC R&amp;D Sample Library

Internal web application for managing sample inventory, checkout, and return tracking.

## Features

- Sample inventory management
- Sample photo attachment (Admin: upload/replace/delete, auto-compressed to ≤300 KB)
- Checkout and return tracking
- Role-based access control (Admin / User)
- Responsive UI for desktop and mobile
- Internal operational workflow support

## Development Setup

PostgreSQL is the default local development database. SQLite is available as a fallback when PostgreSQL is not available.

### PostgreSQL (default, recommended)

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

### SQLite (fallback, no dependencies)

When PostgreSQL is not available, the app falls back to `sample_management.db` (SQLite) automatically if `DATABASE_URL` is unset or empty.

```bash
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

> `.env` is gitignored. Never commit secrets.

## Cloning Railway PostgreSQL into Local PostgreSQL for Testing

This workflow copies production data from Railway into your local Docker PostgreSQL for testing before Phase 3 (SQLite removal).

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