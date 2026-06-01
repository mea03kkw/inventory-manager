"""FastAPI backend for sample management application."""

# ============================================================================
# Imports & Configuration
# ============================================================================

import os
from urllib.parse import urlparse
import uuid
from datetime import date, datetime, timedelta
from typing import Optional, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Depends, UploadFile, File
from starlette.middleware.sessions import SessionMiddleware
from starlette.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, HTMLResponse, Response, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    import psycopg2
except ImportError:
    psycopg2 = None
import csv
import io

# Railay detection and local .env loading
_IS_RAILWAY = bool(os.environ.get("RAILWAY_SERVICE_ID"))
if not _IS_RAILWAY:
    load_dotenv()

# ============================================================================
# Photo upload configuration
# ============================================================================

PHOTO_UPLOAD_DIR = os.getenv("PHOTO_UPLOAD_DIR", os.path.join(os.getcwd(), "uploads", "sample_photos"))
ALLOWED_PHOTO_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_PHOTO_SIZE_BYTES = 300 * 1024  # 300 KB

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

_FIELD_NORMALIZE_MAP = {
    "title": "Title",
    "serialnum": "SerialNum",
    "sampletype": "SampleType",
    "productname": "ProductName",
    "brand": "Brand",
    "model": "Model",
    "category": "Category",
    "subcategory": "SubCategory",
    "departmentowner": "DepartmentOwner",
    "condition": "Condition",
    "datereceived": "DateReceived",
    "storagelocationcode": "StorageLocationCode",
    "unitcount": "UnitCount",
    "unitmeasure": "UnitMeasure",
    "column1": "Column1",
    "attachments": "Attachments",
    "notes": "Notes",
    "photolink": "PhotoLink",
    "status": "Status",
}

PASSTHROUGH_KEYS = {
    "id", "item_number", "value",
    "current_borrower_name", "current_borrower_department",
    "current_borrower_email", "current_expected_return_date",
    "checkout_history", "sample_title", "sample_serial", "sample_type",
    "borrower_name", "borrower_department", "borrower_email",
    "checkout_date", "expected_return_date", "actual_return_date",
    "checkout_status", "checkout_remarks", "return_remarks",
    "storage_location_code", "created_at", "updated_at",
}

def _normalize_item_row(row_dict):
    """Normalize a DB row dict to PascalCase keys matching ALL_FIELDS + Status.
    
    Railway PostgreSQL currently contains both legacy "Status" (PascalCase)
    and live lowercase "status". Lowercase "status" is the source of truth
    and must override stale legacy "Status" in normalized responses.
    """
    normalized = {}
    pass_through = {}
    for key, value in row_dict.items():
        if key in ALL_FIELDS or key == "Status" or key in PASSTHROUGH_KEYS:
            if key not in normalized or (normalized.get(key) is None and value is not None):
                normalized[key] = value
            continue
        mapped = _FIELD_NORMALIZE_MAP.get(key.lower() if key else "")
        if mapped:
            if mapped not in normalized or (normalized.get(mapped) is None and value is not None) or mapped == "Status":
                normalized[mapped] = value
        else:
            pass_through[key] = value
    normalized.update(pass_through)
    return normalized

# ============================================================================
# Pydantic models
# ============================================================================

# ============================================================================
# Models
# ============================================================================

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    email: str
    password: str

class UserUpdateIn(BaseModel):
    email: Optional[str] = None
    display_name: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None

class UserPasswordResetIn(BaseModel):
    new_password: str

class AdminCreateUserIn(BaseModel):
    email: str
    role: str = "user"

class AdminContactIn(BaseModel):
    email: str

class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str
    confirm_password: str

class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    email: str = ""
    is_admin: bool
    must_change_password: bool = False

# ============================================================================
# Database utilities
# ============================================================================

# ============================================================================
# Database Helpers
# ============================================================================

def _get_sync_db():
    """Get a synchronous PostgreSQL database connection."""
    database_url = _get_db_url()
    return psycopg2.connect(database_url)

def _get_db_url() -> str:
    """Get the DATABASE_URL with normalized scheme (postgres:// -> postgresql://).

    Raises RuntimeError if DATABASE_URL is not set — PostgreSQL is required.
    In non-production / non-Railway environments, rejects non-local PostgreSQL
    hosts to prevent accidental connection to remote/production databases.
    """
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. PostgreSQL is required. "
            "Set DATABASE_URL to a local PostgreSQL instance "
            "(e.g., postgresql://postgres:postgres@localhost:5432/sample_library) "
            "or start the local Docker PostgreSQL with: docker compose up -d"
        )
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    _is_prod = APP_ENV == "production" or (_IS_RAILWAY and not _APP_ENV_RAW)
    if url and not _is_prod:
        parsed = urlparse(url)
        allowed_hosts = {"localhost", "127.0.0.1", "::1", "db", "postgres"}
        if parsed.hostname and parsed.hostname not in allowed_hosts:
            raise RuntimeError(
                f"Refusing to connect to remote PostgreSQL host '{parsed.hostname}' "
                "in non-production mode. "
                "Set DATABASE_URL to a local PostgreSQL instance (localhost/127.0.0.1/::1)."
            )

    return url

def _safe_pg_query(query_fn):
    """Run a PostgreSQL query function via thread pool with error hardening."""
    async def _wrapper():
        try:
            return await run_in_threadpool(query_fn)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return _wrapper()

def _parse_unit_count(value) -> int:
    """Parse UnitCount into a safe positive integer. Fallback to 1."""
    if value is None:
        return 1
    try:
        parsed = int(str(value).strip())
        return parsed if parsed > 0 else 1
    except (TypeError, ValueError):
        return 1

# ============================================================================
# Photo file helpers
# ============================================================================

def _ensure_upload_dir():
    os.makedirs(PHOTO_UPLOAD_DIR, exist_ok=True)

def _safe_photo_filename(sample_id: int) -> str:
    unique_id = uuid.uuid4().hex[:8]
    return f"sample_{sample_id}_{unique_id}.jpg"

def _validate_and_compress_image(file_bytes: bytes) -> Optional[bytes]:
    from PIL import Image
    try:
        img = Image.open(io.BytesIO(file_bytes))
        img.verify()
        img = Image.open(io.BytesIO(file_bytes))
        img = img.convert("RGB")
    except Exception:
        return None
    max_width = 1280
    if img.width > max_width:
        ratio = max_width / img.width
        new_size = (max_width, int(img.height * ratio))
        img = img.resize(new_size, Image.LANCZOS)
    if len(file_bytes) <= MAX_PHOTO_SIZE_BYTES:
        output = io.BytesIO()
        img.save(output, format="JPEG", quality=90)
        if output.tell() <= MAX_PHOTO_SIZE_BYTES:
            return output.getvalue()
    quality = 85
    while quality >= 20:
        output = io.BytesIO()
        img.save(output, format="JPEG", quality=quality)
        if output.tell() <= MAX_PHOTO_SIZE_BYTES:
            return output.getvalue()
        quality -= 5
    return None

def _delete_photo_file(photo_path: str):
    if photo_path and os.path.exists(photo_path):
        try:
            os.remove(photo_path)
        except OSError:
            pass

# ============================================================================
# Auth Helpers
# ============================================================================

import bcrypt
import secrets

def hash_password(password: str) -> Tuple[str, str]:
    """Hash a password with bcrypt.

    Returns (password_hash_str, salt_str).
    bcrypt embeds the salt in the hash, so salt is returned as empty string.
    """
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8"), ""

def is_bcrypt_hash(stored_hash: str) -> bool:
    """Check if a stored hash is bcrypt format ($2b$ prefix)."""
    return stored_hash.startswith("$2b$") or stored_hash.startswith("$2a$") or stored_hash.startswith("$2y$")

