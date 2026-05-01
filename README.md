# Inventory Manager (FastAPI)

Simple inventory CRUD app with static frontend.

## Local Development

### With SQLite (default)
```bash
pip install -r requirements.txt
uvicorn main:app --reload
```
Visit http://localhost:8000

### With Local PostgreSQL
```bash
export DATABASE_URL=postgresql://postgres:password@localhost:5432/inventory
pip install -r requirements.txt
uvicorn main:app --reload
```

## Railway Deployment

1. Create a new project on [Railway](https://railway.app).
2. Add a **PostgreSQL** service to the project.
3. Railway automatically injects `DATABASE_URL` into the environment.
4. Deploy the FastAPI app (no code changes needed).
5. The `/health` endpoint returns `{"status":"ok"}` for Railway liveness checks.

**Result:** Database persists across redeploys — data is stored in Railway's PostgreSQL service, not the container filesystem.

## API Routes

- `GET /api/items` — list all items
- `POST /api/items` — create item (JSON: `{"item_number": 1, "value": true}`)
- `PUT /api/items/{id}?value=true` — update item value
- `DELETE /api/items/{id}` — delete item
- `GET /health` — health check
