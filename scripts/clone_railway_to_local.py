"""Safe local clone of Railway PostgreSQL into local Docker PostgreSQL for testing.

Usage:
  1. Set RAILWAY_DATABASE_URL in .env to the Railway PostgreSQL URL (read-only source).
  2. Ensure DATABASE_URL in .env points to local Docker PostgreSQL (restore target).
  3. Run: python scripts/clone_railway_to_local.py

Safety guarantees:
  - Refuses to run on Railway (checks RAILWAY_SERVICE_ID).
  - Source must be a remote host (not localhost/127.0.0.1/::1).
  - Target must be a local host (localhost/127.0.0.1/::1).
  - Only reads from Railway (pg_dump).
  - Only writes to local Docker PostgreSQL (pg_restore).
  - Dump file is stored in tmp/ and cleaned up after restore.
  - Does not modify app DATABASE_URL or .env.
"""

import os
import subprocess
import sys
from urllib.parse import urlparse


# ─── Safety Guards ───────────────────────────────────────────────────────────


def _check_tool(name: str) -> bool:
    try:
        subprocess.run([name, "--version"], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def _fail(msg: str):
    print(f"ERROR: {msg}")
    sys.exit(1)


# Guard 1: Must not run on Railway
if os.environ.get("RAILWAY_SERVICE_ID"):
    _fail("Refusing to run on Railway. This script is for local development only.")

# Guard 2: Check required tools
if not _check_tool("pg_dump"):
    _fail(
        "pg_dump not found. Install PostgreSQL client tools "
        "(e.g., via EDB installer, or `apt install postgresql-client`)."
    )
if not _check_tool("pg_restore"):
    _fail(
        "pg_restore not found. Install PostgreSQL client tools."
    )

# Guard 3: Source URL from RAILWAY_DATABASE_URL
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

source_url = os.environ.get("RAILWAY_DATABASE_URL", "").strip()
if not source_url:
    _fail(
        "RAILWAY_DATABASE_URL is not set. Add it to .env:\n"
        "  RAILWAY_DATABASE_URL=postgresql://user:pass@host:port/db"
    )

if source_url.startswith("postgres://"):
    source_url = source_url.replace("postgres://", "postgresql://", 1)

source_parsed = urlparse(source_url)
if source_parsed.hostname in LOCAL_HOSTS:
    _fail(
        f"Source URL points to localhost ({source_parsed.hostname}). "
        "RAILWAY_DATABASE_URL must be a remote Railway host."
    )

# Guard 4: Target URL from DATABASE_URL (must be local)
target_url = os.environ.get("DATABASE_URL", "").strip()
if not target_url:
    _fail("DATABASE_URL is not set. It must point to the local Docker PostgreSQL.")

if target_url.startswith("postgres://"):
    target_url = target_url.replace("postgres://", "postgresql://", 1)

target_parsed = urlparse(target_url)
if not target_parsed.hostname or target_parsed.hostname not in LOCAL_HOSTS:
    _fail(
        f"Target URL must point to a local PostgreSQL host "
        f"(localhost/127.0.0.1/::1), got '{target_parsed.hostname}'."
    )


# ─── Clone Workflow ──────────────────────────────────────────────────────────


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DUMP_DIR = os.path.join(SCRIPT_DIR, "..", "tmp")
DUMP_PATH = os.path.join(DUMP_DIR, "railway_dump.dump")

os.makedirs(DUMP_DIR, exist_ok=True)

print(f"Source: {source_parsed.hostname}:{source_parsed.port or 5432}/{source_parsed.path.lstrip('/')}")
print(f"Target: {target_parsed.hostname}:{target_parsed.port or 5432}/{target_parsed.path.lstrip('/')}")
print()

# Step 1: Dump from Railway (read-only)
print("Dumping Railway PostgreSQL (read-only)...")
dump_result = subprocess.run(
    ["pg_dump", "--no-owner", "-Fc", "-f", DUMP_PATH, source_url],
    capture_output=True, text=True,
)
if dump_result.returncode != 0:
    _fail(f"pg_dump failed:\n{dump_result.stderr}")
print(f"  Dump saved to {DUMP_PATH}")

# Step 2: Restore into local Docker PostgreSQL
print("Restoring into local Docker PostgreSQL...")
restore_result = subprocess.run(
    ["pg_restore", "--no-owner", "--clean", "-d", target_url, DUMP_PATH],
    capture_output=True, text=True,
)
if restore_result.returncode != 0:
    _fail(f"pg_restore failed:\n{restore_result.stderr}")
print("  Restore complete.")

# Step 3: Clean up dump file
os.remove(DUMP_PATH)
print(f"  Dump file {DUMP_PATH} deleted.")

print()
print("Done. Local PostgreSQL now has a copy of Railway data.")
print("The app continues to use DATABASE_URL (local PostgreSQL). No production data was modified.")