def verify_password(password: str, password_hash: str, salt: str) -> bool:
    """Verify a password against a stored hash.

    Supports bcrypt hashes (current) and legacy SHA-256+salt hashes (migration).
    """
    if is_bcrypt_hash(password_hash):
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))

    # Legacy SHA-256+salt fallback (for migration)
    import hashlib
    salted = salt + password
    computed = hashlib.sha256(salted.encode("utf-8")).hexdigest()
    return computed == password_hash

def generate_temp_password(length: int = 12) -> str:
    """Generate a secure random temporary password.
    
    Includes uppercase, lowercase, and digits.
    Length defaults to 12 characters.
    """
    import string as str_mod
    alphabet = str_mod.ascii_letters + str_mod.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

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

    database_url = _get_db_url()
    # psycopg2: use sync in threadpool
    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT id, username, display_name, email, is_admin, is_active, must_change_password FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        conn.close()
        return row
    row = await run_in_threadpool(_query)
    if row is None:
        request.session.clear()
        return None

    user_id_val, username, display_name, email, is_admin, is_active, must_change_password = row
    if not is_active:
        request.session.clear()
        return None

    return UserOut(
        id=user_id_val,
        username=username,
        display_name=display_name or "",
        email=email or "",
        is_admin=bool(is_admin),
        must_change_password=bool(must_change_password),
    )

# ============================================================================
# FastAPI application
# ============================================================================

app = FastAPI(
    title="HC R&amp;D Sample Library API",
    description="Backend for sample inventory and checkout tracking.",
    version="1.6.6",
    docs_url=None if os.getenv("ENABLE_DOCS", "1") != "1" else "/docs",
    redoc_url=None if os.getenv("ENABLE_DOCS", "1") != "1" else "/redoc",
    openapi_url=None if os.getenv("ENABLE_DOCS", "1") != "1" else "/openapi.json",
)

SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-secret-change-in-production")

_APP_ENV_RAW = os.getenv("APP_ENV", "")
APP_ENV = (_APP_ENV_RAW or "development").lower()

SESSION_MAX_AGE_SECONDS = int(os.getenv("SESSION_MAX_AGE_SECONDS", "28800"))

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie="session",
    max_age=SESSION_MAX_AGE_SECONDS,
    same_site="lax",
    https_only=(APP_ENV == "production"),
)

# ============================================================================
# Production environment guard
# ============================================================================

def _production_env_guard():
    """Raise RuntimeError in production if insecure defaults are still in use."""
    if APP_ENV != "production":
        return
    errors = []
    if SESSION_SECRET == "dev-secret-change-in-production":
        errors.append("SESSION_SECRET is the insecure default; set it via environment variable")
    admin_pw = os.getenv("ADMIN_PASSWORD", "")
    if not admin_pw or admin_pw == "admin123":
        errors.append("ADMIN_PASSWORD must be set to a secure value (not the default) via environment variable")
    if errors:
        raise RuntimeError(
            "Production security guard: insecure defaults detected. "
            + "; ".join(errors)
            + ". Set the required environment variables and restart."
        )

_production_env_guard()

# ============================================================================
# Auth helper functions
# ============================================================================

