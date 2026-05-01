from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Optional
import os
import sqlite3

try:
    import psycopg
    HAS_PSYCOPG = True
except ImportError:
    HAS_PSYCOPG = False

app = FastAPI()

class InventoryItemCreate(BaseModel):
    Title: Optional[str] = ""
    SerialNum: Optional[str] = ""
    SampleType: Optional[str] = ""
    ProductName: Optional[str] = ""
    Brand: Optional[str] = ""
    Model: Optional[str] = ""
    Category: Optional[str] = ""
    SubCategory: Optional[str] = ""
    DepartmentOwner: Optional[str] = ""
    Condition: Optional[str] = ""
    DateReceived: Optional[str] = ""
    StorageLocationCode: Optional[str] = ""
    UnitCount: Optional[str] = ""
    UnitMeasure: Optional[str] = ""
    Status: Optional[str] = ""
    PhotoLink: Optional[str] = ""
    Notes: Optional[str] = ""
    Column1: Optional[str] = ""
    Attachments: Optional[str] = ""
    item_number: int = Field(default=0, alias="item_number")
    value: bool = Field(default=False, alias="value")


class InventoryItemOut(BaseModel):
    id: int
    Title: Optional[str] = ""
    SerialNum: Optional[str] = ""
    SampleType: Optional[str] = ""
    ProductName: Optional[str] = ""
    Brand: Optional[str] = ""
    Model: Optional[str] = ""
    Category: Optional[str] = ""
    SubCategory: Optional[str] = ""
    DepartmentOwner: Optional[str] = ""
    Condition: Optional[str] = ""
    DateReceived: Optional[str] = ""
    StorageLocationCode: Optional[str] = ""
    UnitCount: Optional[str] = ""
    UnitMeasure: Optional[str] = ""
    Status: Optional[str] = ""
    PhotoLink: Optional[str] = ""
    Notes: Optional[str] = ""
    Column1: Optional[str] = ""
    Attachments: Optional[str] = ""
    item_number: int = 0
    value: bool = False


class InventoryItemUpdate(BaseModel):
    Title: Optional[str] = None
    SerialNum: Optional[str] = None
    SampleType: Optional[str] = None
    ProductName: Optional[str] = None
    Brand: Optional[str] = None
    Model: Optional[str] = None
    Category: Optional[str] = None
    SubCategory: Optional[str] = None
    DepartmentOwner: Optional[str] = None
    Condition: Optional[str] = None
    DateReceived: Optional[str] = None
    StorageLocationCode: Optional[str] = None
    UnitCount: Optional[str] = None
    UnitMeasure: Optional[str] = None
    Status: Optional[str] = None
    PhotoLink: Optional[str] = None
    Notes: Optional[str] = None
    Column1: Optional[str] = None
    Attachments: Optional[str] = None
    item_number: Optional[int] = None
    value: Optional[bool] = None


def is_postgres():
    db_url = os.getenv("DATABASE_URL", "")
    return db_url.startswith("postgres://") or db_url.startswith("postgresql://")


def placeholder():
    return "%s" if is_postgres() else "?"


def get_db():
    if is_postgres():
        if not HAS_PSYCOPG:
            raise RuntimeError("DATABASE_URL set but psycopg not installed")
        return psycopg.connect(os.getenv("DATABASE_URL"))
    return sqlite3.connect("inventory.db", check_same_thread=False)


ALL_FIELDS = [
    "Title", "SerialNum", "SampleType", "ProductName", "Brand", "Model",
    "Category", "SubCategory", "DepartmentOwner", "Condition", "DateReceived",
    "StorageLocationCode", "UnitCount", "UnitMeasure", "Status", "PhotoLink",
    "Notes", "Column1", "Attachments"
]

LEGACY_FIELDS = ["item_number", "value"]


