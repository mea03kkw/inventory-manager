from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import sqlite3

app = FastAPI()


def get_db():
    return sqlite3.connect("inventory.db")


class Item(BaseModel):
    item_number: int
    value: bool


@app.on_event("startup")
def init_db():
    """Create database table if it doesn't exist."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_number INTEGER NOT NULL,
            value INTEGER NOT NULL CHECK (value IN (0, 1))
        )
        """
    )
    conn.commit()
    conn.close()


@app.get("/api/hello")
def hello():
    return {"msg": "Hello from FastAPI"}


@app.get("/api/items")
def get_items():
    conn = get_db()
    cursor = conn.cursor()
    rows = cursor.execute("SELECT id, item_number, value FROM inventory").fetchall()
    conn.close()
    return [
        {"id": r[0], "item_number": r[1], "value": bool(r[2])}
        for r in rows
    ]


@app.post("/api/items")
def create_item(item: Item):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO inventory (item_number, value) VALUES (?, ?)",
        (item.item_number, int(item.value)),
    )
    conn.commit()
    conn.close()
    return {"status": "created"}


@app.put("/api/items/{item_id}")
def update_item(item_id: int, value: bool):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE inventory SET value=? WHERE id=?",
        (int(value), item_id),
    )
    conn.commit()
    conn.close()
    return {"status": "updated"}


@app.delete("/api/items/{item_id}")
def delete_item(item_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM inventory WHERE id=?", (item_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}


# Mount static files at the BOTTOM so /api routes are evaluated first
app.mount("/", StaticFiles(directory="static", html=True), name="static")