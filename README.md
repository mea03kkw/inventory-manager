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

Result: Database persists across redeploys — data is stored in Railway's PostgreSQL service, not the container filesystem.

## API Routes

- `GET /api/items` — list all items
- `POST /api/items` — create item (JSON body includes any of the 19 string fields: Title, SerialNum, SampleType, ProductName, Brand, Model, Category, SubCategory, DepartmentOwner, Condition, DateReceived, StorageLocationCode, UnitCount, UnitMeasure, Status, PhotoLink, Notes, Column1, Attachments; plus optional `item_number` and `value` which default to 0/false)
- `PUT /api/items/{id}` — update item (partial update supported; send any subset of fields)
- `DELETE /api/items/{id}` — delete item
- `GET /health` — health check
