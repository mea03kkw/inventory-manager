# Sample Management API

FastAPI backend for sample inventory and checkout tracking with user authentication.

## Features

- **Sample Inventory**: Full CRUD operations for samples with 19 customizable fields
- **User Authentication**: Session-based auth with admin/user roles
- **Checkout System**: Track sample checkouts, returns, and history
- **Dashboard**: Admin-only statistics and rack summaries
- **Multi-database**: Supports SQLite (local) and PostgreSQL (production)

## Local Development

### With SQLite (default)
```bash
pip install -r requirements.txt
python -m uvicorn main:app --reload
```
Visit http://localhost:8000

### With Local PostgreSQL
```bash
export DATABASE_URL=postgresql://postgres:password@localhost:5432/sample_management
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

## Authentication

Default development accounts (passwords must be changed in production):
- `admin` / `admin123` (admin user)
- `user` / `user123` (regular user)

## API Routes

### Authentication
- `POST /api/auth/login` — Authenticate and create session
- `POST /api/auth/logout` — Clear session
- `GET /api/auth/me` — Get current user

### Samples
- `GET /api/items` — List samples (filters: `search`, `status`, `rack`)
- `GET /api/items/{id}` — Get sample with checkout history
- `POST /api/items` — Create sample (admin only)
- `PUT /api/items/{id}` — Update sample (admin only)
- `DELETE /api/items/{id}` — Delete sample (admin only)

### Checkout
- `POST /api/checkout` — Create checkout record
- `PUT /api/checkout/{id}/return` — Return a checked out sample
- `GET /api/checkout/records` — List checkout records (filter by `sample_id`)
- `GET /api/checkout/overdue` — Get overdue checkouts (admin only)

### Dashboard (Admin Only)
- `GET /api/dashboard/stats` — Summary statistics
- `GET /api/dashboard/rack-summary` — Samples by storage location
- `GET /api/dashboard/current-checkout` — Currently checked out samples
- `GET /api/dashboard/recent-returns` — Recent returns

### Health Check
- `GET /api/health` — Returns `{"status":"ok"}`
