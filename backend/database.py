import os
from sqlalchemy import create_engine, Column, String, Float, Boolean, JSON, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"sslmode": "require"} if "neon.tech" in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class WardrobeItemDB(Base):
    __tablename__ = "clothing_items"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    sub_type = Column(String, nullable=True)
    color = Column(String, nullable=False)
    brand = Column(String, nullable=True)
    tags = Column(JSON, default=[])
    seasons = Column(JSON, default=[])
    occasions = Column(JSON, default=[])
    image_url = Column(String, nullable=True)
    is_favourite = Column(Boolean, default=False)
    last_worn = Column(String, nullable=True)
    created_at = Column(String, nullable=True)

class OutfitHistoryDB(Base):
    __tablename__ = "outfit_history"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=True)
    top_item_id = Column(String, nullable=False)
    bottom_item_id = Column(String, nullable=False)
    occasion_display = Column(String, nullable=False)
    occasion_category = Column(String, nullable=False)
    weather_temp = Column(Float, nullable=False)
    season = Column(String, nullable=False)
    worn_date = Column(String, nullable=False)
    created_at = Column(String, nullable=False)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
