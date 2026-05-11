"""FastAPI backend for sample management application."""
# ============================================================================
# Imports & Configuration
# ============================================================================

import os
from typing import Optional, Tuple

from fastapi import FastAPI, Request, HTTPException, Depends
from starlette.middleware.sessions import SessionMiddleware
from starlette.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import aiosqlite
try:
    import psycopg2
except ImportError:
    psycopg2 = None


# ============================================================================
# Constants
# ============================================================================

ALL_FIELDS = [
    "Title",
    "SerialNum",
    "SampleType",
    "ProductName",
    "Brand",
    "Model",
    "Category",
    "SubCategory",
    "DepartmentOwner",
    "Condition",
    "DateReceived",
    "StorageLocationCode",
    "UnitCount",
    "UnitMeasure",
    "Column1",
    "Attachments",
    "Notes",
    "PhotoLink",
]


# ============================================================================
# Pydantic models
# ============================================================================

# ============================================================================
# Models
# ============================================================================


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    is_admin: bool


# ============================================================================
# Database utilities
# ============================================================================


# ============================================================================
# Database Helpers
# ============================================================================


def _get_sync_db():
    """Get a synchronous database connection (psycopg2 or sqlite3 for dev fallback)."""
    database_url = os.getenv("DATABASE_URL", "")
    if is_postgres():
        return psycopg2.connect(database_url)
    # For sync context, use sqlite3 instead of aiosqlite
    import sqlite3
    return sqlite3.connect("sample_management.db")


def is_postgres() -> bool:
    """Check if PostgreSQL is configured via DATABASE_URL."""
    database_url = os.getenv("DATABASE_URL", "")
    return database_url.startswith("postgres://") or database_url.startswith("postgresql://")


def placeholder() -> str:
    """Return the appropriate placeholder for the active database.

    Returns '%s' for PostgreSQL and '?' for SQLite.
    """
    return "%s" if is_postgres() else "?"


# ============================================================================
# Password utilities
# ============================================================================

# ============================================================================
# Auth Helpers
# ============================================================================

import hashlib
import secrets


def hash_password(password: str) -> Tuple[str, str]:
    """Hash a password with a random salt using SHA-256.

    Returns a tuple of (password_hash_hex, salt_hex).
    """
    salt = secrets.token_hex(32)
    salted = salt + password
    password_hash = hashlib.sha256(salted.encode("utf-8")).hexdigest()
    return password_hash, salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    """Verify a password against a stored hash and salt."""
    salted = salt + password
    computed = hashlib.sha256(salted.encode("utf-8")).hexdigest()
    return computed == password_hash


# ============================================================================
# Auth utilities
# ============================================================================


async def get_current_user(request: Request) -> Optional[UserOut]:
    """Get the currently authenticated user from the session.

    Reads user_id from session, loads the user from the users table,
    and returns a UserOut object. If the user does not exist or is
    inactive, clears the session and returns None.
    """
    user_id = request.session.get("user_id")
    if user_id is None:
        return None

    database_url = os.getenv("DATABASE_URL", "")
    if is_postgres():
        # psycopg2: use sync in threadpool
        def _query():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            cur.execute("SELECT id, username, display_name, is_admin, is_active FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            conn.close()
            return row
        row = await run_in_threadpool(_query)
    else:
        # aiosqlite
        conn = await aiosqlite.connect("sample_management.db")
        cur = await conn.cursor()
        await cur.execute("SELECT id, username, display_name, is_admin, is_active FROM users WHERE id = ?", (user_id,))
        row = await cur.fetchone()
        await conn.close()

    if row is None:
        request.session.clear()
        return None

    user_id_val, username, display_name, is_admin, is_active = row
    if not is_active:
        request.session.clear()
        return None

    return UserOut(
        id=user_id_val,
        username=username,
        display_name=display_name or "",
        is_admin=bool(is_admin),
    )


# ============================================================================
# FastAPI application
# ============================================================================

app = FastAPI(
    title="Sample Management API",
    description="Backend for sample inventory and checkout tracking.",
    version="1.0.0",
)

SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-secret-change-in-production")

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie="session",
    max_age=None,
)

# ============================================================================
# Static File Serving
# ============================================================================

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")


# ============================================================================
# Root route - serve frontend
# ============================================================================

