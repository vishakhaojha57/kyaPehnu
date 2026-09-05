from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Header, Request
from sqlalchemy.orm import Session
import cloudinary
import cloudinary.uploader
from database import get_db, WardrobeItemDB, OutfitHistoryDB, engine, Base

from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Union
import os
import uuid
import random
from datetime import datetime
import base64
import re
from fastapi.staticfiles import StaticFiles

# Load .env manually
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ[k] = v

from services.vision_service import process_vision_pipeline


# Pydantic Schemas

class WardrobeItem(BaseModel):
    id: str
    name: str
    category: str
    sub_type: Optional[str] = None
    color: str
    brand: Optional[str] = None
    tags: List[str] = []
    seasons: List[str] = []
    occasions: List[str] = []
    image_url: Optional[str] = None
    is_favourite: bool = False
    last_worn: Optional[str] = None

class WearOutfitRequest(BaseModel):
    top_item_id: str
    bottom_item_id: str
    occasion_text: str
    weather_temp: float
    season: str

class OutfitHistoryRecord(BaseModel):
    id: str
    top_item_id: str
    bottom_item_id: str
    occasion_display: str
    occasion_category: str
    weather_temp: float
    season: str
    worn_date: str
    created_at: str
    top_item: Optional[WardrobeItem] = None
    bottom_item: Optional[WardrobeItem] = None

class OutfitSuggestion(BaseModel):
    id: str
    occasion: str
    items: List[WardrobeItem]
    confidence_score: float
    style_note: str

class AddItemRequest(BaseModel):
    name: str
    category: str
    sub_type: Optional[str] = None
    color: str
    brand: Optional[str] = None
    tags: List[str] = []
    seasons: List[str] = []
    occasions: List[str] = []
    image_url: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    version: str
    mode: str

class VisionResult(BaseModel):
    clothing_type: str
    sub_type: str
    hex_color: str

class DetectedItemResult(BaseModel):
    category: str
    sub_type: str
    hex_color: str
    crop_b64: str
    confidence: float
    box: List[int]
    fallback: bool
    seasons: List[str]
    occasions: List[str]

class VisionResultV3(BaseModel):
    clothing_type: str
    sub_category: str
    specific_type: str
    hex_color: str

class ScanResultItemV2(BaseModel):
    id: str
    category: str
    sub_type: str
    name: str
    box_coordinates: List[int]
    image_crop_blob_reference: str
    seasons: List[str]
    occasions: List[str]

class ConsolidatedVisionResponse(BaseModel):
    status: str
    message: str
    detected_items: List[ScanResultItemV2]


# App

