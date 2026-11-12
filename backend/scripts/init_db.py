"""
Standalone database setup and migration script.
Creates the database if it doesn't exist, builds all tables,
adds missing columns, and seeds default records.
"""

import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv

# Load environment variables from backend/.env
env_path = backend_dir / ".env"
load_dotenv(dotenv_path=env_path)

from common.database.init_db import init_database


def main():
    print("\n" + "=" * 60)
    print("STANDALONE DATABASE SETUP & MIGRATION")
    print("Creating tables, checking columns, and seeding default data...")
    print("=" * 60)

    try:
        init_database()
        print("=" * 60)
        print("✓ Database setup completed successfully!")
        print("=" * 60 + "\n")
    except Exception as e:
        print("\n" + "=" * 60)
        print(f"✗ Database initialization failed: {e}")
        print("=" * 60 + "\n")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

