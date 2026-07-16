"""
KyaPehnu – FastAPI Backend
Zero-infrastructure: in-memory JSON buffers only.
No database, no ORM — vision runs from a cached global model.
"""

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Union
import os
import uuid

# Load .env file manually to avoid new dependencies
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ[k] = v

# Vision module: models are loaded ONCE at import time (module-level singletons)
from vision import classify_image, detect_and_classify, detect_and_classify_v2, classify_image_v3, process_vision_pipeline

# ──────────────────────────────────────────────
# PYDANTIC SCHEMAS  (single source of truth)
# These keys MUST mirror TypeScript interfaces
# ──────────────────────────────────────────────

class WardrobeItem(BaseModel):
    id: str
    name: str
    category: str          # "top" | "bottom" | "footwear" | "accessory" | "outfit"
    color: str
    brand: Optional[str] = None
    tags: List[str] = []
    seasons: List[str] = []
    occasions: List[str] = []
    image_url: Optional[str] = None
    is_favourite: bool = False

class OutfitSuggestion(BaseModel):
    id: str
    occasion: str          # "casual" | "formal" | "party" | "sport"
    items: List[WardrobeItem]
    confidence_score: float   # 0.0 – 1.0  (mock value)
    style_note: str

class AddItemRequest(BaseModel):
    name: str
    category: str
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
    clothing_type: str   # "top" | "bottom" | "footwear" | "accessory" | "outfit"
    sub_type:      str   # Fine-grained label — JSON metadata only, no DB column
    hex_color:     str   # e.g. "#3a2f1c"

class DetectedItemResult(BaseModel):
    """One item from the multi-crop YOLO + ViT scan pipeline (v1 contract)."""
    category:   str        # "top" | "bottom" | "footwear" | "accessory" | "outfit"
    sub_type:   str        # e.g. "t-shirt", "shorts", "sneakers"
    hex_color:  str        # "#rrggbb"
    crop_b64:   str        # data:image/jpeg;base64,... (in-memory blob)
    confidence: float      # YOLO confidence (1.0 for fallback)
    box:        List[int]  # [x1, y1, x2, y2]
    fallback:   bool       # True when YOLO found nothing
    seasons:    List[str]  # e.g. ["summer", "monsoon"]
    occasions:  List[str]  # e.g. ["casual", "festive"]


class VisionResultV3(BaseModel):
    """
    Tri-Tier Validation Matrix — V3 JSON contract.
    All values are in-memory runtime strings; zero DB columns are created or altered.
    specific_type is stored in tags TEXT[] or meta JSON at persistence time.
    """
    clothing_type: str   # broad bucket: "top" | "bottom" | "footwear" | "accessory" | "outfit"
    sub_category:  str   # Tier 1/2 resolved label e.g. "jeans", "shirt", "sneakers"
    specific_type: str   # Tier 3 label e.g. "baggy", "formal_shirt", "high_top"; "" = general
    hex_color:     str   # dominant colour e.g. "#222636"


class ScanResultItemV2(BaseModel):
    """
    V2 Integrity Contract — maps onto Neon PostgreSQL and Next.js grid.
    All values are in-memory runtime strings; no DB columns are created or altered.
    """
    id:                        str        # uuid4 hex
    category:                  str        # "Top" | "Bottom" | "Footwear" | "Accessory" | "Outfit"
    sub_type:                  str        # e.g. "cargo", "shorts", "sneakers"
    name:                      str        # e.g. "Blue Cargo Pants"
    box_coordinates:           List[int]  # [x_min, y_min, x_max, y_max]
    image_crop_blob_reference: str        # data:image/jpeg;base64,...
    seasons:                   List[str]  # e.g. ["summer", "monsoon"]
    occasions:                 List[str]  # e.g. ["casual", "festive"]


class ConsolidatedVisionResponse(BaseModel):
    """
    Consolidated API Contract for all Vision responses.
    Single route: /vision/analyze
    """
    status: str
    message: str
    detected_items: List[ScanResultItemV2]

