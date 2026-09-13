import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL, connect_args={"sslmode": "require"})

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;"))
        print("Added created_at to wardrobe_items")
    except Exception as e:
        print("wardrobe_items created_at error:", e)
        
    try:
        conn.execute(text("ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;"))
        print("Added updated_at to wardrobe_items")
    except Exception as e:
        print("wardrobe_items updated_at error:", e)
    
    conn.commit()