@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the main index.html."""
    with open("static/index.html") as f:
        return f.read()


# ============================================================================
# Startup event - database initialization
# ============================================================================

@app.on_event("startup")
def init_db():
    conn = _get_sync_db()
    cur = conn.cursor()

    # Create users table if not exists
    if is_postgres():
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                salt VARCHAR(64) NOT NULL,
                display_name TEXT DEFAULT '',
                is_admin BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
    else:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                display_name TEXT DEFAULT '',
                is_admin INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

    # Seed minimal development users if table is empty
    cur.execute("SELECT COUNT(*) FROM users")
    user_count = cur.fetchone()[0]
    if user_count == 0:
        # Development seed accounts — DO NOT use in production
        dev_accounts = [
            ("admin", "admin123", True, "System Administrator"),
            ("user", "user123", False, "Regular User"),
        ]
        for username, password, is_admin, display in dev_accounts:
            ph, salt_val = hash_password(password)
            ph_placeholder = placeholder()
            salt_placeholder = placeholder()
            cur.execute(
                f"""INSERT INTO users (username, password_hash, salt, display_name, is_admin, is_active)
                   VALUES ({ph_placeholder}, {ph_placeholder}, {ph_placeholder}, {ph_placeholder}, {ph_placeholder}, {ph_placeholder})""",
                (username, ph, salt_val, display, is_admin, True),
            )
            print(f"[INIT] Seeded dev account: {username} / {password}")

    # Create inventory and checkout_records tables
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
        cur.execute('ALTER TABLE inventory ADD COLUMN IF NOT EXISTS "Status" TEXT DEFAULT \'IN_STOCK\'')
        cur.execute("""
            CREATE TABLE IF NOT EXISTS checkout_records (
                id SERIAL PRIMARY KEY,
                sample_id INTEGER NOT NULL REFERENCES inventory(id),
                borrower_name TEXT NOT NULL DEFAULT '',
                borrower_department TEXT NOT NULL DEFAULT '',
                borrower_email TEXT NOT NULL DEFAULT '',
                checkout_date TEXT NOT NULL DEFAULT '',
                expected_return_date TEXT NOT NULL DEFAULT '',
                actual_return_date TEXT NOT NULL DEFAULT '',
                checkout_remarks TEXT NOT NULL DEFAULT '',
                return_remarks TEXT NOT NULL DEFAULT '',
                checkout_status TEXT NOT NULL DEFAULT 'OUT',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sample_title TEXT,
                sample_serial TEXT,
                sample_type TEXT,
                storage_location_code TEXT DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Add missing columns for existing checkout_records tables
        cur.execute('ALTER TABLE checkout_records ADD COLUMN IF NOT EXISTS sample_title TEXT')
        cur.execute('ALTER TABLE checkout_records ADD COLUMN IF NOT EXISTS sample_serial TEXT')
        cur.execute('ALTER TABLE checkout_records ADD COLUMN IF NOT EXISTS sample_type TEXT')
        cur.execute('ALTER TABLE checkout_records ADD COLUMN IF NOT EXISTS storage_location_code TEXT DEFAULT \'\'')
        cur.execute('ALTER TABLE checkout_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
    else:
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='checkout_records'")
        has_checkout = cur.fetchone() is not None
        if not has_checkout:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS inventory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_number INTEGER NOT NULL DEFAULT 0,
                    value INTEGER NOT NULL CHECK (value IN (0, 1)) DEFAULT 0,
                    Title TEXT,
                    SerialNum TEXT,
                    SampleType TEXT,
                    ProductName TEXT,
                    Brand TEXT,
                    Model TEXT,
                    Category TEXT,
                    SubCategory TEXT,
                    DepartmentOwner TEXT,
                    Condition TEXT,
                    DateReceived TEXT,
                    StorageLocationCode TEXT,
                    UnitCount TEXT,
                    UnitMeasure TEXT,
                    Status TEXT DEFAULT 'IN_STOCK',
                    PhotoLink TEXT,
                    Notes TEXT,
                    Column1 TEXT,
                    Attachments TEXT
                )
            """)
        else:
            cur.execute("PRAGMA table_info(inventory)")
            existing = {row[1] for row in cur.fetchall()}
            for field in ALL_FIELDS:
                if field not in existing:
                    cur.execute(f'ALTER TABLE inventory ADD COLUMN "{field}" TEXT')
            if "Status" not in existing:
                cur.execute('ALTER TABLE inventory ADD COLUMN "Status" TEXT DEFAULT "IN_STOCK"')
        cur.execute("""
            CREATE TABLE IF NOT EXISTS checkout_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sample_id INTEGER NOT NULL REFERENCES inventory(id),
                borrower_name TEXT NOT NULL DEFAULT '',
                borrower_department TEXT NOT NULL DEFAULT '',
                borrower_email TEXT NOT NULL DEFAULT '',
                checkout_date TEXT NOT NULL DEFAULT '',
                expected_return_date TEXT NOT NULL DEFAULT '',
                actual_return_date TEXT NOT NULL DEFAULT '',
                checkout_remarks TEXT NOT NULL DEFAULT '',
                return_remarks TEXT NOT NULL DEFAULT '',
                checkout_status TEXT NOT NULL DEFAULT 'OUT',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sample_title TEXT,
                sample_serial TEXT,
                sample_type TEXT,
                storage_location_code TEXT DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Add missing columns for existing checkout_records tables
        for col in ["sample_title", "sample_serial", "sample_type", "storage_location_code", "updated_at"]:
            try:
                cur.execute(f'ALTER TABLE checkout_records ADD COLUMN "{col}" TEXT')
            except Exception:
                pass
    conn.commit()
    conn.close()


# ============================================================================
# Ensure database is initialized on import (for TestClient/script usage)
# This serves as a fallback in addition to the @app.on_event("startup") hook
# ============================================================================

if os.getenv("RUN_INIT_DB_ON_IMPORT", "1") == "1":
    try:
        init_db()
    except Exception as e:
        print(f"[WARN] init_db on import failed: {e}")


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return JSONResponse({"status": "ok"})


# ============================================================================
# Auth Routes
# ============================================================================

@app.post("/api/auth/login")
async def login(request: Request, payload: LoginRequest):
    """Authenticate a user and create a session."""
    database_url = os.getenv("DATABASE_URL", "")
    if is_postgres():
        def _query():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            cur.execute(
                "SELECT id, username, password_hash, salt, display_name, is_admin, is_active FROM users WHERE username = %s",
                (payload.username,),
            )
            row = cur.fetchone()
            conn.close()
            return row
        row = await run_in_threadpool(_query)
    else:
        conn = await aiosqlite.connect("sample_management.db")
        cur = await conn.cursor()
        await cur.execute(
            "SELECT id, username, password_hash, salt, display_name, is_admin, is_active FROM users WHERE username = ?",
            (payload.username,),
        )
        row = await cur.fetchone()
        await conn.close()

    if row is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user_id, username, password_hash, salt, display_name, is_admin, is_active = row
    if not is_active:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not verify_password(payload.password, password_hash, salt):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    request.session["user_id"] = user_id

    return JSONResponse({
        "id": user_id,
        "username": username,
        "display_name": display_name or "",
        "is_admin": bool(is_admin),
    })


@app.post("/api/auth/logout")
async def logout(request: Request):
    """Clear the session and log the user out."""
    request.session.clear()
    return JSONResponse({"status": "ok"})


@app.get("/api/auth/me")
async def get_me(request: Request):
    """Return the currently authenticated user."""
    user = await get_current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


# ============================================================================
# Item CRUD Routes
# ============================================================================

@app.get("/api/items")
async def list_items(
    search: Optional[str] = None,
    status: Optional[str] = None,
    rack: Optional[str] = None,
):
    """List inventory items with optional search, status, and rack filters."""
    database_url = os.getenv("DATABASE_URL", "")
    if is_postgres():
        def _query():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            sql = """
                SELECT i.*,
                       cr.borrower_name AS current_borrower_name,
                       cr.expected_return_date AS current_expected_return_date
                FROM inventory i
                LEFT JOIN checkout_records cr
                  ON cr.sample_id = i.id AND cr.checkout_status = 'OUT'
                WHERE 1=1
            """
            params = []
            if search:
                sql += " AND (i.title ILIKE %s OR i.serialnum ILIKE %s OR i.sampletype ILIKE %s)"
                like = f"%{search}%"
                params.extend([like, like, like])
            if status:
                sql += " AND i.status = %s"
                params.append(status)
            if rack:
                sql += " AND i.storagelocationcode = %s"
                params.append(rack)
            cur.execute(sql, params)
            rows = cur.fetchall()
            col_names = [d[0].lower() for d in cur.description]
            result = [dict(zip(col_names, row)) for row in rows]
            conn.close()
            return result
        items = await run_in_threadpool(_query)
    else:
        conn = await aiosqlite.connect("sample_management.db")
        conn.row_factory = aiosqlite.Row
        cur = await conn.cursor()
        sql = """
            SELECT i.*,
                   cr.borrower_name AS current_borrower_name,
                   cr.expected_return_date AS current_expected_return_date
            FROM inventory i
            LEFT JOIN checkout_records cr
              ON cr.sample_id = i.id AND cr.checkout_status = 'OUT'
            WHERE 1=1
        """
        params = []
        if search:
            sql += " AND (i.Title LIKE ? OR i.SerialNum LIKE ? OR i.SampleType LIKE ?)"
            like = f"%{search}%"
            params.extend([like, like, like])
        if status:
            sql += " AND i.Status = ?"
            params.append(status)
        if rack:
            sql += " AND i.StorageLocationCode = ?"
            params.append(rack)
        await cur.execute(sql, params)
        rows = await cur.fetchall()
        items = [dict(row) for row in rows]
        await conn.close()

    return items


@app.get("/api/items/{item_id}")
async def get_item(item_id: int):
    """Get a single item with current checkout info and checkout history."""
    database_url = os.getenv("DATABASE_URL", "")
    if is_postgres():
        def _query():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            # Current item
            sql = """
                SELECT i.*,
                       cr.borrower_name AS current_borrower_name,
                       cr.borrower_department AS current_borrower_department,
                       cr.borrower_email AS current_borrower_email,
                       cr.expected_return_date AS current_expected_return_date
                FROM inventory i
                LEFT JOIN checkout_records cr
                  ON cr.sample_id = i.id AND cr.checkout_status = 'OUT'
                WHERE i.id = %s
            """
            cur.execute(sql, (item_id,))
            row = cur.fetchone()
            if not row:
                conn.close()
                return None
            col_names = [d[0].lower() for d in cur.description]
            item = dict(zip(col_names, row))
            # Checkout history
            cur.execute("""
                SELECT sample_title, sample_serial, sample_type,
                       borrower_name, borrower_department, borrower_email,
                       checkout_date, expected_return_date, actual_return_date,
                       checkout_status, checkout_remarks, return_remarks
                FROM checkout_records
                WHERE sample_id = %s
                ORDER BY checkout_date DESC
            """, (item_id,))
            history_rows = cur.fetchall()
            history_cols = [d[0].lower() for d in cur.description]
            item['checkout_history'] = [dict(zip(history_cols, hr)) for hr in history_rows]
            conn.close()
            return item
        item = await run_in_threadpool(_query)
        if item is None:
            raise HTTPException(status_code=404, detail="Item not found")
    else:
        conn = await aiosqlite.connect("sample_management.db")
        conn.row_factory = aiosqlite.Row
        cur = await conn.cursor()
        # Current item
        sql = """
            SELECT i.*,
                   cr.borrower_name AS current_borrower_name,
                   cr.borrower_department AS current_borrower_department,
                   cr.borrower_email AS current_borrower_email,
                   cr.expected_return_date AS current_expected_return_date
            FROM inventory i
            LEFT JOIN checkout_records cr
              ON cr.sample_id = i.id AND cr.checkout_status = 'OUT'
            WHERE i.id = ?
        """
        await cur.execute(sql, (item_id,))
        row = await cur.fetchone()
        if not row:
            await conn.close()
            raise HTTPException(status_code=404, detail="Item not found")
        item = dict(row)
        # Checkout history
        await cur.execute("""
            SELECT sample_title, sample_serial, sample_type,
                   borrower_name, borrower_department, borrower_email,
                   checkout_date, expected_return_date, actual_return_date,
                   checkout_status, checkout_remarks, return_remarks
            FROM checkout_records
            WHERE sample_id = ?
            ORDER BY checkout_date DESC
        """, (item_id,))
        history_rows = await cur.fetchall()
        item['checkout_history'] = [dict(row) for row in history_rows]
        await conn.close()

    return item


# ============================================================================
# Write Item Endpoints
# ============================================================================

class ItemIn(BaseModel):
    """Input model for creating/updating items."""
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
    Column1: Optional[str] = None
    Attachments: Optional[str] = None
    Notes: Optional[str] = None
    PhotoLink: Optional[str] = None
    Status: Optional[str] = None


@app.post("/api/items")
async def create_item(request: Request, payload: ItemIn):
    """Create a new inventory item."""
    # Role protection: only admin can create items
    user = await get_current_user(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    # Block creation with CHECKED_OUT status
    if payload.Status == "CHECKED_OUT":
        raise HTTPException(
            status_code=400,
            detail="Cannot create item with Status=CHECKED_OUT. Use checkout flow instead."
        )

    status = payload.Status or "IN_STOCK"

    # Build dynamic SQL for all fields
    field_list = [f for f in ALL_FIELDS]
    placeholders = []
    values = []

    if is_postgres():
        placeholders = ["%s"] * (len(field_list) + 1)
    else:
        placeholders = ["?"] * (len(field_list) + 1)

    for field in field_list:
        values.append(getattr(payload, field, None))

    values.append(status)

    field_sql = ", ".join([f'"{f}"' for f in field_list] + ["Status"])
    placeholder_sql = ", ".join(placeholders)

    database_url = os.getenv("DATABASE_URL", "")
    if is_postgres():
        def _query():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            cur.execute(f"INSERT INTO inventory ({field_sql}) VALUES ({placeholder_sql}) RETURNING id", values)
            item_id = cur.fetchone()[0]
            conn.commit()
            conn.close()
            return item_id
        item_id = await run_in_threadpool(_query)
    else:
        conn = await aiosqlite.connect("sample_management.db")
        cur = await conn.cursor()
        await cur.execute(f"INSERT INTO inventory ({field_sql}) VALUES ({placeholder_sql})", values)
        item_id = cur.lastrowid
        await conn.commit()
        await conn.close()

    return JSONResponse({"id": item_id, "Status": status}, status_code=201)


@app.put("/api/items/{item_id}")
async def update_item(request: Request, item_id: int, payload: ItemIn):
    """Update an existing inventory item. Does not allow setting Status=CHECKED_OUT."""
    # Role protection: only admin can update items
    user = await get_current_user(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    # Block direct status transition to CHECKED_OUT
    if payload.Status == "CHECKED_OUT":
        raise HTTPException(
            status_code=400,
            detail="Cannot set Status=CHECKED_OUT directly. Use checkout flow instead."
        )

    database_url = os.getenv("DATABASE_URL", "")
    existing = None

    if is_postgres():
        def _check():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            cur.execute("SELECT id FROM inventory WHERE id = %s", (item_id,))
            row = cur.fetchone()
            conn.close()
            return row
        existing = await run_in_threadpool(_check)
    else:
        conn = await aiosqlite.connect("sample_management.db")
        cur = await conn.cursor()
        await cur.execute("SELECT id FROM inventory WHERE id = ?", (item_id,))
        existing = await cur.fetchone()
        await conn.close()

    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")

    # Build update SQL for fields that are provided
    updates = []
    values = []
    ph = placeholder()

    for field in ALL_FIELDS:
        val = getattr(payload, field, None)
        if val is not None:
            updates.append(f'"{field}" = {ph}')
            values.append(val)

    if payload.Status is not None:
        updates.append('Status = ' + ph)
        values.append(payload.Status)

    if not updates:
        return JSONResponse({"id": item_id})

    values.append(item_id)
    set_clause = ", ".join(updates)

    if is_postgres():
        def _query():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            cur.execute(f"UPDATE inventory SET {set_clause} WHERE id = %s", values)
            conn.commit()
            conn.close()
            return True
        await run_in_threadpool(_query)
    else:
        conn = await aiosqlite.connect("sample_management.db")
        cur = await conn.cursor()
        await cur.execute(f"UPDATE inventory SET {set_clause} WHERE id = ?", values)
        await conn.commit()
        await conn.close()

    return JSONResponse({"id": item_id})


@app.delete("/api/items/{item_id}")
async def delete_item(request: Request, item_id: int):
    """Delete an inventory item. Blocked if item has active checkout records."""
    # Role protection: only admin can delete items
    user = await get_current_user(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    database_url = os.getenv("DATABASE_URL", "")

    if is_postgres():
        def _check_and_delete():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            # Check for active checkout records (OUT status)
            cur.execute("SELECT COUNT(*) FROM checkout_records WHERE sample_id = %s AND checkout_status = 'OUT'", (item_id,))
            active_count = cur.fetchone()[0]
            if active_count > 0:
                conn.close()
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot delete item: item has {active_count} active checkout record(s). Return item first."
                )
            # Check item exists
            cur.execute("SELECT id FROM inventory WHERE id = %s", (item_id,))
            if not cur.fetchone():
                conn.close()
                raise HTTPException(status_code=404, detail="Item not found")
            # Delete returned checkout records (if any) to avoid foreign key issues
            cur.execute("DELETE FROM checkout_records WHERE sample_id = %s AND checkout_status = 'RETURNED'", (item_id,))
            # Delete the item
            cur.execute("DELETE FROM inventory WHERE id = %s", (item_id,))
            conn.commit()
            conn.close()
            return True
        await run_in_threadpool(_check_and_delete)
    else:
        conn = await aiosqlite.connect("sample_management.db")
        cur = await conn.cursor()
        # Check for active checkout records (OUT status)
        await cur.execute("SELECT COUNT(*) FROM checkout_records WHERE sample_id = ? AND checkout_status = 'OUT'", (item_id,))
        active_count = (await cur.fetchone())[0]
        if active_count > 0:
            await conn.close()
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete item: item has {active_count} active checkout record(s). Return item first."
            )
        # Check item exists
        await cur.execute("SELECT id FROM inventory WHERE id = ?", (item_id,))
        if not await cur.fetchone():
            await conn.close()
            raise HTTPException(status_code=404, detail="Item not found")
        # Delete returned checkout records (if any) to avoid foreign key issues
        await cur.execute("DELETE FROM checkout_records WHERE sample_id = ? AND checkout_status = 'RETURNED'", (item_id,))
        # Delete the item
        await cur.execute("DELETE FROM inventory WHERE id = ?", (item_id,))
        await conn.commit()
        await conn.close()

    return JSONResponse({"status": "deleted"})


# ============================================================================
# Pydantic models for checkout
# ============================================================================

class CheckoutIn(BaseModel):
    sample_id: int
    borrower_name: str
    borrower_department: str = ""
    borrower_email: str = ""
    expected_return_date: str = ""
    checkout_remarks: str = ""


class CheckoutReturnIn(BaseModel):
    actual_return_date: str = ""
    return_remarks: str = ""


# ============================================================================
# Checkout/Return Routes
# ============================================================================

@app.post("/api/checkout")
async def create_checkout(request: Request, payload: CheckoutIn):
    """Create a checkout record for a sample."""
    # Role protection: only authenticated users can checkout (assuming any logged in user can checkout)
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    # Borrower name is required
    if not payload.borrower_name or payload.borrower_name.strip() == "":
        raise HTTPException(
            status_code=400,
            detail="Borrower name is required"
        )
    database_url = os.getenv("DATABASE_URL", "")
    sample_id = payload.sample_id

    if is_postgres():
        def _checkout():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            # Verify item exists and is IN_STOCK
            cur.execute("SELECT Status, Title, SerialNum, SampleType, StorageLocationCode FROM inventory WHERE id = %s", (sample_id,))
            row = cur.fetchone()
            if not row:
                conn.close()
                raise HTTPException(status_code=404, detail="Sample not found")
            status, title, serial, stype, storage_loc = row
            if status != "IN_STOCK":
                conn.close()
                raise HTTPException(status_code=400, detail=f"Sample status is {status}, cannot checkout")
            # Create checkout record
            cur.execute("""
                INSERT INTO checkout_records (sample_id, borrower_name, borrower_department, borrower_email,
                    expected_return_date, checkout_remarks, checkout_status, sample_title, sample_serial, sample_type, storage_location_code, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, 'OUT', %s, %s, %s, %s, CURRENT_TIMESTAMP)
            """, (sample_id, payload.borrower_name, payload.borrower_department, payload.borrower_email,
                  payload.expected_return_date, payload.checkout_remarks, title, serial, stype, storage_loc))
            checkout_id = cur.lastrowid if hasattr(cur, 'lastrowid') else cur.fetchone()[0] if not cur.description else None
            # Update inventory status
            cur.execute("UPDATE inventory SET Status = 'CHECKED_OUT' WHERE id = %s", (sample_id,))
            conn.commit()
            conn.close()
            return True
        await run_in_threadpool(_checkout)
    else:
        conn = await aiosqlite.connect("sample_management.db")
        cur = await conn.cursor()
        # Verify item exists and is IN_STOCK
        await cur.execute("SELECT Status, Title, SerialNum, SampleType, StorageLocationCode FROM inventory WHERE id = ?", (sample_id,))
        row = await cur.fetchone()
        if not row:
            await conn.close()
            raise HTTPException(status_code=404, detail="Sample not found")
        status, title, serial, stype, storage_loc = row
        if status != "IN_STOCK":
            await conn.close()
            raise HTTPException(status_code=400, detail=f"Sample status is {status}, cannot checkout")
        # Create checkout record
        await cur.execute("""
            INSERT INTO checkout_records (sample_id, borrower_name, borrower_department, borrower_email,
                expected_return_date, checkout_remarks, checkout_status, sample_title, sample_serial, sample_type, storage_location_code, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'OUT', ?, ?, ?, ?, datetime('now'))
        """, (sample_id, payload.borrower_name, payload.borrower_department, payload.borrower_email,
              payload.expected_return_date, payload.checkout_remarks, title, serial, stype, storage_loc))
        # Update inventory status
        await cur.execute("UPDATE inventory SET Status = 'CHECKED_OUT' WHERE id = ?", (sample_id,))
        await conn.commit()
        await conn.close()

    return JSONResponse({"status": "ok"})


@app.put("/api/checkout/{record_id}/return")
async def return_checkout(request: Request, record_id: int, payload: CheckoutReturnIn):
    """Return a checked out sample."""
    # Role protection: only authenticated users can return items
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    database_url = os.getenv("DATABASE_URL", "")

    if is_postgres():
        def _return():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            # Verify checkout record exists and is OUT
            cur.execute("SELECT sample_id, checkout_status FROM checkout_records WHERE id = %s", (record_id,))
            row = cur.fetchone()
            if not row:
                conn.close()
                raise HTTPException(status_code=404, detail="Checkout record not found")
            sample_id, checkout_status = row
            if checkout_status != "OUT":
                conn.close()
                raise HTTPException(status_code=400, detail="Checkout record is not active")
            # Update checkout record
            cur.execute("""
                UPDATE checkout_records SET checkout_status = 'RETURNED',
                    actual_return_date = %s, return_remarks = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (payload.actual_return_date, payload.return_remarks, record_id))
            # Update inventory status
            cur.execute("UPDATE inventory SET Status = 'IN_STOCK' WHERE id = %s", (sample_id,))
            conn.commit()
            conn.close()
            return True
        await run_in_threadpool(_return)
    else:
        conn = await aiosqlite.connect("sample_management.db")
        cur = await conn.cursor()
        # Verify checkout record exists and is OUT
        await cur.execute("SELECT sample_id, checkout_status FROM checkout_records WHERE id = ?", (record_id,))
        row = await cur.fetchone()
        if not row:
            await conn.close()
            raise HTTPException(status_code=404, detail="Checkout record not found")
        sample_id, checkout_status = row
        if checkout_status != "OUT":
            await conn.close()
            raise HTTPException(status_code=400, detail="Checkout record is not active")
        # Update checkout record
        await cur.execute("""
            UPDATE checkout_records SET checkout_status = 'RETURNED',
                actual_return_date = ?, return_remarks = ?, updated_at = datetime('now')
            WHERE id = ?
        """, (payload.actual_return_date, payload.return_remarks, record_id))
        # Update inventory status
        await cur.execute("UPDATE inventory SET Status = 'IN_STOCK' WHERE id = ?", (sample_id,))
        await conn.commit()
        await conn.close()

    return JSONResponse({"status": "ok"})


@app.get("/api/checkout/records")
async def get_checkout_records(sample_id: Optional[int] = None):
    """Get checkout records, optionally filtered by sample_id."""
    database_url = os.getenv("DATABASE_URL", "")
    if is_postgres():
        def _query():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            if sample_id:
                cur.execute("""
                    SELECT id, sample_title, sample_serial, sample_type,
                           borrower_name, borrower_department, borrower_email,
                           checkout_date, expected_return_date, actual_return_date,
                           checkout_status, checkout_remarks, return_remarks
                    FROM checkout_records
                    WHERE sample_id = %s
                    ORDER BY checkout_date DESC
                """, (sample_id,))
            else:
                cur.execute("""
                    SELECT id, sample_title, sample_serial, sample_type,
                           borrower_name, borrower_department, borrower_email,
                           checkout_date, expected_return_date, actual_return_date,
                           checkout_status, checkout_remarks, return_remarks
                    FROM checkout_records
                    ORDER BY checkout_date DESC
                """)
            rows = cur.fetchall()
            col_names = [d[0].lower() for d in cur.description]
            result = [dict(zip(col_names, row)) for row in rows]
            conn.close()
            return result
        records = await run_in_threadpool(_query)
    else:
        conn = await aiosqlite.connect("sample_management.db")
        conn.row_factory = aiosqlite.Row
        cur = await conn.cursor()
        if sample_id:
            await cur.execute("""
                SELECT id, sample_title, sample_serial, sample_type,
                       borrower_name, borrower_department, borrower_email,
                       checkout_date, expected_return_date, actual_return_date,
                       checkout_status, checkout_remarks, return_remarks
                FROM checkout_records
                WHERE sample_id = ?
                ORDER BY checkout_date DESC
            """, (sample_id,))
        else:
            await cur.execute("""
                SELECT id, sample_title, sample_serial, sample_type,
                       borrower_name, borrower_department, borrower_email,
                       checkout_date, expected_return_date, actual_return_date,
                       checkout_status, checkout_remarks, return_remarks
                FROM checkout_records
                ORDER BY checkout_date DESC
            """)
        rows = await cur.fetchall()
        records = [dict(row) for row in rows]
        await conn.close()

    return records


@app.get("/api/checkout/overdue")
async def get_overdue_checkouts(request: Request):
    """Get overdue checkouts (status OUT with expected_return_date < today)."""
    user = await get_current_user(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    from datetime import date
    today = date.today().isoformat()
    database_url = os.getenv("DATABASE_URL", "")
    if is_postgres():
        def _query():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            cur.execute("""
                SELECT i.id, i.Title as sample_title, i.StorageLocationCode as storage_location_code,
                       cr.borrower_name, cr.borrower_department, cr.expected_return_date
                FROM checkout_records cr
                JOIN inventory i ON cr.sample_id = i.id
                WHERE cr.checkout_status = 'OUT' AND cr.expected_return_date < %s
            """, (today,))
            rows = cur.fetchall()
            col_names = [d[0].lower() for d in cur.description]
            result = [dict(zip(col_names, row)) for row in rows]
            conn.close()
            return result
        overdue = await run_in_threadpool(_query)
    else:
        conn = await aiosqlite.connect("sample_management.db")
        conn.row_factory = aiosqlite.Row
        cur = await conn.cursor()
        await cur.execute("""
            SELECT i.id, i.Title as sample_title, i.StorageLocationCode as storage_location_code,
                   cr.borrower_name, cr.borrower_department, cr.expected_return_date
            FROM checkout_records cr
            JOIN inventory i ON cr.sample_id = i.id
            WHERE cr.checkout_status = 'OUT' AND cr.expected_return_date < ?
        """, (today,))
        rows = await cur.fetchall()
        overdue = [dict(row) for row in rows]
        await conn.close()

    return overdue


# ============================================================================
# Dashboard Routes
# ============================================================================

@app.get("/api/dashboard/stats")
async def get_dashboard_stats(request: Request):
    """Get dashboard summary statistics."""
    user = await get_current_user(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    database_url = os.getenv("DATABASE_URL", "")
    if is_postgres():
        def _query():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            from datetime import date
            today = date.today().isoformat()
            # Total samples
            cur.execute("SELECT COUNT(*) FROM inventory")
            total = cur.fetchone()[0]
            # In stock
            cur.execute("SELECT COUNT(*) FROM inventory WHERE Status = 'IN_STOCK'")
            in_stock = cur.fetchone()[0]
            # Checked out
            cur.execute("SELECT COUNT(*) FROM inventory WHERE Status = 'CHECKED_OUT'")
            checked_out = cur.fetchone()[0]
            # Overdue
            cur.execute("SELECT COUNT(*) FROM checkout_records WHERE checkout_status = 'OUT' AND expected_return_date < %s", (today,))
            overdue = cur.fetchone()[0]
            # Lost
            cur.execute("SELECT COUNT(*) FROM inventory WHERE Status = 'LOST'")
            lost = cur.fetchone()[0]
            # Scrapped
            cur.execute("SELECT COUNT(*) FROM inventory WHERE Status = 'SCRAPPED'")
            scrapped = cur.fetchone()[0]
            conn.close()
            return {
                "total_samples": total,
                "in_stock": in_stock,
                "checked_out": checked_out,
                "overdue": overdue,
                "lost": lost,
                "scrapped": scrapped
            }
        return await run_in_threadpool(_query)
    else:
        conn = await aiosqlite.connect("sample_management.db")
        cur = await conn.cursor()
        from datetime import date
        today = date.today().isoformat()
        # Total
        await cur.execute("SELECT COUNT(*) FROM inventory")
        total = (await cur.fetchone())[0]
        # In stock
        await cur.execute("SELECT COUNT(*) FROM inventory WHERE Status = 'IN_STOCK'")
        in_stock = (await cur.fetchone())[0]
        # Checked out
        await cur.execute("SELECT COUNT(*) FROM inventory WHERE Status = 'CHECKED_OUT'")
        checked_out = (await cur.fetchone())[0]
        # Overdue
        await cur.execute("SELECT COUNT(*) FROM checkout_records WHERE checkout_status = 'OUT' AND expected_return_date < ?", (today,))
        overdue = (await cur.fetchone())[0]
        # Lost
        await cur.execute("SELECT COUNT(*) FROM inventory WHERE Status = 'LOST'")
        lost = (await cur.fetchone())[0]
        # Scrapped
        await cur.execute("SELECT COUNT(*) FROM inventory WHERE Status = 'SCRAPPED'")
        scrapped = (await cur.fetchone())[0]
        await conn.close()
        return {
            "total_samples": total,
            "in_stock": in_stock,
            "checked_out": checked_out,
            "overdue": overdue,
            "lost": lost,
            "scrapped": scrapped
        }


@app.get("/api/dashboard/rack-summary")
async def get_rack_summary(request: Request):
    """Get sample counts grouped by rack/storage location."""
    user = await get_current_user(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    database_url = os.getenv("DATABASE_URL", "")
    if is_postgres():
        def _query():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            cur.execute("""
                SELECT StorageLocationCode as rack,
                       COUNT(*) as total,
                       SUM(CASE WHEN Status = 'IN_STOCK' THEN 1 ELSE 0 END) as in_stock,
                       SUM(CASE WHEN Status = 'CHECKED_OUT' THEN 1 ELSE 0 END) as checked_out,
                       SUM(CASE WHEN Status = 'LOST' THEN 1 ELSE 0 END) as lost,
                       SUM(CASE WHEN Status = 'SCRAPPED' THEN 1 ELSE 0 END) as scrapped
                FROM inventory
                GROUP BY StorageLocationCode
                ORDER BY StorageLocationCode
            """)
            rows = cur.fetchall()
            col_names = [d[0] for d in cur.description]
            result = [dict(zip(col_names, row)) for row in rows]
            conn.close()
            return result
        return await run_in_threadpool(_query)
    else:
        conn = await aiosqlite.connect("sample_management.db")
        conn.row_factory = aiosqlite.Row
        cur = await conn.cursor()
        await cur.execute("""
            SELECT StorageLocationCode as rack,
                   COUNT(*) as total,
                   SUM(CASE WHEN Status = 'IN_STOCK' THEN 1 ELSE 0 END) as in_stock,
                   SUM(CASE WHEN Status = 'CHECKED_OUT' THEN 1 ELSE 0 END) as checked_out,
                   SUM(CASE WHEN Status = 'LOST' THEN 1 ELSE 0 END) as lost,
                   SUM(CASE WHEN Status = 'SCRAPPED' THEN 1 ELSE 0 END) as scrapped
            FROM inventory
            GROUP BY StorageLocationCode
            ORDER BY StorageLocationCode
        """)
        rows = await cur.fetchall()
        result = [dict(row) for row in rows]
        await conn.close()
        return result


@app.get("/api/dashboard/current-checkout")
async def get_dashboard_current_checkout(request: Request):
    """Get currently checked out samples for dashboard."""
    user = await get_current_user(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    database_url = os.getenv("DATABASE_URL", "")
    if is_postgres():
        def _query():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            cur.execute("""
                SELECT i.id, i.Title as sample_title, i.StorageLocationCode as storage_location_code,
                       cr.borrower_name, cr.borrower_department, cr.checkout_date, cr.expected_return_date
                FROM checkout_records cr
                JOIN inventory i ON cr.sample_id = i.id
                WHERE cr.checkout_status = 'OUT'
                ORDER BY cr.checkout_date DESC
            """)
            rows = cur.fetchall()
            col_names = [d[0] for d in cur.description]
            result = [dict(zip(col_names, row)) for row in rows]
            conn.close()
            return result
        return await run_in_threadpool(_query)
    else:
        conn = await aiosqlite.connect("sample_management.db")
        conn.row_factory = aiosqlite.Row
        cur = await conn.cursor()
        await cur.execute("""
            SELECT i.id, i.Title as sample_title, i.StorageLocationCode as storage_location_code,
                   cr.borrower_name, cr.borrower_department, cr.checkout_date, cr.expected_return_date
            FROM checkout_records cr
            JOIN inventory i ON cr.sample_id = i.id
            WHERE cr.checkout_status = 'OUT'
            ORDER BY cr.checkout_date DESC
        """)
        rows = await cur.fetchall()
        result = [dict(row) for row in rows]
        await conn.close()
        return result


@app.get("/api/dashboard/recent-returns")
async def get_dashboard_recent_returns(request: Request, limit: int = 10):
    """Get recent returned samples for dashboard."""
    user = await get_current_user(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    database_url = os.getenv("DATABASE_URL", "")
    if is_postgres():
        def _query():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            cur.execute("""
                SELECT i.Title as sample_title, cr.borrower_name, cr.borrower_department,
                       cr.actual_return_date, cr.checkout_date
                FROM checkout_records cr
                JOIN inventory i ON cr.sample_id = i.id
                WHERE cr.checkout_status = 'RETURNED'
                ORDER BY cr.actual_return_date DESC
                LIMIT %s
            """, (limit,))
            rows = cur.fetchall()
            col_names = [d[0] for d in cur.description]
            result = [dict(zip(col_names, row)) for row in rows]
            conn.close()
            return result
        return await run_in_threadpool(_query)
    else:
        conn = await aiosqlite.connect("sample_management.db")
        conn.row_factory = aiosqlite.Row
        cur = await conn.cursor()
        await cur.execute("""
            SELECT i.Title as sample_title, cr.borrower_name, cr.borrower_department,
                   cr.actual_return_date, cr.checkout_date
            FROM checkout_records cr
            JOIN inventory i ON cr.sample_id = i.id
            WHERE cr.checkout_status = 'RETURNED'
            ORDER BY cr.actual_return_date DESC
            LIMIT ?
        """, (limit,))
        rows = await cur.fetchall()
        result = [dict(row) for row in rows]
        await conn.close()
        return result

