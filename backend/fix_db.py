import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL, connect_args={"sslmode": "require"})

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE clothing_items ADD COLUMN IF NOT EXISTS created_at VARCHAR;"))
        print("Added created_at to clothing_items")
    except Exception as e:
        print("clothing_items error:", e)
        
    try:
        conn.execute(text("ALTER TABLE outfit_history ADD COLUMN IF NOT EXISTS created_at VARCHAR;"))
        print("Added created_at to outfit_history")
    except Exception as e:
        print("outfit_history error:", e)
    
    conn.commit()