# ──────────────────────────────────────────────
# SIMULATED IN-MEMORY JSON BUFFER
# Replace with real DB only when infrastructure
# stage begins.
# ──────────────────────────────────────────────

WARDROBE_BUFFER: List[dict] = [
    {
        "id": "item-001",
        "name": "White Oxford Shirt",
        "category": "top",
        "color": "white",
        "brand": "Uniqlo",
        "tags": ["formal", "classic", "office"],
        "image_url": None,
        "is_favourite": True,
    },
    {
        "id": "item-002",
        "name": "Slim Navy Chinos",
        "category": "bottom",
        "color": "navy",
        "brand": "Zara",
        "tags": ["smart-casual", "versatile"],
        "image_url": None,
        "is_favourite": False,
    },
    {
        "id": "item-003",
        "name": "White Leather Sneakers",
        "category": "footwear",
        "color": "white",
        "brand": "Adidas",
        "tags": ["casual", "everyday"],
        "image_url": None,
        "is_favourite": True,
    },
    {
        "id": "item-004",
        "name": "Grey Oversized Hoodie",
        "category": "top",
        "color": "grey",
        "brand": "H&M",
        "tags": ["casual", "cozy", "weekend"],
        "image_url": None,
        "is_favourite": False,
    },
    {
        "id": "item-005",
        "name": "Black Slim Jeans",
        "category": "bottom",
        "color": "black",
        "brand": "Levi's",
        "tags": ["casual", "night-out", "versatile"],
        "image_url": None,
        "is_favourite": True,
    },
    {
        "id": "item-006",
        "name": "Minimalist Watch",
        "category": "accessory",
        "color": "silver",
        "brand": "Titan",
        "tags": ["formal", "classic"],
        "image_url": None,
        "is_favourite": False,
    },
]

# Static mock outfit suggestions (no ML required)
OUTFIT_SUGGESTIONS_BUFFER: List[dict] = [
    {
        "id": "outfit-001",
        "occasion": "casual",
        "items": [WARDROBE_BUFFER[3], WARDROBE_BUFFER[4], WARDROBE_BUFFER[2]],
        "confidence_score": 0.91,
        "style_note": "Effortless weekend look. Hoodie + black jeans pairs with white sneakers for a clean contrast.",
    },
    {
        "id": "outfit-002",
        "occasion": "formal",
        "items": [WARDROBE_BUFFER[0], WARDROBE_BUFFER[1], WARDROBE_BUFFER[5]],
        "confidence_score": 0.95,
        "style_note": "Classic office-ready ensemble. White Oxford with navy chinos is a timeless, polished combination.",
    },
    {
        "id": "outfit-003",
        "occasion": "party",
        "items": [WARDROBE_BUFFER[0], WARDROBE_BUFFER[4], WARDROBE_BUFFER[2]],
        "confidence_score": 0.82,
        "style_note": "Elevated casual — white shirt tucked into black jeans with sneakers hits the right note for a relaxed night out.",
    },
]

# ──────────────────────────────────────────────
# APP INSTANCE
# ──────────────────────────────────────────────