app = FastAPI(
    title="KyaPehnu API",
    description="Wardrobe intelligence",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/static/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# Routes

@app.get("/health", response_model=HealthResponse, tags=["System"])
def health_check():
    return HealthResponse(status="ok", version="0.1.0", mode="mock")


@app.get("/vision/debug", tags=["Vision"])
async def vision_debug():
    import urllib.request, urllib.error, os, json
    api_key = os.environ.get("GEMINI_API_KEY", "")
    result = {
        "gemini_api_key_set": bool(api_key),
        "gemini_api_key_prefix": api_key[:6] + "..." if api_key else None,
        "gemini_reachable": False,
        "gemini_error": None,
        "gemini_response_sample": None,
    }
    if api_key:
        try:
            payload = {
                "contents": [{"parts": [{"text": "Say hello in one word."}]}],
                "generationConfig": {"temperature": 0.1}
            }
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=8.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                result["gemini_reachable"] = True
                result["gemini_response_sample"] = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception as e:
            result["gemini_error"] = str(e)
    return result


def get_current_user_id(x_user_id: Optional[str] = Header(None)):
    return x_user_id

@app.get("/api/wardrobe", response_model=List[WardrobeItem], tags=["Wardrobe"])
def get_all_items(db: Session = Depends(get_db), user_id: Optional[str] = Depends(get_current_user_id)):
    query = db.query(WardrobeItemDB).filter(WardrobeItemDB.category.isnot(None))
    if user_id:
        query = query.filter(WardrobeItemDB.user_id == user_id)
    items = query.order_by(WardrobeItemDB.created_at.desc()).all()
    return [WardrobeItem(**{k: getattr(i, k) for k in WardrobeItem.model_fields.keys() if hasattr(i, k)}) for i in items]


@app.get("/api/wardrobe/{item_id}", response_model=WardrobeItem, tags=["Wardrobe"])
def get_item(item_id: str, db: Session = Depends(get_db), user_id: Optional[str] = Depends(get_current_user_id)):
    query = db.query(WardrobeItemDB).filter(WardrobeItemDB.id == item_id)
    if user_id:
        query = query.filter(WardrobeItemDB.user_id == user_id)
    item = query.first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Item '{item_id}' not found.")
    return WardrobeItem(**{k: getattr(item, k) for k in WardrobeItem.model_fields.keys() if hasattr(item, k)})

class ItemEditModel(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    sub_type: Optional[str] = None
    color: Optional[str] = None
    brand: Optional[str] = None

@app.put("/api/wardrobe/{item_id}", response_model=WardrobeItem, tags=["Wardrobe"])
def update_item(item_id: str, item_data: ItemEditModel, db: Session = Depends(get_db), user_id: Optional[str] = Depends(get_current_user_id)):
    query = db.query(WardrobeItemDB).filter(WardrobeItemDB.id == item_id)
    if user_id:
        query = query.filter((WardrobeItemDB.user_id == user_id) | (WardrobeItemDB.user_id.is_(None)))
    item = query.first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Item '{item_id}' not found.")
    update_data = item_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return WardrobeItem(**{k: getattr(item, k) for k in WardrobeItem.model_fields.keys() if hasattr(item, k)})


@app.post("/api/wardrobe/add", response_model=WardrobeItem, status_code=201, tags=["Wardrobe"])
def add_item(payload: AddItemRequest, request: Request, db: Session = Depends(get_db), user_id: Optional[str] = Depends(get_current_user_id)):
    mapped_sub_type = payload.sub_type or getattr(payload, "type", None)
    if not mapped_sub_type:
        cat = payload.category.lower() if payload.category else ""
        if cat == "top":
            mapped_sub_type = "Shirt/T-Shirt"
        elif cat == "bottom":
            mapped_sub_type = "Pants/Jeans"
        else:
            mapped_sub_type = "T-Shirt"

    if not payload.category:
        raise HTTPException(status_code=400, detail="category cannot be null")

    final_image_url = payload.image_url
    if final_image_url and final_image_url.startswith("data:image"):
        cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME")
        api_key = os.environ.get("CLOUDINARY_API_KEY")
        api_secret = os.environ.get("CLOUDINARY_API_SECRET")

        if cloud_name and api_key and api_secret:
            try:
                cloudinary.config(
                    cloud_name=cloud_name,
                    api_key=api_key,
                    api_secret=api_secret,
                    secure=True
                )
                upload_result = cloudinary.uploader.upload(final_image_url, folder="kyapehnu")
                final_image_url = upload_result.get("secure_url")
            except Exception as e:
                print(f"Cloudinary upload failed: {e}")
                raise HTTPException(status_code=500, detail="Image upload to Cloudinary failed.")
        else:
            try:
                match = re.match(r'data:image/(?P<ext>\w+);base64,(?P<data>.*)', final_image_url)
                if match:
                    ext = match.group('ext')
                    if ext not in ['jpeg', 'jpg', 'png', 'webp']:
                        ext = 'jpg'
                    b64_data = match.group('data')
                    image_data = base64.b64decode(b64_data)
                    filename = f"img_{uuid.uuid4().hex[:10]}.{ext}"
                    file_path = os.path.join(UPLOAD_DIR, filename)
                    with open(file_path, "wb") as f:
                        f.write(image_data)
                    base_url = str(request.base_url).rstrip("/")
                    final_image_url = f"{base_url}/static/uploads/{filename}"
            except Exception as e:
                print(f"Error saving local image: {e}")
                pass

    now_iso = datetime.utcnow().isoformat()
    new_item = WardrobeItemDB(
        id=f"item-{uuid.uuid4().hex[:6]}",
        name=payload.name,
        category=payload.category,
        sub_type=mapped_sub_type,
        color=payload.color,
        brand=payload.brand,
        tags=payload.tags,
        seasons=payload.seasons,
        occasions=payload.occasions,
        image_url=final_image_url,
        is_favourite=False,
        created_at=now_iso,
        user_id=user_id,
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return WardrobeItem(**{k: getattr(new_item, k) for k in WardrobeItem.model_fields.keys() if hasattr(new_item, k)})


@app.delete("/api/wardrobe/{item_id}", tags=["Wardrobe"])
def delete_item(item_id: str, db: Session = Depends(get_db), user_id: Optional[str] = Depends(get_current_user_id)):
    query = db.query(WardrobeItemDB).filter(WardrobeItemDB.id == item_id)
    if user_id:
        query = query.filter(WardrobeItemDB.user_id == user_id)
    item = query.first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Item '{item_id}' not found.")
    db.delete(item)
    db.commit()
    return {"deleted": item_id}


@app.get("/outfits/suggestions", response_model=List[OutfitSuggestion], tags=["Outfits"])
def get_outfit_suggestions(occasion: Optional[str] = None, db: Session = Depends(get_db), user_id: Optional[str] = Depends(get_current_user_id)):
    query = db.query(WardrobeItemDB).filter(WardrobeItemDB.category.isnot(None))
    if user_id:
        query = query.filter(WardrobeItemDB.user_id == user_id)
    db_items = query.all()
    items = [WardrobeItem(**{k: getattr(i, k) for k in WardrobeItem.model_fields.keys() if hasattr(i, k)}) for i in db_items]

    tops = [item for item in items if item.category.lower() in ["top", "tops", "topwear", "t-shirt", "shirt"]]
    bottoms = [item for item in items if item.category.lower() in ["bottom", "bottoms", "bottomwear", "pants", "jeans", "trousers"]]
    footwear = [item for item in items if item.category.lower() in ["footwear", "shoes", "sneakers", "accessory"]]
    full_outfits = [item for item in items if item.category.lower() in ["outfit", "dress", "dresses", "suit", "suits", "lehenga", "traditional", "co-ord", "one-piece", "ethnic"]]

    suggestions = []
    neutrals = ["black", "white", "grey", "gray", "navy", "beige", "brown", "cream"]

    # ── 1. Create full outfit suggestions (Dresses, Lehengas, Suits) ───────────
    for full_item in full_outfits:
        occ = "casual"
        if full_item.occasions:
            all_occ = " ".join(o.lower() for o in full_item.occasions)
            if any(k in all_occ for k in ["wedding", "festive", "traditional"]):
                occ = "festive"
            elif any(k in all_occ for k in ["party", "clubbing"]):
                occ = "party"
            elif any(k in all_occ for k in ["formal", "office"]):
                occ = "formal"
            elif any(k in all_occ for k in ["college"]):
                occ = "college_daily"
            else:
                occ = full_item.occasions[0].lower()

        if occasion and occasion.lower() not in occ and not any(occasion.lower() in o.lower() for o in full_item.occasions):
            continue

        outfit_items = [full_item]
        if footwear:
            matching_shoes = [s for s in footwear if any(o.lower() in occ for o in s.occasions)]
            if matching_shoes:
                outfit_items.append(random.choice(matching_shoes))

        score = round(random.uniform(0.93, 0.98), 2)
        note = f"Complete {full_item.name} ensemble. Elegant and effortlessly coordinated."

        suggestions.append(OutfitSuggestion(
            id=f"outfit-{uuid.uuid4().hex[:6]}",
            occasion=occ,
            items=outfit_items,
            confidence_score=score,
            style_note=note
        ))

    # ── 2. Create 2-piece Top + Bottom combinations ───────────────────────────
    if tops and bottoms:
        if occasion:
            occasion_lower = occasion.lower()
            def filter_occ(lst):
                filtered = [i for i in lst if any(occasion_lower in occ.lower() for occ in i.occasions)]
                return filtered if filtered else lst
            cand_tops = filter_occ(tops)
            cand_bottoms = filter_occ(bottoms)
            cand_footwear = filter_occ(footwear) if footwear else []
        else:
            cand_tops = list(tops)
            cand_bottoms = list(bottoms)
            cand_footwear = list(footwear)

        random.shuffle(cand_tops)
        random.shuffle(cand_bottoms)

        # Generate a diverse set across occasions
        target_count = max(15, min(30, len(cand_tops) * len(cand_bottoms)))
        for _ in range(target_count):
            top = random.choice(cand_tops)
            bottom = random.choice(cand_bottoms)
            shoes = random.choice(cand_footwear) if cand_footwear else None

            is_top_neutral = any(n in top.color.lower() for n in neutrals)
            is_bottom_neutral = any(n in bottom.color.lower() for n in neutrals)

            if is_top_neutral and is_bottom_neutral:
                score = round(random.uniform(0.92, 0.98), 2)
                note = "Classic neutral combo, highly versatile and safe."
            elif is_top_neutral or is_bottom_neutral:
                score = round(random.uniform(0.88, 0.95), 2)
                note = "Great balance! A pop of color anchored by a neutral piece."
            else:
                if top.color.lower() == bottom.color.lower():
                    score = round(random.uniform(0.85, 0.90), 2)
                    note = "Monochrome look. Bold and stylish."
                else:
                    score = round(random.uniform(0.80, 0.88), 2)
                    note = "Vibrant color blocking combo. Perfect for standing out."

            outfit_items = [top, bottom]
            if shoes:
                outfit_items.append(shoes)

            top_occs = set(occ.lower() for occ in top.occasions)
            bot_occs = set(occ.lower() for occ in bottom.occasions)
            shared_occs = top_occs.intersection(bot_occs)

            if occasion:
                final_occasion = occasion
            elif shared_occs:
                raw_occ = list(shared_occs)[0]
                if "party" in raw_occ:
                    final_occasion = "party"
                elif "festive" in raw_occ or "wedding" in raw_occ:
                    final_occasion = "festive"
                elif "formal" in raw_occ or "office" in raw_occ:
                    final_occasion = "formal"
                elif "college" in raw_occ:
                    final_occasion = "college_daily"
                else:
                    final_occasion = raw_occ
            else:
                final_occasion = "casual"

            suggestions.append(OutfitSuggestion(
                id=f"outfit-{uuid.uuid4().hex[:6]}",
                occasion=final_occasion,
                items=outfit_items,
                confidence_score=score,
                style_note=note
            ))

    unique_suggestions = []
    seen = set()
    for sug in suggestions:
        combo_key = tuple(sorted([item.id for item in sug.items]))
        if combo_key not in seen:
            seen.add(combo_key)
            unique_suggestions.append(sug)
        if len(unique_suggestions) >= 25:
            break

    unique_suggestions.sort(key=lambda x: x.confidence_score, reverse=True)
    return unique_suggestions


@app.get("/outfits/suggestions/{outfit_id}", response_model=OutfitSuggestion, tags=["Outfits"])
def get_outfit_by_id(outfit_id: str):
    raise HTTPException(status_code=404, detail=f"Outfit '{outfit_id}' not found.")


@app.post("/outfits/wear", status_code=201, tags=["Outfits"])
def log_outfit_wear(payload: WearOutfitRequest, db: Session = Depends(get_db), user_id: Optional[str] = Depends(get_current_user_id)):
    text_lower = payload.occasion_text.lower()
    cat = "casual"
    if any(x in text_lower for x in ["office", "work", "meeting", "formal"]):
        cat = "office"
    elif any(x in text_lower for x in ["party", "club", "night", "date"]):
        cat = "party"
    elif any(x in text_lower for x in ["festive", "wedding", "traditional", "pooja"]):
        cat = "festive"
    elif any(x in text_lower for x in ["college", "class", "uni"]):
        cat = "college"
    elif any(x in text_lower for x in ["gym", "sport", "workout", "trek", "run"]):
        cat = "sport"

    now_iso = datetime.utcnow().isoformat()
    record_id = f"hist-{uuid.uuid4().hex[:8]}"

    top_item_db = db.query(WardrobeItemDB).filter(WardrobeItemDB.id == payload.top_item_id).first()
    bottom_item_db = db.query(WardrobeItemDB).filter(WardrobeItemDB.id == payload.bottom_item_id).first()

    record_db = OutfitHistoryDB(
        id=record_id,
        top_item_id=payload.top_item_id,
        bottom_item_id=payload.bottom_item_id,
        occasion_display=payload.occasion_text,
        occasion_category=cat,
        weather_temp=payload.weather_temp,
        season=payload.season,
        worn_date=now_iso[:10],
        created_at=now_iso,
        user_id=user_id,
    )
    db.add(record_db)

    if top_item_db:
        top_item_db.last_worn = now_iso
    if bottom_item_db:
        bottom_item_db.last_worn = now_iso

    db.commit()
    return {"message": "Outfit logged successfully"}

@app.get("/outfits/history", response_model=List[OutfitHistoryRecord], tags=["Outfits"])
def get_outfit_history(db: Session = Depends(get_db), user_id: Optional[str] = Depends(get_current_user_id)):
    query = db.query(OutfitHistoryDB)
    if user_id:
        query = query.filter(OutfitHistoryDB.user_id == user_id)
    hist_records = query.order_by(OutfitHistoryDB.created_at.desc()).all()
    results = []
    for hist in hist_records:
        top_db = db.query(WardrobeItemDB).filter(WardrobeItemDB.id == hist.top_item_id).first()
        bot_db = db.query(WardrobeItemDB).filter(WardrobeItemDB.id == hist.bottom_item_id).first()
        hist_dict = {k: getattr(hist, k) for k in OutfitHistoryRecord.model_fields.keys() if hasattr(hist, k) and getattr(hist, k) is not None}
        if top_db:
            hist_dict["top_item"] = {k: getattr(top_db, k) for k in WardrobeItem.model_fields.keys() if hasattr(top_db, k)}
        if bot_db:
            hist_dict["bottom_item"] = {k: getattr(bot_db, k) for k in WardrobeItem.model_fields.keys() if hasattr(bot_db, k)}
        results.append(OutfitHistoryRecord(**hist_dict))
    return results

@app.delete("/outfits/history/{record_id}", tags=["Outfits"])
def delete_outfit_history(record_id: str, db: Session = Depends(get_db), user_id: Optional[str] = Depends(get_current_user_id)):
    query = db.query(OutfitHistoryDB).filter(OutfitHistoryDB.id == record_id)
    if user_id:
        query = query.filter(OutfitHistoryDB.user_id == user_id)
    record = query.first()
    if not record:
        raise HTTPException(status_code=404, detail=f"History record '{record_id}' not found.")
    db.delete(record)
    db.commit()
    return {"deleted": record_id}


class RepetitionCheckResponse(BaseModel):
    top_worn_ago_days: Optional[int] = None
    top_last_occasion: Optional[str] = None
    bottom_worn_ago_days: Optional[int] = None
    bottom_last_occasion: Optional[str] = None
    combo_worn_ago_days: Optional[int] = None
    combo_last_occasion: Optional[str] = None
    top_worn_count_month: int = 0
    bottom_worn_count_month: int = 0
    combo_worn_count_month: int = 0


@app.get("/outfits/repetition-check", response_model=RepetitionCheckResponse, tags=["Outfits"])
def check_repetition(
    top_id: str,
    bottom_id: str,
    db: Session = Depends(get_db),
    user_id: Optional[str] = Depends(get_current_user_id),
):
    """
    Check how recently the given top, bottom, or their combination has been worn.
    Returns days-ago counts and the occasion they were last worn on.
    """
    today = datetime.utcnow().date()
    thirty_days_ago = (datetime.utcnow().replace(day=1)).date()  # start of this month

    query = db.query(OutfitHistoryDB)
    if user_id:
        query = query.filter(OutfitHistoryDB.user_id == user_id)
    all_history = query.order_by(OutfitHistoryDB.worn_date.desc()).all()

    def days_ago(worn_date_str: str) -> Optional[int]:
        try:
            worn = datetime.strptime(worn_date_str[:10], "%Y-%m-%d").date()
            return (today - worn).days
        except Exception:
            return None

    # --- Top analysis ---
    top_worn_ago_days = None
    top_last_occasion = None
    top_worn_count_month = 0
    for rec in all_history:
        if rec.top_item_id == top_id:
            d = days_ago(rec.worn_date)
            if top_worn_ago_days is None and d is not None:
                top_worn_ago_days = d
                top_last_occasion = rec.occasion_display
            try:
                worn_date = datetime.strptime(rec.worn_date[:10], "%Y-%m-%d").date()
                if worn_date >= thirty_days_ago:
                    top_worn_count_month += 1
            except Exception:
                pass

    # --- Bottom analysis ---
    bottom_worn_ago_days = None
    bottom_last_occasion = None
    bottom_worn_count_month = 0
    for rec in all_history:
        if rec.bottom_item_id == bottom_id:
            d = days_ago(rec.worn_date)
            if bottom_worn_ago_days is None and d is not None:
                bottom_worn_ago_days = d
                bottom_last_occasion = rec.occasion_display
            try:
                worn_date = datetime.strptime(rec.worn_date[:10], "%Y-%m-%d").date()
                if worn_date >= thirty_days_ago:
                    bottom_worn_count_month += 1
            except Exception:
                pass

    # --- Combo analysis ---
    combo_worn_ago_days = None
    combo_last_occasion = None
    combo_worn_count_month = 0
    for rec in all_history:
        if rec.top_item_id == top_id and rec.bottom_item_id == bottom_id:
            d = days_ago(rec.worn_date)
            if combo_worn_ago_days is None and d is not None:
                combo_worn_ago_days = d
                combo_last_occasion = rec.occasion_display
            try:
                worn_date = datetime.strptime(rec.worn_date[:10], "%Y-%m-%d").date()
                if worn_date >= thirty_days_ago:
                    combo_worn_count_month += 1
            except Exception:
                pass

    return RepetitionCheckResponse(
        top_worn_ago_days=top_worn_ago_days,
        top_last_occasion=top_last_occasion,
        bottom_worn_ago_days=bottom_worn_ago_days,
        bottom_last_occasion=bottom_last_occasion,
        combo_worn_ago_days=combo_worn_ago_days,
        combo_last_occasion=combo_last_occasion,
        top_worn_count_month=top_worn_count_month,
        bottom_worn_count_month=bottom_worn_count_month,
        combo_worn_count_month=combo_worn_count_month,
    )


# Vision Route

@app.post("/vision/analyze", response_model=ConsolidatedVisionResponse, tags=["Vision"])
async def analyze_clothing_image(
    file: UploadFile = File(..., description="JPEG or PNG image of a clothing item or outfit"),
) -> ConsolidatedVisionResponse:
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=415,
            detail=f"Expected an image file, got '{file.content_type}'.",
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file received.")

    try:
        result = await process_vision_pipeline(image_bytes)
        del image_bytes
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Vision pipeline failed: {exc}")

    return result
