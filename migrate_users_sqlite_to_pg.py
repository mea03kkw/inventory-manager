"""Migrate users from local SQLite (sample_management.db) to Railway PostgreSQL.

Usage:
    python migrate_users_sqlite_to_pg.py                          (default: dry-run)
    python migrate_users_sqlite_to_pg.py --execute                (actually insert)
    python migrate_users_sqlite_to_pg.py --limit N                (first N rows only)
    python migrate_users_sqlite_to_pg.py --execute --limit 2
"""

import os
import sys
import sqlite3
import argparse

try:
    import psycopg2
except ImportError:
    print("ERROR: psycopg2 is required. Install with: pip install psycopg2-binary")
    sys.exit(1)

from urllib.parse import urlparse

# ============================================================================
# Constants
# ============================================================================

SQLITE_DB = "sample_management.db"

SOURCE_TABLE = "users"

SOURCE_FIELDS = [
    "username",
    "password_hash",
    "salt",
    "display_name",
    "email",
    "is_admin",
    "is_active",
    "created_at",
]

# ============================================================================
# Helpers
# ============================================================================


def _normalize_pg_url(url):
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


def _introspect_pg_users(cur):
    """Discover PG users column names and types.

    Returns:
        dict of col_name -> data_type
    """
    cur.execute(
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_name = 'users' ORDER BY ordinal_position"
    )
    return {row[0]: row[1] for row in cur.fetchall()}


def _pg_table_exists(cur, table_name):
    cur.execute(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = %s)",
        (table_name,),
    )
    return cur.fetchone()[0]


# ============================================================================
# Main
# ============================================================================


def main():
    parser = argparse.ArgumentParser(description="Migrate SQLite users to PostgreSQL")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually commit inserts to PostgreSQL (default: dry-run only)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Only process the first N source rows (for testing)",
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help="Override DATABASE_URL (default: $DATABASE_URL env var)",
    )
    args = parser.parse_args()

    dry_run = not args.execute
    mode = "DRY-RUN" if dry_run else "EXECUTE"
    print(f"=== {mode} MODE (no changes will be committed)" if dry_run else f"=== {mode} MODE (will commit to PostgreSQL) ===\n")

    # --- 1. Read from SQLite ---
    if not os.path.exists(SQLITE_DB):
        print(f"ERROR: SQLite database not found at '{SQLITE_DB}'")
        sys.exit(1)

    src_conn = sqlite3.connect(SQLITE_DB)
    src_conn.row_factory = sqlite3.Row
    src_cur = src_conn.cursor()

    # Discover actual columns in SQLite users table
    src_cur.execute(f"PRAGMA table_info({SOURCE_TABLE})")
    src_cols = {row[1] for row in src_cur.fetchall()}

    # Build SELECT only from columns that exist
    select_cols = [c for c in SOURCE_FIELDS if c in src_cols]
    src_cur.execute(f"SELECT id, {', '.join(select_cols)} FROM {SOURCE_TABLE} ORDER BY id")
    source_rows = src_cur.fetchall()
    print(f"Source SQLite users read: {len(source_rows)}")

    if args.limit and args.limit < len(source_rows):
        source_rows = source_rows[: args.limit]
        print(f"Limited to first {args.limit} rows")

    # --- 2. Connect to PostgreSQL ---
    pg_url = args.database_url or os.getenv("DATABASE_URL", "")
    if not pg_url:
        print("ERROR: DATABASE_URL not set and --database-url not provided")
        sys.exit(1)
    pg_url = _normalize_pg_url(pg_url)

    parsed = urlparse(pg_url)
    print(f"Target PostgreSQL: {parsed.hostname}:{parsed.port or 5432} / {parsed.path.lstrip('/')}")

    try:
        pg_conn = psycopg2.connect(pg_url)
        pg_cur = pg_conn.cursor()
    except Exception as e:
        print(f"ERROR: Could not connect to PostgreSQL: {e}")
        sys.exit(1)

    # Verify users table exists on target
    if not _pg_table_exists(pg_cur, "users"):
        print("ERROR: Target PostgreSQL has no 'users' table. Has the app been deployed?")
        sys.exit(1)

    # --- 3. Introspect PG target columns ---
    pg_columns = _introspect_pg_users(pg_cur)
    required_cols = ["username", "password_hash", "salt"]
    missing = [c for c in required_cols if c not in pg_columns]
    if missing:
        print(f"ERROR: Critical columns missing in target users table: {missing}")
        sys.exit(1)

    print(f"PG column introspection:")
    for col_name, col_type in pg_columns.items():
        print(f"  {col_name} ({col_type})")
    print()

    # Determine which PG columns exist (intersection of source and target)
    target_field_cols = [c for c in select_cols if c in pg_columns]

    # --- 4. Process rows ---
    inserted = 0
    skipped = []
    failed = []
    total = len(source_rows)

    for row in source_rows:
        row_dict = dict(row)
        username = row_dict["username"]

        # Check if username already exists in target
        pg_cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        if pg_cur.fetchone():
            skipped.append(username)
            continue

        # Build target column values
        # Do NOT preserve old id — let PG auto-assign
        target_cols = []
        target_vals = []

        for field in target_field_cols:
            if field in ("is_admin", "is_active"):
                raw_val = row_dict.get(field, 0)
                pg_type = pg_columns.get(field, "boolean")
                if pg_type == "boolean":
                    target_vals.append(bool(int(raw_val)) if raw_val is not None else False)
                else:
                    target_vals.append(int(raw_val) if raw_val is not None else 0)
                target_cols.append(field)
            elif field == "created_at":
                val = row_dict.get(field)
                if val is not None:
                    target_cols.append(field)
                    target_vals.append(val)
                # If None or missing, skip — PG will use CURRENT_TIMESTAMP default
            else:
                val = row_dict.get(field)
                target_cols.append(field)
                target_vals.append(val if val is not None else None)

        if dry_run:
            print(f"  [DRY-RUN] Would insert username={username}, "
                  f"is_admin={target_vals[target_cols.index('is_admin')]}, "
                  f"is_active={target_vals[target_cols.index('is_active')]}")
            inserted += 1
        else:
            try:
                cols_sql = ", ".join(target_cols)
                placeholders = ", ".join(["%s"] * len(target_vals))
                sql = f"INSERT INTO users ({cols_sql}) VALUES ({placeholders})"
                pg_cur.execute(sql, target_vals)
                pg_conn.commit()
                inserted += 1
            except Exception as e:
                print(f"  [FAILED] username={username}: {e}")
                failed.append(username)
                pg_conn.rollback()
                continue

    pg_conn.close()
    src_conn.close()

    # --- 5. Summary ---
    print()
    print("=" * 50)
    print("MIGRATION SUMMARY")
    print("=" * 50)
    print(f"Source rows read:  {total}")
    print(f"Inserted:          {inserted}")
    print(f"Skipped (exist):   {len(skipped)}")
    if skipped:
        print(f"  Usernames: {skipped}")
    print(f"Failed:            {len(failed)}")
    if failed:
        print(f"  Usernames: {failed}")

    if dry_run:
        print()
        print("DRY-RUN complete. Run with --execute to commit.")
        if inserted == 0:
            print("(No rows to insert — all exist in target.)")


if __name__ == "__main__":
    main()