app = FastAPI(
    title="KyaPehnu API",
    description="Wardrobe intelligence — mock data stage",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────
# ROUTES
# ──────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["System"])
def health_check():
    """Ping endpoint to verify the server is reachable."""
    return HealthResponse(
        status="ok",
        version="0.1.0",
        mode="mock",
    )


@app.get("/vision/debug", tags=["Vision"])
async def vision_debug():
    """
    Diagnostic endpoint — tests Gemini API connectivity and env setup.
    Call this to see exactly why /vision/analyze is returning no_cloth_found.
    """
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


@app.get("/wardrobe/items", response_model=List[WardrobeItem], tags=["Wardrobe"])
def get_all_items():
    """Return every item in the in-memory wardrobe buffer."""
    return [WardrobeItem(**item) for item in WARDROBE_BUFFER]


@app.get("/wardrobe/items/{item_id}", response_model=WardrobeItem, tags=["Wardrobe"])
def get_item(item_id: str):
    """Fetch a single wardrobe item by its ID."""
    item = next((i for i in WARDROBE_BUFFER if i["id"] == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail=f"Item '{item_id}' not found.")
    return WardrobeItem(**item)


@app.post("/wardrobe/items", response_model=WardrobeItem, status_code=201, tags=["Wardrobe"])
def add_item(payload: AddItemRequest):
    """Add a new clothing item to the in-memory buffer."""
    new_item = {
        "id": f"item-{uuid.uuid4().hex[:6]}",
        "name": payload.name,
        "category": payload.category,
        "color": payload.color,
        "brand": payload.brand,
        "tags": payload.tags,
        "image_url": payload.image_url,
        "is_favourite": False,
    }
    WARDROBE_BUFFER.append(new_item)
    return WardrobeItem(**new_item)


@app.delete("/wardrobe/items/{item_id}", tags=["Wardrobe"])
def delete_item(item_id: str):
    """Remove an item from the in-memory buffer by ID."""
    global WARDROBE_BUFFER
    original_len = len(WARDROBE_BUFFER)
    WARDROBE_BUFFER = [i for i in WARDROBE_BUFFER if i["id"] != item_id]
    if len(WARDROBE_BUFFER) == original_len:
        raise HTTPException(status_code=404, detail=f"Item '{item_id}' not found.")
    return {"deleted": item_id}


@app.get("/outfits/suggestions", response_model=List[OutfitSuggestion], tags=["Outfits"])
def get_outfit_suggestions(occasion: Optional[str] = None):
    """
    Return mock outfit suggestions.
    Optionally filter by occasion: casual | formal | party | sport
    """
    results = OUTFIT_SUGGESTIONS_BUFFER
    if occasion:
        results = [o for o in results if o["occasion"] == occasion]
    return [OutfitSuggestion(**o) for o in results]


@app.get("/outfits/suggestions/{outfit_id}", response_model=OutfitSuggestion, tags=["Outfits"])
def get_outfit_by_id(outfit_id: str):
    """Fetch a single outfit suggestion by ID."""
    outfit = next((o for o in OUTFIT_SUGGESTIONS_BUFFER if o["id"] == outfit_id), None)
    if not outfit:
        raise HTTPException(status_code=404, detail=f"Outfit '{outfit_id}' not found.")
    return OutfitSuggestion(**outfit)


# ──────────────────────────────────────────────
# VISION ROUTE
# Model is NOT reloaded here — vision.py exposes
# classify_image() which uses the cached _CLASSIFIER.
# ──────────────────────────────────────────────

@app.post("/vision/analyze", response_model=ConsolidatedVisionResponse, tags=["Vision"])
async def analyze_clothing_image(
    file: UploadFile = File(..., description="JPEG or PNG image of a clothing item or outfit"),
) -> ConsolidatedVisionResponse:
    """
    **Consolidated Vision Analysis Endpoint**

    Handles both Single Object Scanning and Multi-Garment Detection on a single route.
    Runs the full YOLOv8 + ViT tri-tier pipeline and returns a consolidated array
    of all detected garments.

    If no clothing is found (0 detected garments), returns HTTP 200 with error status,
    flushing internal memory buffers and preventing DB contamination.
    """
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=415,
            detail=f"Expected an image file, got '{file.content_type}'.",
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file received.")

    try:
        # ── Consolidated Single-Endpoint Multi-Detection Contract ──
        # Async Parallel Ingestion & Color Extraction
        result = await process_vision_pipeline(image_bytes)
        del image_bytes
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Vision pipeline failed: {exc}")

    # Zero-Tolerance Environment Rejection Block (no_cloth_found)
    return result
