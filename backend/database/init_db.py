import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "appliances.db"

connection = sqlite3.connect(DB)


connection.execute("""
    CREATE TABLE appliances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        wattage INTEGER NOT NULL CHECK (wattage > 0),
        priority INTEGER NOT NULL CHECK (priority > 0),
        state TEXT NOT NULL DEFAULT 'off' CHECK (state IN ('running', 'off', 'shed')),
        shed_at TEXT
    )
""")

connection.commit()
connection.close()

print(f"Table created in {DB}")