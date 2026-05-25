import os
import psycopg2

DATABASE_PUBLIC_URL = os.getenv("DATABASE_PUBLIC_URL")

if not DATABASE_PUBLIC_URL:
    print("DATABASE_PUBLIC_URL is not set. This local seed script must use the Railway public PostgreSQL URL.")
    exit(1)

if DATABASE_PUBLIC_URL.startswith("postgres://"):
    DATABASE_PUBLIC_URL = DATABASE_PUBLIC_URL.replace("postgres://", "postgresql://", 1)

sample_types = ["Evaluation", "Engineering", "Marketing", "Reference"]
brands = ["Philips", "MOKO", "DemoBrand"]
categories = ["Personal Care", "Home Appliance", "Medical", "Lighting"]
sub_categories = ["Test Unit", "Reference Unit", "Prototype", "Production Sample"]
departments = ["G&B", "R&D", "Quality", "PMO"]
conditions = ["New", "Good", "Used"]
dates = [f"2026-05-{d:02d}" for d in range(1, 20)]

unit_counts = [(i % 20) + 1 for i in range(50)]

def storage_location(i):
    rack_letter = chr(ord('A') + (i // 5) % 5)
    shelf = ((i % 25) // 5) + 1
    slot = (i % 5) + 1
    return f"{rack_letter}{shelf}-{slot:02d}"

rows = []
for i in range(50):
    n = unit_counts[i]
    rows.append((
        f"Dummy Sample {i+1:03d}",
        f"DUM-20260519-{i+1:03d}",
        sample_types[i % len(sample_types)],
        f"Demo Product {i+1:03d}",
        brands[i % len(brands)],
        f"MDL-{i+1:03d}",
        categories[i % len(categories)],
        sub_categories[i % len(sub_categories)],
        departments[i % len(departments)],
        conditions[i % len(conditions)],
        dates[i % len(dates)],
        storage_location(i),
        n,
        "pcs",
        "Dummy seed data for Railway testing",
        "IN_STOCK",
        n,
        n,
    ))

sql = """INSERT INTO inventory (
  "Title", "SerialNum", "SampleType", "ProductName",
  "Brand", "Model", "Category", "SubCategory",
  "DepartmentOwner", "Condition", "DateReceived",
  "StorageLocationCode", "UnitCount", "UnitMeasure",
  "Notes", "Status", quantity, available_quantity
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"""

conn = None
cur = None
try:
    conn = psycopg2.connect(DATABASE_PUBLIC_URL, sslmode="require")
    conn.set_session(autocommit=True)
    cur = conn.cursor()
    cur.executemany(sql, rows)
    conn.commit()
    print("Inserted 50 dummy inventory rows.")
except Exception as e:
    if conn:
        conn.rollback()
    print(e)
    exit(1)
finally:
    if cur:
        cur.close()
    if conn:
        conn.close()