async def require_login(request: Request) -> UserOut:
    """Ensure the user is logged in; raise 401 if not."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if user.must_change_password:
        raise HTTPException(status_code=403, detail="You must change your password before continuing")
    return user

async def require_admin(request: Request) -> UserOut:
    """Ensure the user is logged in and is an admin; raise 401/403 as appropriate."""
    user = await require_login(request)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

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

def init_db():
    conn = _get_sync_db()
    cur = conn.cursor()

    # Create users table if not exists
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            salt VARCHAR(64) NOT NULL,
            display_name TEXT DEFAULT '',
            is_admin BOOLEAN DEFAULT FALSE,
            is_active BOOLEAN DEFAULT TRUE,
            must_change_password BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Add email column if not exists
    # Add email column if not exists
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)")
    # Drop unique index on email — uniqueness enforced at Python level with
    # exemption for user ID=1 (primary admin account can reuse any email)
    cur.execute("DROP INDEX IF EXISTS idx_users_email")
    # Add must_change_password column if not exists
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE")
    # Settings table for app-level configuration
    cur.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key VARCHAR(255) PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    # Seed minimal development users if table is empty
    cur.execute("SELECT COUNT(*) FROM users")
    user_count = cur.fetchone()[0]
    if user_count == 0:
        admin_password = os.getenv("ADMIN_PASSWORD", "")
        if admin_password and admin_password != "admin123":
            admin_username = os.getenv("ADMIN_USERNAME", "admin")
            ph, salt_val = hash_password(admin_password)
            cur.execute(
                "INSERT INTO users (username, password_hash, salt, display_name, is_admin, is_active) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (admin_username, ph, salt_val, "System Administrator", True, True),
            )
            print("[INIT] Bootstrap admin created from ADMIN_PASSWORD env var")
        else:
            print("[INIT] No bootstrap admin created — set ADMIN_PASSWORD env var (not 'admin123') to create one")

    # Create inventory and checkout_records tables
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
    # Quantity migration for PostgreSQL
    cur.execute('ALTER TABLE inventory ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1')
    cur.execute('ALTER TABLE inventory ADD COLUMN IF NOT EXISTS available_quantity INTEGER DEFAULT 1')
    cur.execute('ALTER TABLE checkout_records ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1')
    cur.execute("UPDATE inventory SET quantity = 1 WHERE quantity IS NULL")
    cur.execute("UPDATE checkout_records SET quantity = 1 WHERE quantity IS NULL")

    cur.execute("""
        UPDATE inventory
        SET quantity = CASE
            WHEN NULLIF(TRIM(COALESCE(\"UnitCount\", '')), '') IS NOT NULL
                 AND TRIM(COALESCE(\"UnitCount\", '')) ~ '^[0-9]+$'
                 AND CAST(TRIM(\"UnitCount\") AS INTEGER) > 0
            THEN CAST(TRIM(\"UnitCount\") AS INTEGER)
            ELSE quantity
        END
        WHERE quantity IS NULL OR quantity = 1
    """)

    cur.execute("UPDATE inventory SET available_quantity = quantity WHERE available_quantity IS NULL")
    cur.execute("UPDATE inventory SET available_quantity = quantity WHERE available_quantity > quantity")

    # Photo metadata columns for PostgreSQL
    cur.execute('ALTER TABLE inventory ADD COLUMN IF NOT EXISTS photo_original_name TEXT')
    cur.execute('ALTER TABLE inventory ADD COLUMN IF NOT EXISTS photo_uploaded_at TEXT')
    cur.execute('ALTER TABLE inventory ADD COLUMN IF NOT EXISTS photo_uploaded_by INTEGER')
    cur.execute('ALTER TABLE inventory ADD COLUMN IF NOT EXISTS photo_size_bytes INTEGER')
    conn.commit()
    conn.close()

# ============================================================================
# Async startup wrapper to avoid blocking the event loop
# ============================================================================

@app.on_event("startup")
async def init_db_async():
    _ensure_upload_dir()
    await run_in_threadpool(init_db)

# ============================================================================
# Ensure database is initialized on import (for TestClient/script usage)
# This serves as a fallback in addition to the @app.on_event("startup") hook
# ============================================================================

if os.getenv("RUN_INIT_DB_ON_IMPORT", "0") == "1":
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
    username_input = payload.username.strip().lower()
    # Normalize: if full email provided, extract username prefix
    if '@' in username_input:
        username_input = username_input.split('@')[0]

    database_url = _get_db_url()
    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute(
            "SELECT id, username, password_hash, salt, display_name, email, is_admin, is_active, must_change_password FROM users WHERE username = %s",
            (username_input,),
        )
        row = cur.fetchone()
        conn.close()
        return row
    row = await run_in_threadpool(_query)
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user_id, username, password_hash, salt, display_name, email, is_admin, is_active, must_change_password = row
    if not is_active:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not verify_password(payload.password, password_hash, salt):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Migrate legacy SHA-256 hashes to bcrypt on successful login
    if not is_bcrypt_hash(password_hash):
        new_hash, _ = hash_password(payload.password)
        def _migrate():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            cur.execute("UPDATE users SET password_hash = %s, salt = '' WHERE id = %s",
                        (new_hash, user_id))
            conn.commit()
            conn.close()
        await run_in_threadpool(_migrate)
    request.session["user_id"] = user_id

    return JSONResponse({
        "id": user_id,
        "username": username,
        "display_name": display_name or "",
        "email": email or "",
        "is_admin": bool(is_admin),
        "must_change_password": bool(must_change_password),
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
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

@app.post("/api/auth/register")
async def register(request: Request):
    """Public registration is disabled. Uses configured admin contact."""
    admin_email = ""
    database_url = _get_db_url()
    try:
        def _fetch():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            cur.execute("SELECT email FROM users WHERE id = 1")
            row = cur.fetchone()
            conn.close()
            return row[0] if row else ""
        admin_email = await run_in_threadpool(_fetch)
    except Exception:
        pass

    if admin_email:
        detail = f"Registration is disabled. Please contact the system administrator at {admin_email}."
    else:
        detail = "Registration is disabled. Please contact the system administrator."

    raise HTTPException(status_code=403, detail=detail)

@app.post("/api/auth/admin/create-user")
async def admin_create_user(request: Request, payload: AdminCreateUserIn):
    """Admin-only: create a new user account with temporary password."""
    admin = await require_admin(request)

    email = payload.email.strip().lower()
    if not email.endswith("@philips.com"):
        raise HTTPException(status_code=400, detail="Email must end with @philips.com")

    username = email.split("@")[0]
    if not username:
        raise HTTPException(status_code=400, detail="Invalid email address")

    temp_password = generate_temp_password()
    password_hash, salt = hash_password(temp_password)

    is_admin_role = payload.role == "admin"

    database_url = _get_db_url()
    def _create():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cur.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="Username already exists")
        cur.execute(
            """INSERT INTO users (username, password_hash, salt, display_name, is_admin, is_active, email, must_change_password)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (username, password_hash, salt, username, is_admin_role, True, email, True),
        )
        conn.commit()
        conn.close()
        return True
    await run_in_threadpool(_create)
    return {
        "status": "ok",
        "username": username,
        "email": email,
        "temporary_password": temp_password,
        "must_change_password": True,
        "admin_email": admin.email,
    }

@app.post("/api/auth/change-password")
async def change_password(request: Request, payload: ChangePasswordIn):
    """Allow a logged-in user to change their own password."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    database_url = _get_db_url()

    # Fetch current user's password hash and salt
    def _fetch():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT password_hash, salt FROM users WHERE id = %s", (user.id,))
        row = cur.fetchone()
        conn.close()
        return row
    row = await run_in_threadpool(_fetch)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")

    current_hash, current_salt = row

    if not verify_password(payload.old_password, current_hash, current_salt):
        raise HTTPException(status_code=400, detail="Old password is incorrect")

    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    if not payload.new_password or len(payload.new_password.strip()) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    if payload.new_password == payload.old_password:
        raise HTTPException(status_code=400, detail="New password must be different from old password")

    new_hash, new_salt = hash_password(payload.new_password)

    def _update():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute(
            "UPDATE users SET password_hash = %s, salt = %s, must_change_password = FALSE WHERE id = %s",
            (new_hash, new_salt, user.id),
        )
        conn.commit()
        conn.close()
    await run_in_threadpool(_update)
    return {"status": "ok", "message": "Password changed successfully"}

@app.get("/api/users")
async def list_users(request: Request):
    """List all users (admin-only)."""
    await require_admin(request)
    database_url = _get_db_url()
    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute(
            "SELECT id, username, email, is_admin, is_active, must_change_password FROM users ORDER BY username ASC"
        )
        rows = cur.fetchall()
        conn.close()
        return [
            {"id": r[0], "username": r[1], "email": r[2] or "", "is_admin": bool(r[3]), "is_active": bool(r[4]), "must_change_password": bool(r[5])}
            for r in rows
        ]
    return await run_in_threadpool(_query)
@app.get("/api/settings/admin-contact")
async def get_admin_contact():
    """Get admin contact email from user record ID=1 for guest mailto flows."""
    database_url = _get_db_url()
    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT email FROM users WHERE id = 1")
        row = cur.fetchone()
        conn.close()
        return row
    row = await run_in_threadpool(_query)
    if row and row[0]:
        return {"name": "System Administrator", "email": row[0]}
    return {"name": "System Administrator", "email": ""}

@app.put("/api/settings/admin-contact")
async def update_admin_contact(request: Request, payload: AdminContactIn):
    """Update email on user ID=1 (admin-only). This is the source of truth for guest mailto."""
    await require_admin(request)

    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if not email.endswith("@philips.com"):
        raise HTTPException(status_code=400, detail="Email must end with @philips.com")

    database_url = _get_db_url()
    def _update():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("UPDATE users SET email = %s WHERE id = 1", (email,))
        conn.commit()
        conn.close()
    await run_in_threadpool(_update)
    return {"status": "ok", "email": email}

@app.get("/api/users/{user_id}")
async def get_user(user_id: int, request: Request):
    """Get a single user by ID (admin-only)."""
    await require_admin(request)
    database_url = _get_db_url()
    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute(
            "SELECT id, username, email, is_admin, is_active, display_name FROM users WHERE id = %s",
            (user_id,),
        )
        row = cur.fetchone()
        conn.close()
        return row
    row = await run_in_threadpool(_query)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": row[0], "username": row[1], "email": row[2] or "",
        "is_admin": bool(row[3]), "is_active": bool(row[4]), "display_name": row[5] or "",
    }
@app.put("/api/users/{user_id}")
async def update_user(user_id: int, request: Request, payload: UserUpdateIn):
    """Update a user's safe fields (admin-only)."""
    admin = await require_admin(request)
    database_url = _get_db_url()

    def _fetch():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT id, username, email, is_admin, is_active FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        conn.close()
        return row
    row = await run_in_threadpool(_fetch)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")

    current_id, current_username, current_email, current_is_admin, current_is_active = row
    updates = {}
    ph = "%s"

    if payload.email is not None:
        new_email = payload.email.strip().lower() if payload.email else ""
        if new_email:
            if not new_email.endswith("@philips.com"):
                raise HTTPException(status_code=400, detail="Email must end with @philips.com")
            updates["email"] = new_email

    if payload.display_name is not None:
        updates["display_name"] = payload.display_name

    new_is_admin = payload.is_admin if payload.is_admin is not None else bool(current_is_admin)
    new_is_active = payload.is_active if payload.is_active is not None else bool(current_is_active)

    if bool(current_is_admin) and bool(current_is_active):
        if not new_is_admin or not new_is_active:
            def _count_admins():
                conn = psycopg2.connect(database_url)
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) FROM users WHERE is_admin = TRUE AND is_active = TRUE")
                return cur.fetchone()[0]
            active_admin_count = await run_in_threadpool(_count_admins)
            if active_admin_count <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot remove admin role or deactivate the last active administrator",
                )

    if payload.is_admin is not None:
        updates["is_admin"] = payload.is_admin
    if payload.is_active is not None:
        updates["is_active"] = payload.is_active

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f'"{k}" = {ph}' for k in updates.keys())
    values = list(updates.values())
    values.append(user_id)

    def _update():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute(f"UPDATE users SET {set_clause} WHERE id = %s", values)
        conn.commit()
        conn.close()
    await run_in_threadpool(_update)
    return await get_user(user_id, request)

@app.put("/api/users/{user_id}/reset-password")
async def reset_user_password(user_id: int, request: Request):
    """Reset a user's password with a system-generated temporary password (admin-only)."""
    admin = await require_admin(request)

    database_url = _get_db_url()
    def _check():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        conn.close()
        return row is not None
    exists = await run_in_threadpool(_check)
    if not exists:
        raise HTTPException(status_code=404, detail="User not found")

    # Fetch user email
    email = ""
    def _fetch_email():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT email FROM users WHERE id = %s", (user_id,))
        r = cur.fetchone()
        conn.close()
        return r[0] if r else ""
    email = await run_in_threadpool(_fetch_email)
    temp_password = generate_temp_password()
    password_hash, salt = hash_password(temp_password)

    def _update():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("UPDATE users SET password_hash = %s, salt = %s, must_change_password = TRUE WHERE id = %s",
                    (password_hash, salt, user_id))
        conn.commit()
        conn.close()
    await run_in_threadpool(_update)
    return {"status": "ok", "temporary_password": temp_password, "must_change_password": True, "email": email, "admin_email": admin.email}

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int, request: Request):
    """Delete a user with strict safeguards (admin-only)."""
    admin = await require_admin(request)

    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    database_url = _get_db_url()

    def _fetch():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT id, username, is_admin, is_active FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        conn.close()
        return row
    row = await run_in_threadpool(_fetch)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")

    _, username, is_admin, is_active = row

    if is_admin and is_active:
        def _count():
            conn = psycopg2.connect(database_url)
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM users WHERE is_admin = TRUE AND is_active = TRUE")
            return cur.fetchone()[0]
        count = await run_in_threadpool(_count)
        if count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last active administrator")

    def _check_history():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM checkout_records WHERE borrower_name = %s", (username,))
        return cur.fetchone()[0]
    history_count = await run_in_threadpool(_check_history)
    if history_count > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete user with checkout history; deactivate the account instead",
        )

    def _delete():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
        conn.close()
    await run_in_threadpool(_delete)
    return {"status": "ok"}

class MePasswordChangeIn(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

# ============================================================================
# Shared helper for personal-record identity matching
# ============================================================================

def _get_borrower_identity_conditions(user, email=None):
    """Build identity matching criteria for personal checkout record queries.

    Returns (conditions_list, params_list) where conditions_list contains
    SQL boolean expressions using %s placeholders (PostgreSQL style).
    Callers should replace %s with ? for SQLite.

    Matching priority:
    1. borrower_email match (most stable) — used when user has non-empty email
    2. borrower_name match (legacy fallback) — display_name or username
    """
    conditions = []
    params = []

    user_email = (email or user.email or "").strip().lower()
    user_display = user.display_name.strip() if user.display_name else ""
    user_username = user.username.strip() if user.username else ""

    if user_email:
        conditions.append("LOWER(TRIM(borrower_email)) = %s")
        params.append(user_email)

    name_set = set()
    if user_display:
        name_set.add(user_display)
    if user_username:
        name_set.add(user_username)
    name_set.discard("")

    if name_set:
        sorted_names = sorted(name_set)
        placeholders = ", ".join(["%s"] * len(sorted_names))
        conditions.append(f"TRIM(borrower_name) IN ({placeholders})")
        params.extend(sorted_names)

    return conditions, params

def _identity_where_clause(conditions, params):
    """Build a WHERE clause from identity conditions."""
    if not conditions:
        return "1=0", params
    clause = " OR ".join(f"({c})" for c in conditions)
    return clause, params

# ============================================================================
# My Personal Area — Self-Scoped Endpoints
# ============================================================================

@app.get("/api/me/sample-summary")
async def get_my_sample_summary(request: Request):
    """Get personal summary counts scoped to the authenticated user."""
    user = await require_login(request)
    conds, params = _get_borrower_identity_conditions(user)
    database_url = _get_db_url()
    today = date.today().isoformat()
    seven_days = (date.today() + timedelta(days=7)).isoformat()

    identity_clause, identity_params = _identity_where_clause(conds, params)
    ph = "%s"

    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()

        cur.execute(f"""
            SELECT COUNT(*) FROM checkout_records
            WHERE checkout_status = 'OUT' AND ({identity_clause})
        """, identity_params)
        currently_checked_out = cur.fetchone()[0]

        cur.execute(f"""
            SELECT COUNT(*) FROM checkout_records
            WHERE checkout_status = 'OUT' AND ({identity_clause})
              AND expected_return_date != '' AND expected_return_date < {ph}
        """, identity_params + [today])
        overdue = cur.fetchone()[0]

        cur.execute(f"""
            SELECT COUNT(*) FROM checkout_records
            WHERE checkout_status = 'OUT' AND ({identity_clause})
              AND expected_return_date != '' AND expected_return_date >= {ph}
              AND expected_return_date <= {ph}
        """, identity_params + [today, seven_days])
        due_soon = cur.fetchone()[0]

        cur.execute(f"""
            SELECT COUNT(*) FROM checkout_records
            WHERE checkout_status = 'RETURNED' AND ({identity_clause})
              AND actual_return_date != '' AND actual_return_date LIKE {ph}
        """, identity_params + [today[:7] + "%"])
        returned_this_month = cur.fetchone()[0]

        conn.close()
        return {
            "currently_checked_out": currently_checked_out,
            "overdue": overdue,
            "due_soon": due_soon,
            "returned_this_month": returned_this_month,
        }
    return await _safe_pg_query(_query)
@app.get("/api/me/active-checkouts")
async def get_my_active_checkouts(
    request: Request,
    filter: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
):
    """Get the authenticated user's active checkout records."""
    user = await require_login(request)
    conds, params = _get_borrower_identity_conditions(user)
    identity_clause, identity_params = _identity_where_clause(conds, params)
    database_url = _get_db_url()
    today = date.today().isoformat()
    seven_days = (date.today() + timedelta(days=7)).isoformat()
    ph = "%s"

    pg_iliak = " ILIKE "
    pg_nulls = " NULLS LAST "

    def _build_query(sql_base, sql_params):
        sql = sql_base
        if filter == "overdue":
            sql += f" AND cr.expected_return_date != '' AND cr.expected_return_date < {ph}"
            sql_params.append(today)
        elif filter == "due_soon":
            sql += f" AND cr.expected_return_date != '' AND cr.expected_return_date >= {ph} AND cr.expected_return_date <= {ph}"
            sql_params.extend([today, seven_days])
        elif filter == "no_due_date":
            sql += " AND (cr.expected_return_date IS NULL OR cr.expected_return_date = '')"

        if search:
            sql += f" AND (COALESCE(i.\"Title\", cr.sample_title) {pg_iliak}{ph} OR COALESCE(i.\"SerialNum\", cr.sample_serial) {pg_iliak}{ph} OR cr.sample_type {pg_iliak}{ph})"
            like = f"%{search}%"
            sql_params.extend([like, like, like])

        sql += f" ORDER BY cr.expected_return_date ASC{pg_nulls}, cr.checkout_date ASC"
        offset = (page - 1) * page_size
        sql += f" LIMIT {ph} OFFSET {ph}"
        sql_params.extend([page_size, offset])
        return sql, sql_params

    def _process_rows(rows, col_names):
        items = []
        for row in rows:
            r = dict(zip(col_names, row)) if col_names else dict(row)
            due_date = r.get("expected_return_date") or ""
            status = "active"
            if due_date and due_date < today:
                status = "overdue"
            elif due_date and due_date >= today and due_date <= seven_days:
                status = "due_soon"
            items.append({
                "checkout_id": r["id"],
                "sample_id": r["sample_id"],
                "sample_name": r.get("item_title") or r.get("sample_title") or "",
                "sample_code": r.get("item_serial") or r.get("sample_serial") or "",
                "sample_type": r.get("item_type") or r.get("sample_type") or "",
                "category": r.get("Category") or "",
                "model": r.get("Model") or "",
                "quantity": r["quantity"],
                "checkout_date": r["checkout_date"] or "",
                "due_date": due_date,
                "status": status,
            })
        return items

    sql_base = f"""
        SELECT cr.id, cr.sample_id, cr.quantity,
               cr.checkout_date, cr.expected_return_date,
               cr.sample_title, cr.sample_serial, cr.sample_type,
               cr.storage_location_code,
               COALESCE(i."Title", cr.sample_title) as item_title,
               COALESCE(i."SerialNum", cr.sample_serial) as item_serial,
               COALESCE(i."SampleType", cr.sample_type) as item_type,
               COALESCE(i."StorageLocationCode", cr.storage_location_code) as item_location,
               i."Category", i."Model"
        FROM checkout_records cr
        LEFT JOIN inventory i ON cr.sample_id = i.id
        WHERE cr.checkout_status = 'OUT' AND ({identity_clause})
    """
    query_params = identity_params.copy()
    sql, query_params = _build_query(sql_base, query_params)

    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute(sql, query_params)
        rows = cur.fetchall()
        col_names = [d[0] for d in cur.description]
        conn.close()
        return _process_rows(rows, col_names)
    return await _safe_pg_query(_query)

@app.get("/api/me/checkout-history")
async def get_my_checkout_history(
    request: Request,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    """Get the authenticated user's returned/closed checkout history."""
    user = await require_login(request)
    conds, params = _get_borrower_identity_conditions(user)
    identity_clause, identity_params = _identity_where_clause(conds, params)
    database_url = _get_db_url()
    ph = "%s"

    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        where = f"cr.checkout_status = 'RETURNED' AND ({identity_clause})"
        q_params = identity_params.copy()

        if search:
            where += f" AND (COALESCE(i.\"Title\", cr.sample_title) ILIKE {ph} OR COALESCE(i.\"SerialNum\", cr.sample_serial) ILIKE {ph})"
            like = f"%{search}%"
            q_params.extend([like, like])

        cur.execute(f"""
            SELECT COUNT(*) FROM checkout_records cr
            LEFT JOIN inventory i ON cr.sample_id = i.id
            WHERE {where}
        """, q_params)
        total = cur.fetchone()[0]

        offset = (page - 1) * page_size
        cur.execute(f"""
            SELECT cr.id, cr.sample_id, cr.quantity,
                   cr.checkout_date, cr.actual_return_date,
                   COALESCE(i."Title", cr.sample_title) as sample_name,
                   COALESCE(i."SerialNum", cr.sample_serial) as sample_code,
                   cr.sample_type
            FROM checkout_records cr
            LEFT JOIN inventory i ON cr.sample_id = i.id
            WHERE {where}
            ORDER BY cr.actual_return_date DESC
            LIMIT {ph} OFFSET {ph}
        """, q_params + [page_size, offset])
        rows = cur.fetchall()
        col_names = [d[0] for d in cur.description]
        items = [dict(zip(col_names, row)) for row in rows]
        conn.close()
        return {"items": items, "total": total, "page": page, "page_size": page_size}
    return await _safe_pg_query(_query)
@app.get("/api/me/profile")
async def get_my_profile(request: Request):
    """Get the authenticated user's profile information."""
    user = await require_login(request)
    database_url = _get_db_url()

    created_at = None
    last_login = None
    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT created_at, is_active FROM users WHERE id = %s", (user.id,))
        row = cur.fetchone()
        conn.close()
        return row
    row = await run_in_threadpool(_query)
    if row:
        created_at = row[0]
        last_login = None  # not tracked
        is_active = bool(row[1])
    return {
        "username": user.username,
        "email": user.email,
        "role": "admin" if user.is_admin else "user",
        "status": "active" if is_active else "inactive",
        "created_at": str(created_at) if created_at else None,
        "last_login": None,
    }

@app.post("/api/me/change-password")
async def change_my_password(request: Request, payload: MePasswordChangeIn):
    """Self-scoped password change — derives user from session."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    database_url = _get_db_url()

    def _fetch():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT password_hash, salt FROM users WHERE id = %s", (user.id,))
        row = cur.fetchone()
        conn.close()
        return row
    row = await run_in_threadpool(_fetch)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")

    current_hash, current_salt = row

    if not verify_password(payload.current_password, current_hash, current_salt):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    if not payload.new_password or len(payload.new_password.strip()) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")

    new_hash, new_salt = hash_password(payload.new_password)

    def _update():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute(
            "UPDATE users SET password_hash = %s, salt = %s, must_change_password = FALSE WHERE id = %s",
            (new_hash, new_salt, user.id),
        )
        conn.commit()
        conn.close()
    await run_in_threadpool(_update)
    return {"status": "ok", "message": "Password changed successfully"}

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
    database_url = _get_db_url()
    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        sql = """
            SELECT i.*
            FROM inventory i
            WHERE 1=1
        """
        params = []
        if search:
            sql += ' AND (i."Title" ILIKE %s OR i."SerialNum" ILIKE %s OR i."SampleType" ILIKE %s)'
            like = f"%{search}%"
            params.extend([like, like, like])
        if status:
            sql += ' AND i."Status" = %s'
            params.append(status)
        if rack:
            sql += ' AND i."StorageLocationCode" = %s'
            params.append(rack)
        cur.execute(sql, params)
        rows = cur.fetchall()
        col_names = [d[0] for d in cur.description]
        result = [_normalize_item_row(dict(zip(col_names, row))) for row in rows]
        conn.close()
        return result
    items = await _safe_pg_query(_query)
    return items

@app.get("/api/export/items.csv")
async def export_items_csv(
    request: Request,
    search: Optional[str] = None,
    status: Optional[str] = None,
    rack: Optional[str] = None,
):
    """Admin-only CSV export of filtered sample list."""
    user = await require_admin(request)
    database_url = _get_db_url()

    def _fetch():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        sql = """
            SELECT i.*
            FROM inventory i
            WHERE 1=1
        """
        params = []
        if search:
            sql += ' AND (i."Title" ILIKE %s OR i."SerialNum" ILIKE %s OR i."SampleType" ILIKE %s)'
            like = f"%{search}%"
            params.extend([like, like, like])
        if status:
            sql += ' AND i."Status" = %s'
            params.append(status)
        if rack:
            sql += ' AND i."StorageLocationCode" = %s'
            params.append(rack)
        cur.execute(sql, params)
        rows = cur.fetchall()
        col_names = [d[0] for d in cur.description]
        result = [_normalize_item_row(dict(zip(col_names, row))) for row in rows]
        conn.close()
        return result
    items = await run_in_threadpool(_fetch)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Title", "SerialNum", "SampleType", "StorageLocationCode", "Status",
        "Quantity", "AvailableQuantity", "Category",
        "SubCategory", "Brand", "Model", "DepartmentOwner", "Condition",
        "DateReceived", "UnitCount", "UnitMeasure", "Notes"
    ])
    for item in items:
        status_val = item.get("status") or item.get("Status") or "IN_STOCK"
        writer.writerow([
            item.get("Title") or "",
            item.get("SerialNum") or "",
            item.get("SampleType") or "",
            item.get("StorageLocationCode") or "",
            status_val,
            item.get("quantity") or 1,
            item.get("available_quantity") or item.get("quantity") or 1,
            item.get("Category") or "",
            item.get("SubCategory") or "",
            item.get("Brand") or "",
            item.get("Model") or "",
            item.get("DepartmentOwner") or "",
            item.get("Condition") or "",
            item.get("DateReceived") or "",
            item.get("UnitCount") or "",
            item.get("UnitMeasure") or "",
            item.get("Notes") or "",
        ])

    csv_content = output.getvalue()
    output.close()

    from datetime import date
    today = date.today().strftime("%Y-%m-%d")
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=samples_export_{today}.csv"}
    )

@app.get("/api/items/{item_id}")
async def get_item(item_id: int):
    """Get a single item with checkout history."""
    database_url = _get_db_url()
    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        sql = """
            SELECT i.*
            FROM inventory i
            WHERE i.id = %s
        """
        cur.execute(sql, (item_id,))
        row = cur.fetchone()
        if not row:
            conn.close()
            return None
        col_names = [d[0] for d in cur.description]
        item = _normalize_item_row(dict(zip(col_names, row)))
        cur.execute("""
            SELECT quantity, sample_title, sample_serial, sample_type,
                   borrower_name, borrower_department, borrower_email,
                   checkout_date, expected_return_date, actual_return_date,
                   checkout_status, checkout_remarks, return_remarks
            FROM checkout_records
            WHERE sample_id = %s
            ORDER BY checkout_date DESC
        """, (item_id,))
        history_rows = cur.fetchall()
        history_cols = [d[0] for d in cur.description]
        item['checkout_history'] = [dict(zip(history_cols, hr)) for hr in history_rows]
        conn.close()
        return item
    item = await _safe_pg_query(_query)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
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
    await require_admin(request)
    if payload.Status == "CHECKED_OUT":
        raise HTTPException(
            status_code=400,
            detail="Cannot create item with Status=CHECKED_OUT. Use checkout flow instead."
        )

    total_quantity = _parse_unit_count(payload.UnitCount)
    status = payload.Status or "IN_STOCK"

    field_list = [f for f in ALL_FIELDS]
    values = []

    placeholders = ["%s"] * (len(field_list) + 3)
    for field in field_list:
        values.append(getattr(payload, field, None))

    values.append(status)
    values.append(total_quantity)
    values.append(total_quantity)

    field_sql = ", ".join([f'"{f}"' for f in field_list] + ['"Status"', "quantity", "available_quantity"])
    placeholder_sql = ", ".join(placeholders)

    database_url = _get_db_url()
    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute(f"INSERT INTO inventory ({field_sql}) VALUES ({placeholder_sql}) RETURNING id", values)
        item_id = cur.fetchone()[0]
        conn.commit()
        conn.close()
        return item_id
    item_id = await _safe_pg_query(_query)
    return JSONResponse({"id": item_id, "Status": status}, status_code=201)

@app.put("/api/items/{item_id}")
async def update_item(request: Request, item_id: int, payload: ItemIn):
    """Update an existing inventory item. Does not allow setting Status=CHECKED_OUT."""
    # Role protection: only admin can update items
    await require_admin(request)
    # Block direct status transition to CHECKED_OUT
    if payload.Status == "CHECKED_OUT":
        raise HTTPException(
            status_code=400,
            detail="Cannot set Status=CHECKED_OUT directly. Use checkout flow instead."
        )

    database_url = _get_db_url()
    existing = None

    def _check():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute('SELECT id, quantity, available_quantity, "Status", "UnitCount" FROM inventory WHERE id = %s', (item_id,))
        row = cur.fetchone()
        conn.close()
        return row
    existing = await _safe_pg_query(_check)
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")

    current_quantity = existing[1] if existing[1] is not None else 1
    current_available = existing[2] if existing[2] is not None else current_quantity
    current_status = existing[3]
    if current_status in ('LOST', 'SCRAPPED') and payload.Status is not None and payload.Status not in ('LOST', 'SCRAPPED'):
        current_available = current_quantity

    updates = []
    values = []
    ph = "%s"

    for field in ALL_FIELDS:
        val = getattr(payload, field, None)
        if val is not None:
            updates.append(f'"{field}" = {ph}')
            values.append(val)

    if payload.UnitCount is not None:
        new_total_quantity = _parse_unit_count(payload.UnitCount)
        updates.append(f'quantity = {ph}')
        values.append(new_total_quantity)

        delta = new_total_quantity - current_quantity
        new_available_quantity = current_available + delta
        if new_available_quantity is None:
            new_available_quantity = new_total_quantity
        if new_available_quantity > new_total_quantity:
            new_available_quantity = new_total_quantity
        if new_available_quantity < 0:
            new_available_quantity = 0

        updates.append(f'available_quantity = {ph}')
        values.append(new_available_quantity)

    if payload.Status is not None:
        updates.append('"Status" = ' + ph)
        values.append(payload.Status)

    if not updates:
        return JSONResponse({"id": item_id})

    values.append(item_id)
    set_clause = ", ".join(updates)

    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute(f"UPDATE inventory SET {set_clause} WHERE id = %s", values)
        conn.commit()
        conn.close()
        return True
    await _safe_pg_query(_query)
    return JSONResponse({"id": item_id})

@app.delete("/api/items/{item_id}")
async def delete_item(request: Request, item_id: int):
    """Delete an inventory item. Active checkout records are auto-closed (admin-only)."""
    await require_admin(request)
    from datetime import date
    today = date.today().isoformat()
    database_url = _get_db_url()

    def _delete():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT id FROM inventory WHERE id = %s", (item_id,))
        if not cur.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail="Item not found")
        cur.execute("""
            UPDATE checkout_records SET checkout_status = 'RETURNED',
                actual_return_date = %s, return_remarks = 'Auto-closed on item deletion',
                updated_at = CURRENT_TIMESTAMP
            WHERE sample_id = %s AND checkout_status = 'OUT'
        """, (today, item_id))
        cur.execute("DELETE FROM checkout_records WHERE sample_id = %s", (item_id,))
        cur.execute("DELETE FROM inventory WHERE id = %s", (item_id,))
        conn.commit()
        conn.close()
        return True
    await _safe_pg_query(_delete)
    return JSONResponse({"status": "deleted"})

# ============================================================================
# Photo upload / replace / delete / serve endpoints
# ============================================================================

@app.post("/api/items/{item_id}/photo")
async def upload_item_photo(request: Request, item_id: int, file: UploadFile = File(...)):
    admin = await require_admin(request)
    _ensure_upload_dir()

    # Validate MIME type
    if file.content_type not in ALLOWED_PHOTO_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid file type: {file.content_type}. Allowed: JPEG, PNG, WEBP")

    # Validate extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_PHOTO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Invalid file extension: {ext}. Allowed: .jpg, .jpeg, .png, .webp")

    # Read file bytes
    file_bytes = await file.read()

    # Validate and compress image
    compressed = _validate_and_compress_image(file_bytes)
    if compressed is None:
        raise HTTPException(status_code=400, detail="Could not compress image to ≤300 KB within acceptable quality.")

    # Check final size
    if len(compressed) > MAX_PHOTO_SIZE_BYTES:
        raise HTTPException(status_code=400, detail=f"Compressed image exceeds {MAX_PHOTO_SIZE_BYTES} bytes.")

    database_url = _get_db_url()

    # Ensure item exists and get existing photo path
    def _check():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute('SELECT id, "PhotoLink" FROM inventory WHERE id = %s', (item_id,))
        row = cur.fetchone()
        conn.close()
        return row
    row = await run_in_threadpool(_check)
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    existing_photo_link = row[1]

    # Generate safe filename and save new file
    new_filename = _safe_photo_filename(item_id)
    new_photo_path = os.path.join(PHOTO_UPLOAD_DIR, new_filename)
    with open(new_photo_path, "wb") as f:
        f.write(compressed)

    # Build relative path for DB
    relative_path = f"sample_photos/{new_filename}"
    now_iso = datetime.utcnow().isoformat()

    # Update DB metadata
    def _update():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute(
            """UPDATE inventory SET "PhotoLink" = %s, photo_original_name = %s,
               photo_uploaded_at = %s, photo_uploaded_by = %s, photo_size_bytes = %s
               WHERE id = %s""",
            (relative_path, file.filename, now_iso, admin.id, len(compressed), item_id),
        )
        conn.commit()
        conn.close()
    await run_in_threadpool(_update)
    # After DB update succeeds, delete old physical file if replacing
    if existing_photo_link:
        old_full_path = os.path.join(os.path.dirname(PHOTO_UPLOAD_DIR), existing_photo_link)
        _delete_photo_file(old_full_path)

    return JSONResponse({
        "status": "ok",
        "photo_path": relative_path,
        "photo_size_bytes": len(compressed),
    })

@app.delete("/api/items/{item_id}/photo")
async def delete_item_photo(request: Request, item_id: int):
    admin = await require_admin(request)
    database_url = _get_db_url()

    def _fetch():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute('SELECT id, "PhotoLink" FROM inventory WHERE id = %s', (item_id,))
        row = cur.fetchone()
        conn.close()
        return row
    row = await run_in_threadpool(_fetch)
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")

    photo_link = row[1]
    if not photo_link:
        raise HTTPException(status_code=404, detail="Item has no photo to delete")

    # Delete physical file first (safe: _delete_photo_file swallows OSErrors)
    old_full_path = os.path.join(os.path.dirname(PHOTO_UPLOAD_DIR), photo_link)
    _delete_photo_file(old_full_path)

    # Then clear DB metadata
    def _clear():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute(
            """UPDATE inventory SET "PhotoLink" = NULL, photo_original_name = NULL,
               photo_uploaded_at = NULL, photo_uploaded_by = NULL, photo_size_bytes = NULL
               WHERE id = %s""",
            (item_id,),
        )
        conn.commit()
        conn.close()
    await run_in_threadpool(_clear)
    return JSONResponse({"status": "ok", "message": "Photo deleted"})

@app.get("/api/items/{item_id}/photo")
async def get_item_photo(item_id: int, request: Request):
    await require_login(request)
    database_url = _get_db_url()

    def _fetch():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute('SELECT "PhotoLink" FROM inventory WHERE id = %s', (item_id,))
        row = cur.fetchone()
        conn.close()
        return row
    row = await run_in_threadpool(_fetch)
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")

    photo_link = row[0]
    if not photo_link:
        raise HTTPException(status_code=404, detail="Item has no photo")

    photo_full_path = os.path.join(os.path.dirname(PHOTO_UPLOAD_DIR), photo_link)
    if not os.path.exists(photo_full_path):
        raise HTTPException(status_code=404, detail="Photo file not found on disk")

    media_type_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }
    ext = os.path.splitext(photo_link)[1].lower()
    media_type = media_type_map.get(ext, "image/jpeg")

    return FileResponse(photo_full_path, media_type=media_type)

# ============================================================================
# Pydantic models for checkout
# ============================================================================

class CheckoutIn(BaseModel):
    sample_id: int
    quantity: int = 1
    borrower_department: str = ""
    borrower_email: str = ""
    expected_return_date: str = ""
    checkout_remarks: str = ""

class CheckoutReturnIn(BaseModel):
    quantity: int = 1
    actual_return_date: str = ""
    return_remarks: str = ""

# ============================================================================
# Checkout/Return Routes
# ============================================================================

@app.post("/api/checkout")
async def create_checkout(request: Request, payload: CheckoutIn):
    """Create a checkout record for a sample with quantity."""
    user = await require_login(request)
    borrower_name = user.display_name.strip() if user.display_name and user.display_name.strip() else user.username
    if not borrower_name:
        raise HTTPException(status_code=400, detail="Unable to determine borrower identity")
    # Use authenticated user's email if form field is empty
    borrower_email = payload.borrower_email.strip() if payload.borrower_email and payload.borrower_email.strip() else (user.email or "").strip()
    if payload.quantity < 1:
        raise HTTPException(status_code=400, detail="Invalid quantity")
    database_url = _get_db_url()
    sample_id = payload.sample_id
    from datetime import date
    checkout_date = date.today().isoformat()

    def _checkout():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute('SELECT quantity, available_quantity, "Status", "Title", "SerialNum", "SampleType", "StorageLocationCode" FROM inventory WHERE id = %s', (sample_id,))
        row = cur.fetchone()
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Sample not found")
        quantity, available_quantity, status, title, serial, stype, storage_loc = row
        if status in ("LOST", "SCRAPPED"):
            conn.close()
            raise HTTPException(status_code=400, detail=f"Sample status is {status}, cannot checkout")
        if payload.quantity > available_quantity:
            conn.close()
            raise HTTPException(status_code=400, detail="Not enough available stock")
        cur.execute("""
            INSERT INTO checkout_records (sample_id, quantity, borrower_name, borrower_department, borrower_email,
                checkout_date, expected_return_date, checkout_remarks, checkout_status, sample_title, sample_serial, sample_type, storage_location_code, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'OUT', %s, %s, %s, %s, CURRENT_TIMESTAMP)
        """, (sample_id, payload.quantity, borrower_name, payload.borrower_department, borrower_email, checkout_date,
              payload.expected_return_date, payload.checkout_remarks, title, serial, stype, storage_loc))
        cur.execute("UPDATE inventory SET available_quantity = available_quantity - %s WHERE id = %s", (payload.quantity, sample_id))
        conn.commit()
        conn.close()
        return True
    await _safe_pg_query(_checkout)
    return JSONResponse({"status": "ok"})

@app.put("/api/checkout/{record_id}/return")
async def return_checkout(request: Request, record_id: int, payload: CheckoutReturnIn):
    """Return a checked out sample with quantity. Ownership verified."""
    user = await require_login(request)
    if payload.quantity < 1:
        raise HTTPException(status_code=400, detail="Invalid quantity")
    database_url = _get_db_url()

    def _return():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT sample_id, quantity, checkout_status, borrower_name FROM checkout_records WHERE id = %s", (record_id,))
        row = cur.fetchone()
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Checkout record not found")
        sample_id, record_quantity, checkout_status, borrower_name = row
        if checkout_status != "OUT":
            conn.close()
            raise HTTPException(status_code=400, detail="Checkout record is not active")
        # Ownership check
        owner_names = {user.display_name.strip(), user.username.strip()}
        owner_names.discard("")
        if borrower_name not in owner_names:
            conn.close()
            raise HTTPException(status_code=403, detail="You can only return your own checked-out items")
        if payload.quantity < 1 or payload.quantity > record_quantity:
            conn.close()
            raise HTTPException(status_code=400, detail=f"Return quantity must be between 1 and {record_quantity}")
        cur.execute("SELECT quantity, available_quantity FROM inventory WHERE id = %s", (sample_id,))
        total_qty, avail_qty = cur.fetchone()
        if avail_qty + payload.quantity > total_qty:
            conn.close()
            raise HTTPException(status_code=400, detail="Return quantity exceeds total stock")
        if payload.quantity >= record_quantity:
            cur.execute("""
                UPDATE checkout_records SET checkout_status = 'RETURNED',
                    actual_return_date = %s, return_remarks = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (payload.actual_return_date, payload.return_remarks, record_id))
        else:
            cur.execute("""
                UPDATE checkout_records SET quantity = quantity - %s,
                    return_remarks = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (payload.quantity, payload.return_remarks, record_id))
        cur.execute("UPDATE inventory SET available_quantity = available_quantity + %s WHERE id = %s", (payload.quantity, sample_id))
        conn.commit()
        conn.close()
        return True
    await _safe_pg_query(_return)
    return JSONResponse({"status": "ok"})

@app.put("/api/items/{sample_id}/return")
async def return_item_stock(request: Request, sample_id: int, payload: CheckoutReturnIn):
    """Return quantity to a sample, distributing across all active OUT records."""
    await require_login(request)
    if payload.quantity < 1:
        raise HTTPException(status_code=400, detail="Invalid quantity")
    from datetime import date
    today = date.today().isoformat()
    database_url = _get_db_url()

    def _return():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT quantity, available_quantity FROM inventory WHERE id = %s", (sample_id,))
        row = cur.fetchone()
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Sample not found")
        total_qty, avail_qty = row
        cur.execute("SELECT id, quantity FROM checkout_records WHERE sample_id = %s AND checkout_status = 'OUT' ORDER BY checkout_date ASC", (sample_id,))
        out_records = cur.fetchall()
        if not out_records:
            conn.close()
            raise HTTPException(status_code=400, detail="No active checkout records for this sample")
        total_out = sum(r[1] for r in out_records)
        if payload.quantity > total_out:
            conn.close()
            raise HTTPException(status_code=400, detail=f"Return quantity exceeds total checked out ({total_out})")
        if avail_qty + payload.quantity > total_qty:
            conn.close()
            raise HTTPException(status_code=400, detail="Return quantity exceeds total stock")
        remaining = payload.quantity
        for rec_id, rec_qty in out_records:
            if remaining <= 0:
                break
            if rec_qty <= remaining:
                cur.execute("""
                    UPDATE checkout_records SET checkout_status = 'RETURNED',
                        actual_return_date = %s, return_remarks = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (today, payload.return_remarks, rec_id))
                remaining -= rec_qty
            else:
                cur.execute("""
                    UPDATE checkout_records SET quantity = quantity - %s,
                        return_remarks = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (remaining, payload.return_remarks, rec_id))
                remaining = 0
                break
        cur.execute("UPDATE inventory SET available_quantity = available_quantity + %s WHERE id = %s", (payload.quantity, sample_id))
        conn.commit()
        conn.close()
        return True
    await _safe_pg_query(_return)
    return JSONResponse({"status": "ok"})

@app.get("/api/checkout/records")
async def get_checkout_records(sample_id: Optional[int] = None):
    """Get checkout records, optionally filtered by sample_id."""
    database_url = _get_db_url()
    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        if sample_id:
            cur.execute("""
                SELECT id, quantity, sample_title, sample_serial, sample_type,
                       borrower_name, borrower_department, borrower_email,
                       checkout_date, expected_return_date, actual_return_date,
                       checkout_status, checkout_remarks, return_remarks
                FROM checkout_records
                WHERE sample_id = %s
                ORDER BY checkout_date DESC
            """, (sample_id,))
        else:
            cur.execute("""
                SELECT id, quantity, sample_title, sample_serial, sample_type,
                       borrower_name, borrower_department, borrower_email,
                       checkout_date, expected_return_date, actual_return_date,
                       checkout_status, checkout_remarks, return_remarks
                FROM checkout_records
                ORDER BY checkout_date DESC
            """)
        rows = cur.fetchall()
        col_names = [d[0] for d in cur.description]
        result = [dict(zip(col_names, row)) for row in rows]
        conn.close()
        return result
    records = await _safe_pg_query(_query)
    return records

@app.get("/api/checkout/overdue")
async def get_overdue_checkouts(request: Request):
    """Get overdue checkouts (status OUT with expected_return_date < today)."""
    await require_admin(request)
    from datetime import date
    today = date.today().isoformat()
    database_url = _get_db_url()
    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("""
            SELECT i.id, i."Title" as sample_title, i."StorageLocationCode" as storage_location_code,
                   cr.quantity, cr.borrower_name, cr.borrower_department, cr.expected_return_date
            FROM checkout_records cr
            JOIN inventory i ON cr.sample_id = i.id
            WHERE cr.checkout_status = 'OUT' AND cr.expected_return_date < %s
        """, (today,))
        rows = cur.fetchall()
        col_names = [d[0] for d in cur.description]
        result = [dict(zip(col_names, row)) for row in rows]
        conn.close()
        return result
    overdue = await _safe_pg_query(_query)
    return overdue

# ============================================================================
# Dashboard Routes
# ============================================================================

@app.get("/api/dashboard/stats")
async def get_dashboard_stats(request: Request):
    """Get dashboard summary statistics (quantity-aware)."""
    await require_admin(request)
    database_url = _get_db_url()
    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        from datetime import date
        today = date.today().isoformat()
        cur.execute("SELECT COUNT(*) FROM inventory")
        total = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM inventory WHERE available_quantity > 0 AND \"Status\" NOT IN ('LOST', 'SCRAPPED')")
        in_stock = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM inventory WHERE available_quantity = 0 AND \"Status\" NOT IN ('LOST', 'SCRAPPED')")
        checked_out = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM checkout_records WHERE checkout_status = 'OUT' AND expected_return_date < %s", (today,))
        overdue = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM inventory WHERE \"Status\" = 'LOST'")
        lost = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM inventory WHERE \"Status\" = 'SCRAPPED'")
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
    return await _safe_pg_query(_query)
@app.get("/api/dashboard/rack-summary")
async def get_rack_summary(request: Request):
    """Get sample counts grouped by rack/storage location."""
    await require_admin(request)
    database_url = _get_db_url()
    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("""
            SELECT "StorageLocationCode" as rack,
                   COUNT(*) as total,
                   SUM(CASE WHEN "Status" = 'IN_STOCK' THEN 1 ELSE 0 END) as in_stock,
                   SUM(CASE WHEN "Status" = 'CHECKED_OUT' THEN 1 ELSE 0 END) as checked_out,
                   SUM(CASE WHEN "Status" = 'LOST' THEN 1 ELSE 0 END) as lost,
                   SUM(CASE WHEN "Status" = 'SCRAPPED' THEN 1 ELSE 0 END) as scrapped
            FROM inventory
            GROUP BY "StorageLocationCode"
            ORDER BY "StorageLocationCode"
        """)
        rows = cur.fetchall()
        col_names = [d[0] for d in cur.description]
        result = [dict(zip(col_names, row)) for row in rows]
        conn.close()
        return result
    return await _safe_pg_query(_query)
@app.get("/api/dashboard/current-checkout")
async def get_dashboard_current_checkout(request: Request):
    """Get currently checked out samples for dashboard."""
    await require_admin(request)
    database_url = _get_db_url()
    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("""
            SELECT i.id, i."Title" as sample_title, i."StorageLocationCode" as storage_location_code,
                   cr.quantity, cr.borrower_name, cr.borrower_department, cr.checkout_date, cr.expected_return_date
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
    return await _safe_pg_query(_query)
@app.get("/api/dashboard/recent-returns")
async def get_dashboard_recent_returns(request: Request, limit: int = 10):
    """Get recent returned samples for dashboard."""
    await require_admin(request)
    database_url = _get_db_url()
    def _query():
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("""
            SELECT i."Title" as sample_title, cr.quantity, cr.borrower_name, cr.borrower_department,
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
    return await _safe_pg_query(_query)