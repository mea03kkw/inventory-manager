from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
import sqlite3

try:
    import psycopg
    HAS_PSYCOPG = True
except ImportError:
    HAS_PSYCOPG = False

app = FastAPI()

class Item(BaseModel):
    item_number: int
    value: bool


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


@app.on_event("startup")
def init_db():
    conn = get_db()
    cur = conn.cursor()
    if is_postgres():
        cur.execute("""
            CREATE TABLE IF NOT EXISTS inventory (
                id SERIAL PRIMARY KEY,
                item_number INTEGER NOT NULL,
                value BOOLEAN NOT NULL
            )
        """)
    else:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_number INTEGER NOT NULL,
                value INTEGER NOT NULL CHECK (value IN (0, 1))
            )
        """)
    conn.commit()
    conn.close()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/items")
def get_items():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, item_number, value FROM inventory")
    rows = cur.fetchall()
    conn.close()
    return [{"id": r[0], "item_number": r[1], "value": bool(r[2])} for r in rows]


@app.post("/api/items")
def create_item(item: Item):
    conn = get_db()
    cur = conn.cursor()
    ph = placeholder()
    cur.execute(
        f"INSERT INTO inventory (item_number, value) VALUES ({ph}, {ph})",
        (item.item_number, item.value if is_postgres() else int(item.value))
    )
    conn.commit()
    conn.close()
    return {"status": "created"}


@app.put("/api/items/{item_id}")
def update_item(item_id: int, value: bool):
    conn = get_db()
    cur = conn.cursor()
    ph = placeholder()
    cur.execute(
        f"UPDATE inventory SET value={ph} WHERE id={ph}",
        (value if is_postgres() else int(value), item_id)
    )
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
    cur.execute(f"DELETE FROM inventory WHERE id={ph}", (item_id,))
    conn.commit()
    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found")
    conn.close()
    return {"status": "deleted"}


app.mount("/", StaticFiles(directory="static", html=True), name="static")