@app.on_event("startup")
def init_db():
    conn = get_db()
    cur = conn.cursor()
    if is_postgres():
        cur.execute("""
            CREATE TABLE IF NOT EXISTS inventory (
                id SERIAL PRIMARY KEY,
                item_number INTEGER NOT NULL DEFAULT 0,
                value BOOLEAN NOT NULL DEFAULT FALSE
            )
        """)
        for field in ALL_FIELDS:
            cur.execute(f'ALTER TABLE inventory ADD COLUMN IF NOT EXISTS "{field}" TEXT')
    else:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_number INTEGER NOT NULL DEFAULT 0,
                value INTEGER NOT NULL CHECK (value IN (0, 1)) DEFAULT 0
            )
        """)
        cur.execute("PRAGMA table_info(inventory)")
        existing = {row[1] for row in cur.fetchall()}
        for field in ALL_FIELDS:
            if field not in existing:
                cur.execute(f'ALTER TABLE inventory ADD COLUMN "{field}" TEXT')
    conn.commit()
    conn.close()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/items")
def get_items():
    conn = get_db()
    cur = conn.cursor()
    fields = ", ".join([f'"{f}"' for f in ALL_FIELDS])
    legacy = ", ".join(LEGACY_FIELDS)
    cur.execute(f"SELECT id, {legacy}, {fields} FROM inventory")
    rows = cur.fetchall()
    conn.close()
    result = []
    for r in rows:
        item = {
            "id": r[0],
            "item_number": r[1],
            "value": bool(r[2]),
        }
        for i, field in enumerate(ALL_FIELDS):
            item[field] = r[3 + i] if r[3 + i] is not None else ""
        result.append(item)
    return result


@app.post("/api/items")
def create_item(payload: InventoryItemCreate):
    conn = get_db()
    cur = conn.cursor()
    ph = placeholder()

    # Prepare values with SQLite-compatible conversion for value
    value_for_db = payload.value
    if not is_postgres():
        value_for_db = int(payload.value)

    all_columns = LEGACY_FIELDS + ALL_FIELDS
    placeholders = ", ".join([ph] * len(all_columns))

    values = [
        payload.item_number,
        value_for_db,
    ]
    for f in ALL_FIELDS:
        val = getattr(payload, f)
        values.append(val if val is not None else "")

    cols = ", ".join(['"item_number"', '"value"'] + [f'"{f}"' for f in ALL_FIELDS])

    cur.execute(
        f"INSERT INTO inventory ({cols}) VALUES ({placeholders})",
        tuple(values)
    )
    conn.commit()

    if is_postgres():
        cur.execute("SELECT CURRVAL('inventory_id_seq')")
    else:
        cur.execute("SELECT last_insert_rowid()")
    new_id = cur.fetchone()[0]
    conn.close()

    conn = get_db()
    cur = conn.cursor()
    ph = placeholder()
    fields_sel = ", ".join([f'"{f}"' for f in ALL_FIELDS])
    legacy_sel = ", ".join(LEGACY_FIELDS)
    cur.execute(f"SELECT id, {legacy_sel}, {fields_sel} FROM inventory WHERE id = {ph}", (new_id,))
    r = cur.fetchone()
    conn.close()
    item = {
        "id": r[0],
        "item_number": r[1],
        "value": bool(r[2]),
    }
    for i, field in enumerate(ALL_FIELDS):
        item[field] = r[3 + i] if r[3 + i] is not None else ""
    return item


@app.put("/api/items/{item_id}")
def update_item(item_id: int, payload: InventoryItemUpdate):
    conn = get_db()
    cur = conn.cursor()
    ph = placeholder()

    updates = []
    values = []

    if payload.item_number is not None:
        updates.append('"item_number" = ' + ph)
        values.append(payload.item_number)
    if payload.value is not None:
        value_for_db = payload.value
        if not is_postgres():
            value_for_db = int(payload.value)
        updates.append('"value" = ' + ph)
        values.append(value_for_db)

    for field in ALL_FIELDS:
        val = getattr(payload, field)
        if val is not None:
            updates.append(f'"{field}" = ' + ph)
            values.append(val)

    if not updates:
        conn.close()
        raise HTTPException(status_code=400, detail="No fields to update")

    values.append(item_id)
    sql = f"UPDATE inventory SET {', '.join(updates)} WHERE id = {ph}"
    cur.execute(sql, tuple(values))
    conn.commit()

    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found")

    conn.close()
    return {"status": "updated"}


@app.delete("/api/items/{item_id}")
def delete_item(item_id: int):
    conn = get_db()
    cur = conn.cursor()
    ph = placeholder()
    cur.execute(f"DELETE FROM inventory WHERE id = {ph}", (item_id,))
    conn.commit()
    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found")
    conn.close()
    return {"status": "deleted"}


app.mount("/", StaticFiles(directory="static", html=True), name="static")
