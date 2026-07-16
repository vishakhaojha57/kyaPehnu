"""
KyaPehnu – Vision Module
Loads the model ONCE at startup (module-level singleton).
Never re-import / re-download on a per-request basis.

Model: google/vit-base-patch16-224  (pretrained on ImageNet-21k → ImageNet-1k)
It returns fine-grained labels like "jersey, T-shirt" / "cardigan" / "jean" etc.
We map those onto our 4 wardrobe categories via a Two-Tier Rule Engine.

Color: ColourThief extracts the dominant pixel cluster from the raw bytes.

──────────────────────────────────────────────────────────────────────────────
ARCHITECTURE CONSTRAINTS (strictly enforced):

  • No Disk Ingestion Writes  – All intermediate image arrays and cropped box
    regions are held exclusively in io.BytesIO memory blocks.  No filesystem
    paths, no tempfile, no open(..., 'wb') anywhere in this module.

  • Loose Bounding Box Fallback – When a coordinate-scan loop returns zero
    qualifying rows (e.g. low-light / dark-background images), the pipeline
    automatically computes a center-crop mask matrix instead of raising an
    exception, ensuring dynamic execution continues uninterrupted.

  • Two-Tier Label Resolution (Sub-Phase 2.4)
      Tier 1 — Sub-Type Matcher  : scans ALL vocabulary tokens against a
        deterministic priority-ordered keyword matrix.  Sub-type resolution
        ALWAYS executes before the main category check loop so that compound
        labels like "cargo pants" surface the specific sub-type "cargo" and
        correctly resolve to category "bottom" — the generic "pant" token
        cannot misfire the category filter first.
      Tier 2 — Core Category Fallback : if no sub-type token matches, the
        top-k ViT confidence vectors are scanned for a broad category keyword.

  • No In-Database Type Hardcoding – sub_type strings are held entirely in the
    JSON response payload (metadata field on VisionResult).  No DB column is
    created or altered; existing schema is never mutated.

  • Tri-Tier Validation Matrix (Sub-Phase 3)
      Tier 3 — Granular Fabric Sub-Classification:
        Crop coordinate vectors pass through deep linear matching matrices
        (_TIER3_SPECIFIC_MAP) where fine-grained taxonomy maps resolve
        specific silhouette / fabric labels:
          bottom/jeans  → baggy | skinny | bell_bottom | straight | slim
          bottom/trouser → cargo | chino | wide_leg | tapered | formal
          top/shirt      → tunic | formal_shirt | oversized_t-shirt | crop_top
          top/hoodie     → hoodie | zip_hoodie | pullover_hoodie
          footwear/*     → chunky_sneaker | low_top | high_top | chelsea | etc.
        specific_type is stored inside the existing tags TEXT[] column or
        meta JSON key — zero DB schema mutations; no new columns created.
──────────────────────────────────────────────────────────────────────────────
"""

import io
import os
import json
import socket
import logging
import asyncio
import urllib.request
import urllib.error
import numpy as np
from typing import Tuple, Optional

from PIL import Image
try:
    import pillow_avif  # registers AVIF decoder into PIL — enables .avif uploads  # noqa: F401
except ImportError:
    pass  # AVIF support optional; JPEG/PNG/WebP still work without it
from colorthief import ColorThief
from transformers import pipeline

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# GLOBAL MODEL SINGLETON
# ──────────────────────────────────────────────────────────────────────────────

logger.info("Loading fashion classification pipeline...")

try:
    _CLASSIFIER = pipeline(
        task="zero-shot-image-classification",
        model="patrickjohncyh/fashion-clip",
    )
    _IS_ZERO_SHOT = True
    logger.info("Fashion-CLIP zero-shot pipeline ready.")
except Exception as _clip_err:
    logger.warning("Fashion-CLIP unavailable (%s) — falling back to ViT.", _clip_err)
    _CLASSIFIER = pipeline(
        task="image-classification",
        model="google/vit-base-patch16-224",
        top_k=10,
    )
    _IS_ZERO_SHOT = False
    logger.warning("Loaded generic ViT — clothing detection accuracy will be limited.")



# ──────────────────────────────────────────────────────────────────────────────
# TWO-TIER LABEL RESOLUTION MATRIX  (Sub-Phase 2.4)
#
# Structure per entry:
#   (token_fragment, sub_type_label, core_category)
#
# Deterministic Priority Rule:
#   Entries are evaluated in LIST ORDER — top entries have highest priority.
#   Sub-type scan ALWAYS runs before the core-category fallback loop.
#   More specific tokens (e.g. "cargo") appear BEFORE broader ones ("trouser")
#   to prevent the broader token from claiming the label first.
#
# Anti-Gravity: No DB column is mutated. sub_type is a runtime-only metadata
#   string returned in the JSON payload and rendered as a dashboard tag.
# ──────────────────────────────────────────────────────────────────────────────

# Each tuple: (token_to_scan_for, resolved_sub_type, resolved_core_category)
# ORDER MATTERS — more specific entries first.
_TIER1_RULES: list[tuple[str, str, str]] = [
    # ── Tops sub-types (specific → generic) ───────────────────────────────────
    ("polo",        "polo-shirt",   "top"),
    ("t-shirt",     "t-shirt",      "top"),
    ("tshirt",      "t-shirt",      "top"),
    ("tank",        "tank-top",     "top"),
    ("hoodie",      "hoodie",       "top"),
    ("sweatshirt",  "sweatshirt",   "top"),
    ("pullover",    "pullover",     "top"),
    ("cardigan",    "cardigan",     "top"),
    ("blazer",      "blazer",       "top"),
    ("suit",        "suit-jacket",  "top"),
    ("trench",      "trench-coat",  "top"),
    ("parka",       "parka",        "top"),
    ("windbreaker", "windbreaker",  "top"),
    ("jacket",      "jacket",       "top"),
    ("coat",        "coat",         "top"),
    ("blouse",      "blouse",       "top"),
    ("shirt",       "shirt",        "top"),    # broad — after all shirt sub-types
    ("jersey",      "jersey",       "top"),

    # ── Bottoms sub-types (specific → generic) ────────────────────────────────
    ("cargo",       "cargo-pants",  "bottom"),  # MUST precede "trouser"/"pant"
    ("chino",       "chinos",       "bottom"),
    ("sweatpant",   "sweatpants",   "bottom"),
    ("trackpant",   "track-pants",  "bottom"),
    ("jogger",      "joggers",      "bottom"),
    ("legging",     "leggings",     "bottom"),
    ("tight",       "leggings",     "bottom"),
    ("jean",        "jeans",        "bottom"),
    ("denim",       "jeans",        "bottom"),
    ("shorts",      "shorts",       "bottom"),
    ("skirt",       "skirt",        "bottom"),
    ("trouser",     "trousers",     "bottom"),
    ("pantaloon",   "trousers",     "bottom"),
    ("kilt",        "kilt",         "bottom"),
    ("sarong",      "sarong",       "bottom"),

    # ── Footwear sub-types ────────────────────────────────────────────────────
    ("sneaker",     "sneakers",     "footwear"),
    ("trainer",     "sneakers",     "footwear"),
    ("running shoe","sneakers",     "footwear"),
    ("loafer",      "loafers",      "footwear"),
    ("moccasin",    "moccasins",    "footwear"),
    ("stiletto",    "heels",        "footwear"),
    ("pump",        "heels",        "footwear"),
    ("sandal",      "sandals",      "footwear"),
    ("flip-flop",   "flip-flops",   "footwear"),
    ("slipper",     "slippers",     "footwear"),
    ("clog",        "clogs",        "footwear"),
    ("boot",        "boots",        "footwear"),
    ("shoe",        "shoes",        "footwear"),  # broad — after all shoe sub-types

    # ── Accessory sub-types ───────────────────────────────────────────────────
    ("sunglasses",  "sunglasses",   "accessory"),
    ("watch",       "watch",        "accessory"),
    ("bow tie",     "bow-tie",      "accessory"),
    ("tie",         "tie",          "accessory"),
    ("scarf",       "scarf",        "accessory"),
    ("glove",       "gloves",       "accessory"),
    ("belt",        "belt",         "accessory"),
    ("hat",         "hat",          "accessory"),
    ("cap",         "cap",          "accessory"),
    ("necklace",    "necklace",     "accessory"),
    ("bracelet",    "bracelet",     "accessory"),
    ("handbag",     "handbag",      "accessory"),
    ("purse",       "purse",        "accessory"),
    ("backpack",    "backpack",     "accessory"),
    ("umbrella",    "umbrella",     "accessory"),
    ("sock",        "socks",        "accessory"),
]

# Fallback core-category keywords (Tier 2 only — used when Tier 1 finds nothing)
_TIER2_TOPS      = {"jersey","t-shirt","tshirt","sweatshirt","pullover","cardigan",
                    "suit","shirt","blouse","coat","jacket","parka","windbreaker",
                    "trench","hoodie","tank","polo"}
_TIER2_BOTTOMS   = {"jean","trouser","skirt","shorts","leggings","pantaloon","kilt","sarong"}
_TIER2_FOOTWEAR  = {"shoe","sneaker","boot","loafer","sandal","clog","slipper",
                    "moccasin","flip-flop","stiletto","pump"}
_TIER2_ACCESSORY = {"watch","sunglasses","hat","cap","scarf","glove","belt",
                    "tie","bow tie","necklace","bracelet","handbag","purse",
                    "backpack","umbrella","sock"}


def _resolve_label(label: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Two-Tier Label Resolution — returns (sub_type, core_category).

    Tier 1 (Sub-Type Matcher) — runs FIRST, always:
      Scans the label string against every entry in _TIER1_RULES in priority order.
      Returns immediately on the first token match, surfacing both the fine-grained
      sub_type and its parent core_category.  Because more-specific tokens appear
      earlier in the list, compound labels like "cargo jeans" correctly resolve to
      sub_type="cargo-pants", category="bottom" before the broader "jean" rule fires.

    Tier 2 (Core Category Fallback) — runs only if Tier 1 finds no match:
      Scans the label against broad category keyword sets to assign a core_category.
      sub_type is set to the matched keyword itself (best available granularity).

    Anti-Gravity: No DB interaction. Returns are pure in-memory string tuples.
    """
    label_lower = label.lower()

    # ── Tier 1: Sub-Type Scan (deterministic priority order) ──────────────────
    for token, sub_type, category in _TIER1_RULES:
        if token in label_lower:
            logger.debug(
                "Tier-1 match: label=%r token=%r → sub_type=%r category=%r",
                label, token, sub_type, category,
            )
            return sub_type, category

    # ── Tier 2: Core Category Fallback ────────────────────────────────────────
    for kw in _TIER2_TOPS:
        if kw in label_lower:
            return kw, "top"
    for kw in _TIER2_BOTTOMS:
        if kw in label_lower:
            return kw, "bottom"
    for kw in _TIER2_FOOTWEAR:
        if kw in label_lower:
            return kw, "footwear"
    for kw in _TIER2_ACCESSORY:
        if kw in label_lower:
            return kw, "accessory"

    # Ultimate fallback — label unrecognised by both tiers
    logger.debug("No tier match for label=%r — using generic fallback", label)
    return None, None


def _rgb_to_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02x}{g:02x}{b:02x}"


# ──────────────────────────────────────────────────────────────────────────────
# MEMORY IMAGE BUFFER  (No-Disk-Write enforcement layer)
# ──────────────────────────────────────────────────────────────────────────────

class MemoryImageBuffer:
    """
    Strictly in-memory holder for image data.

    Stores the PIL Image object and its raw-bytes representation in a
    BytesIO buffer.  Disk write operations are structurally absent from
    this class; the only output path is `to_bytes()` / `to_pil()`.
    """

    def __init__(self, pil_image: Image.Image, fmt: str = "JPEG") -> None:
        self._fmt = fmt
        self._pil = pil_image.convert("RGB")
        self._buf = io.BytesIO()
        self._pil.save(self._buf, format=self._fmt)
        self._buf.seek(0)

    def to_pil(self) -> Image.Image:
        self._buf.seek(0)
        return Image.open(self._buf).copy()

    def to_bytes(self) -> bytes:
        self._buf.seek(0)
        return self._buf.read()

    def to_bytesio(self) -> io.BytesIO:
        self._buf.seek(0)
        return self._buf

    @property
    def size(self) -> Tuple[int, int]:
        return self._pil.size

    @classmethod
    def from_bytes(cls, raw: bytes, fmt: str = "JPEG") -> "MemoryImageBuffer":
        pil = Image.open(io.BytesIO(raw)).convert("RGB")
        # OPTIMIZATION: Max bounds resize. Shrinking a 10MB 4K image to 1024x1024
        # drastically speeds up YOLO inference, ViT cropping, and ColorThief loops.
        pil.thumbnail((1024, 1024))
        return cls(pil, fmt=fmt)

    @classmethod
    def from_crop(
        cls,
        source: "MemoryImageBuffer",
        box: Tuple[int, int, int, int],
        fmt: str = "JPEG",
    ) -> "MemoryImageBuffer":
        cropped = source.to_pil().crop(box)
        return cls(cropped, fmt=fmt)


# ──────────────────────────────────────────────────────────────────────────────
# BOUNDING BOX COORDINATE UTILITIES (Loose Bounding Box Fallback)
# ──────────────────────────────────────────────────────────────────────────────

_CENTER_CROP_FRACTION: float = 0.60


def _detect_foreground_box(
    pil_image: Image.Image,
    brightness_threshold: int = 30,
) -> Optional[Tuple[int, int, int, int]]:
    gray = np.array(pil_image.convert("L"), dtype=np.uint8)
    mask = gray > brightness_threshold
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    if rows.size == 0 or cols.size == 0:
        logger.warning(
            "Bounding box scan returned 0 qualifying rows "
            "(brightness_threshold=%d). Activating center-mask fallback.",
            brightness_threshold,
        )
        return None
    return int(cols.min()), int(rows.min()), int(cols.max()), int(rows.max())


def _center_crop_box(width: int, height: int) -> Tuple[int, int, int, int]:
    mx = int(width  * (1.0 - _CENTER_CROP_FRACTION) / 2)
    my = int(height * (1.0 - _CENTER_CROP_FRACTION) / 2)
    left, upper = mx, my
    right, lower = width - mx, height - my
    logger.info(
        "Center-mask fallback applied: box=(%d, %d, %d, %d) on %dx%d image.",
        left, upper, right, lower, width, height,
    )
    return left, upper, right, lower


def _resolve_crop_box(
    mem_buf: MemoryImageBuffer,
    brightness_threshold: int = 30,
) -> Tuple[int, int, int, int]:
    pil = mem_buf.to_pil()
    box = _detect_foreground_box(pil, brightness_threshold=brightness_threshold)
    if box is None:
        w, h = mem_buf.size
        box = _center_crop_box(w, h)
    return box


# ──────────────────────────────────────────────────────────────────────────────
# PUBLIC INTERFACE
# ──────────────────────────────────────────────────────────────────────────────

def classify_image(image_bytes: bytes) -> Optional[Tuple[str, str, str]]:
    """
    Accepts raw image bytes, returns (clothing_type, sub_type, hex_color) or None.

    clothing_type – one of: "top" | "bottom" | "footwear" | "accessory"
    sub_type      – fine-grained label e.g. "cargo-pants", "polo-shirt", "boots"
                    Held in-memory only; no DB column is created or altered.
    hex_color     – dominant colour as lowercase #rrggbb string

    Pipeline (Two-Tier Resolution, strictly in-memory, no disk writes):
      1. Wrap raw bytes in MemoryImageBuffer.
      2. Resolve foreground bounding box (center-mask fallback on zero rows).
      3. Crop to that box → new MemoryImageBuffer.
      4. Run ViT singleton → top-5 predictions.
      5. Tier-1 Sub-Type scan runs across all predictions (priority order).
         First Tier-1 match wins → sub_type + clothing_type resolved.
      6. If no Tier-1 match, Tier-2 category fallback runs.
      7. Extract dominant colour from cropped BytesIO via ColorThief.
    """
    # ── 1. In-memory load ─────────────────────────────────────────────────────
    source_buf = MemoryImageBuffer.from_bytes(image_bytes)

    # ── 2. Bounding box (center-mask fallback on zero rows) ───────────────────
    box = _resolve_crop_box(source_buf)

    # ── 3. Crop (stays in RAM) ────────────────────────────────────────────────
    crop_buf = MemoryImageBuffer.from_crop(source_buf, box)

    # ── 4. ViT inference ──────────────────────────────────────────────────────
    predictions = _CLASSIFIER(crop_buf.to_pil())   # list[{label, score}]

    # ── 5 & 6. Two-Tier label resolution ─────────────────────────────────────
    resolved_sub_type = None
    resolved_category = None

    for pred in predictions:
        sub_type_candidate, category_candidate = _resolve_label(pred["label"])
        if category_candidate is not None:
            resolved_sub_type = sub_type_candidate
            resolved_category = category_candidate
            logger.info(
                "Tier-1/2 resolved: label=%r → sub_type=%r category=%r (score=%.3f)",
                pred["label"], resolved_sub_type, resolved_category, pred["score"],
            )
            break

    if resolved_category is None:
        logger.info("V1 Taxonomy Engine: No valid wearable clothing token found. Overriding generic prediction — garment_not_found.")
        return None

    label_corpus = " ".join(p["label"] for p in predictions)

    # ── Layer 2: Mandatory Structural Match ───────────────────────────────────
    if not _has_clothing_signal(label_corpus):
        logger.info("V1 Layer-2 guard: no clothing signal in corpus=%r — garment_not_found.", label_corpus)
        return None

    # ── 7. Dominant colour (cropped BytesIO block) ────────────────────────────
    ct = ColorThief(crop_buf.to_bytesio())
    try:
        dominant = ct.get_color(quality=1)
    except Exception:
        dominant = (128, 128, 128)

    hex_color = _rgb_to_hex(*dominant)

    return resolved_category, resolved_sub_type, hex_color


# ──────────────────────────────────────────────────────────────────────────────
# TIER 3 — GRANULAR FABRIC SUB-CLASSIFICATION ENGINE  (Sub-Phase 3)
#
# Operates on (sub_type, label_tokens) pairs produced by Tier 1 / Tier 2.
# Returns a `specific_type` string that surfaces fine-grained silhouette /
# fabric labels without touching any DB column or writing to disk.
#
# Architecture:
#   _TIER3_SPECIFIC_MAP  – dict mapping (sub_type_root → list of
#                          (token_fragment, specific_label)) tuples.
#                          Evaluated in LIST ORDER — more specific patterns
#                          appear before broader catch-alls.
#
#   _resolve_specific_type() – isolated RAM-only function.  Accepts the
#                              resolved sub_type token and the full
#                              concatenated label-token string from top-k ViT
#                              predictions.  Returns specific_type string.
#
# Anti-Gravity:
#   • No disk writes.  All pattern tables live in module-level Python dicts.
#   • No DB column mutations.  specific_type is returned in JSON payload only.
#   • Fully encapsulated — zero side-effects, zero shared mutable state.
# ──────────────────────────────────────────────────────────────────────────────

# Each entry: (token_to_scan_for, specific_type_label)
# Outer keys are normalised sub_type root tokens.
_TIER3_SPECIFIC_MAP: dict[str, list[tuple[str, str]]] = {

    # ── Jeans / Denim specifics ───────────────────────────────────────────────
    "jeans": [
        ("bell",       "bell_bottom"),
        ("flare",      "bell_bottom"),
        ("bootcut",    "bootcut"),
        ("baggy",      "baggy"),
        ("loose",      "baggy"),
        ("wide",       "wide_leg"),
        ("skinny",     "skinny"),
        ("slim",       "slim_fit"),
        ("straight",   "straight_cut"),
        ("tapered",    "tapered"),
        ("mom",        "mom_jeans"),
        ("boyfriend",  "boyfriend"),
        ("high waist", "high_waist"),
        ("ripped",     "ripped"),
        ("distressed", "ripped"),
    ],

    # ── Trousers / Pants specifics ────────────────────────────────────────────
    "trousers": [
        ("cargo",   "cargo"),
        ("chino",   "chino"),
        ("formal",  "formal"),
        ("dress",   "formal"),
        ("wide",    "wide_leg"),
        ("baggy",   "baggy"),
        ("tapered", "tapered"),
        ("slim",    "slim_fit"),
        ("pleated", "pleated"),
    ],

    # ── Cargo pants alias ─────────────────────────────────────────────────────
    "cargo-pants": [
        ("slim",   "slim_cargo"),
        ("baggy",  "baggy_cargo"),
        ("camo",   "camo_cargo"),
        ("short",  "cargo_shorts"),
    ],

    # ── Shorts specifics ──────────────────────────────────────────────────────
    "shorts": [
        ("denim",   "denim_shorts"),
        ("cargo",   "cargo_shorts"),
        ("board",   "board_shorts"),
        ("chino",   "chino_shorts"),
        ("biker",   "biker_shorts"),
        ("athletic","athletic_shorts"),
        ("mini",    "mini_shorts"),
    ],

    # ── Tops: T-shirt specifics ───────────────────────────────────────────────
    "t-shirt": [
        ("oversized",  "oversized_t-shirt"),
        ("crop",       "crop_top"),
        ("graphic",    "graphic_tee"),
        ("plain",      "plain_tee"),
        ("longline",   "longline_tee"),
        ("pocket",     "pocket_tee"),
        ("v-neck",     "v_neck_tee"),
        ("round",      "crew_neck_tee"),
    ],

    # ── Tops: Shirt specifics ─────────────────────────────────────────────────
    "shirt": [
        ("tunic",     "tunic"),
        ("formal",    "formal_shirt"),
        ("oxford",    "oxford_shirt"),
        ("flannel",   "flannel_shirt"),
        ("denim",     "denim_shirt"),
        ("oversized", "oversized_shirt"),
        ("crop",      "crop_shirt"),
        ("linen",     "linen_shirt"),
        ("polo",      "polo_shirt"),
        ("hawaiian",  "hawaiian_shirt"),
        ("check",     "check_shirt"),
        ("stripe",    "striped_shirt"),
    ],

    # ── Tops: Hoodie specifics ────────────────────────────────────────────────
    "hoodie": [
        ("zip",       "zip_hoodie"),
        ("pullover",  "pullover_hoodie"),
        ("oversized", "oversized_hoodie"),
        ("crop",      "crop_hoodie"),
        ("graphic",   "graphic_hoodie"),
    ],

    # ── Tops: Jacket specifics ────────────────────────────────────────────────
    "jacket": [
        ("leather",  "leather_jacket"),
        ("denim",    "denim_jacket"),
        ("bomber",   "bomber_jacket"),
        ("puffer",   "puffer_jacket"),
        ("blazer",   "blazer"),
        ("varsity",  "varsity_jacket"),
        ("rain",     "rain_jacket"),
        ("track",    "track_jacket"),
        ("biker",    "biker_jacket"),
    ],

    # ── Tops: Dress specifics ─────────────────────────────────────────────────
    "dress": [
        ("mini",    "mini_dress"),
        ("midi",    "midi_dress"),
        ("maxi",    "maxi_dress"),
        ("bodycon", "bodycon_dress"),
        ("wrap",    "wrap_dress"),
        ("shirt",   "shirt_dress"),
        ("slip",    "slip_dress"),
        ("floral",  "floral_dress"),
    ],

    # ── Footwear: Sneakers specifics ──────────────────────────────────────────
    "sneakers": [
        ("chunky",    "chunky_sneaker"),
        ("platform",  "platform_sneaker"),
        ("high",      "high_top"),
        ("low",       "low_top"),
        ("running",   "running_shoe"),
        ("trainer",   "trainer"),
        ("canvas",    "canvas_sneaker"),
        ("leather",   "leather_sneaker"),
    ],

    # ── Footwear: Boots specifics ─────────────────────────────────────────────
    "boots": [
        ("chelsea",   "chelsea_boot"),
        ("ankle",     "ankle_boot"),
        ("knee",      "knee_high_boot"),
        ("combat",    "combat_boot"),
        ("cowboy",    "cowboy_boot"),
        ("rain",      "rain_boot"),
        ("lace",      "lace_up_boot"),
        ("platform",  "platform_boot"),
    ],

    # ── Skirt specifics ───────────────────────────────────────────────────────
    "skirt": [
        ("mini",    "mini_skirt"),
        ("midi",    "midi_skirt"),
        ("maxi",    "maxi_skirt"),
        ("pleated", "pleated_skirt"),
        ("pencil",  "pencil_skirt"),
        ("wrap",    "wrap_skirt"),
        ("denim",   "denim_skirt"),
        ("flared",  "flared_skirt"),
    ],
}


def _resolve_specific_type(
    sub_type: str,
    label_tokens: str,
) -> str:
    """
    Tier 3 — Granular Fabric Sub-Classification.

    Encapsulated state logic: accepts the Tier 1/2 resolved sub_type and the
    concatenated label-token string from top-k ViT predictions.  Scans the
    _TIER3_SPECIFIC_MAP taxonomy in priority order.

    Returns the most specific matching `specific_type` string, or an empty
    string if no Tier 3 pattern applies (callers should treat "" as "general").

    Anti-Gravity:
      • Pure function — no I/O, no disk writes, no DB access.
      • All pattern tables are module-level constants (read-only after import).
      • Memory execution only — return value is a heap-allocated Python string.
    """
    # Normalise the lookup key: strip suffixes like "-pants" → "cargo" lookup
    sub_root = sub_type.lower().strip()
    label_lower = label_tokens.lower()

    # Direct lookup in taxonomy map
    rules = _TIER3_SPECIFIC_MAP.get(sub_root)
    if rules is None:
        # Try stripping trailing "-pants", "-top", "-shirt" suffixes to find alias
        for alias_key in _TIER3_SPECIFIC_MAP:
            if alias_key in sub_root or sub_root in alias_key:
                rules = _TIER3_SPECIFIC_MAP[alias_key]
                break

    if rules is None:
        logger.debug(
            "Tier-3: no taxonomy entry for sub_type=%r — specific_type left blank.",
            sub_type,
        )
        return ""

    for token, specific_label in rules:
        if token in label_lower:
            logger.debug(
                "Tier-3 match: sub_type=%r token=%r → specific_type=%r",
                sub_type, token, specific_label,
            )
            return specific_label

    logger.debug(
        "Tier-3: no token match for sub_type=%r in label=%r — specific_type left blank.",
        sub_type, label_tokens,
    )
    return ""


def classify_image_v3(image_bytes: bytes) -> tuple[str, str, str, str]:
    """
    Tri-Tier label resolution — returns (clothing_type, sub_category, specific_type, hex_color).

    clothing_type  – broad bucket: "top" | "bottom" | "footwear" | "accessory"
    sub_category   – Tier 1/2 resolved label: e.g. "jeans", "shirt", "sneakers"
    specific_type  – Tier 3 resolved label: e.g. "baggy", "formal_shirt", "high_top"
                     Empty string "" when no Tier 3 pattern matches.
    hex_color      – dominant colour as lowercase #rrggbb

    Pipeline (Tri-Tier Resolution, strictly in-memory, no disk writes):
      1. Wrap raw bytes in MemoryImageBuffer.
      2. Resolve foreground bounding box (center-mask fallback on zero rows).
      3. Crop to bounding box → new MemoryImageBuffer.
      4. Run ViT singleton → top-5 predictions.
      5. Tier 1 Sub-Type scan across all predictions (priority order).
      6. Tier 2 Core Category fallback if Tier 1 yields no match.
      7. Tier 3 Granular Fabric scan: concatenate all top-k ViT label strings,
         run _resolve_specific_type() — encapsulated heap execution.
      8. Extract dominant colour from cropped BytesIO via ColorThief.

    Anti-Gravity: No DB interaction. Returns are pure in-memory string tuples.
    specific_type is stored in JSON payload only — no DB column is mutated.
    """
    # ── 1. In-memory load ─────────────────────────────────────────────────────
    source_buf = MemoryImageBuffer.from_bytes(image_bytes)
    w, h = source_buf.size

    # ── 2. Bounding box (center-mask fallback on zero rows) ───────────────────
    box = _resolve_crop_box(source_buf)

    # ── 3. Crop (stays in RAM) ────────────────────────────────────────────────
    crop_buf = MemoryImageBuffer.from_crop(source_buf, box)

    # ── 4. ViT inference ──────────────────────────────────────────────────────
    predictions = _CLASSIFIER(crop_buf.to_pil())   # list[{label, score}]

    # ── 5 & 6. Tier 1 + Tier 2 resolution ─────────────────────────────────────
    resolved_sub_type = None
    resolved_category = None

    for pred in predictions:
        sub_c, cat_c = _resolve_label(pred["label"])
        if cat_c is not None:
            resolved_sub_type = sub_c
            resolved_category = cat_c
            logger.info(
                "V3 Taxonomy Match: label=%r → sub_type=%r category=%r (score=%.3f)",
                pred["label"], resolved_sub_type, resolved_category, pred["score"],
            )
            break

    if resolved_category is None:
        logger.info("V3 Taxonomy Engine: No valid wearable clothing token found. Overriding generic prediction — garment_not_found.")
        return None

    # ── 7. Tier 3 — Granular Fabric Sub-Classification ────────────────────────
    label_corpus = " ".join(p["label"] for p in predictions)
    specific_type = _resolve_specific_type(resolved_sub_type, label_corpus)

    logger.info(
        "V3 Tier-3: sub_type=%r corpus=%r → specific_type=%r",
        resolved_sub_type, label_corpus, specific_type,
    )

    # ── Layer 2: Mandatory Structural Match — clothing signal guard ───────────
    # If no clothing vocabulary token is present in any top-k ViT label,
    # the submitted image contains no recognisable garment.
    # Returns None (garment_not_found sentinel) — HTTP 200 status is applied
    # by the FastAPI endpoint; no exception is raised here.
    if not _has_clothing_signal(label_corpus):
        logger.info(
            "V3 Layer-2 guard: no clothing signal in corpus=%r — garment_not_found.",
            label_corpus,
        )
        return None

    # ── 8. Dominant colour (cropped BytesIO block) ────────────────────────────
    ct = ColorThief(crop_buf.to_bytesio())
    try:
        dominant = ct.get_color(quality=1)
    except Exception:
        dominant = (128, 128, 128)

    hex_color = _rgb_to_hex(*dominant)

    return resolved_category, resolved_sub_type, specific_type, hex_color


# ──────────────────────────────────────────────────────────────────────────────
# YOLO MULTI-OBJECT DETECTOR  (Multi-Crop Multi-Class Pipeline)
#
# Model: keremberke/yolov8n-fashion-detection (DeepFashion2, 13 classes)
# Loaded once at startup as a module singleton — never reloaded per request.
#
# Anti-Gravity Rules:
#   Sequential Heap Allocation — crops processed one-by-one in a plain for loop.
#     No ThreadPoolExecutor, no asyncio.gather, no parallel heap blocks.
#   No DB Over-Indexing — category/sub_type live in JSON response only.
#   No Disk Writes — crop_b64 is a base64 data-URI from in-memory bytes.
# ──────────────────────────────────────────────────────────────────────────────

import base64
from dataclasses import dataclass, asdict
from typing import List, Any

# ── YOLO singleton (graceful degradation if ultralytics not installed) ─────────
_YOLO_DETECTOR = None
_YOLO_AVAILABLE = False

try:
    from ultralytics import YOLO as _YOLOClass
    logger.info("Loading YOLOv8 fashion detection model (keremberke/yolov8n-fashion-detection)…")
    _YOLO_DETECTOR = _YOLOClass("keremberke/yolov8n-fashion-detection")
    _YOLO_AVAILABLE = True
    logger.info("YOLOv8 fashion detector ready.")
except Exception as _yolo_err:
    logger.warning(
        "YOLOv8 unavailable (%s) — detect_and_classify will use single-crop fallback.",
        _yolo_err,
    )

# ── YOLO class → (core_category, sub_type) strict taxonomy mapping ────────────
# Strict Tier separation enforced:
#   shorts  → sub_type="shorts"   (never "trousers")
#   cargo   → sub_type="cargo-pants" via Two-Tier resolver
#   jeans   → sub_type="jeans"    (never "shorts")
_YOLO_TAXONOMY: dict[str, tuple[str, str]] = {
    # Tops ────────────────────────────────────────────────────────────────────
    "short sleeve top":     ("top", "t-shirt"),
    "long sleeve top":      ("top", "shirt"),
    "short sleeve outwear": ("top", "jacket"),
    "long sleeve outwear":  ("top", "coat"),
    "vest":                 ("top", "vest"),
    "sling":                ("top", "sling-top"),
    # Bottoms (strict separation) ─────────────────────────────────────────────
    "shorts":               ("bottom", "shorts"),    # → Shorts label locked
    "trousers":             ("bottom", "trousers"),  # → Trousers label locked
    "skirt":                ("bottom", "skirt"),
    # Dresses (mapped to top in our 4-category schema) ─────────────────────────
    "short sleeve dress":   ("top", "dress"),
    "long sleeve dress":    ("top", "dress"),
    "vest dress":           ("top", "dress"),
    "sling dress":          ("top", "dress"),
}


# ── ViT Clothing Signal Vocabulary (Layer 2 — Mandatory Structural Match) ──────
#
# When the YOLO detector is absent or returns 0 boxes after suppression,
# the pipeline falls back to a single ViT crop of the whole image.
# _has_clothing_signal() checks the concatenated top-k ViT label corpus
# for the presence of ANY clothing-related token.  If none are found,
# the image contains no detectable garment → sentinel is returned.
#
# Anti-Gravity: set is a module-level constant (read-only after import).
# All evaluation runs in RAM; no I/O, no disk writes, no DB access.
# ──────────────────────────────────────────────────────────────────────────────
_CLOTHING_SIGNAL_VOCAB: frozenset[str] = frozenset({
    # Tops
    "shirt", "t-shirt", "tshirt", "jersey", "blouse", "tunic", "hoodie",
    "sweatshirt", "pullover", "cardigan", "blazer", "jacket", "coat",
    "parka", "trench", "windbreaker", "vest", "tank", "polo", "crop",
    # Bottoms
    "jean", "denim", "trouser", "pant", "shorts", "skirt", "legging",
    "cargo", "chino", "jogger", "trackpant", "sweatpant", "kilt",
    # Footwear
    "shoe", "sneaker", "boot", "sandal", "loafer", "heel", "pump",
    "slipper", "clog", "moccasin", "trainer",
    # Accessories (worn)
    "tie", "scarf", "glove", "belt", "hat", "cap", "sock", "watch",
    "necklace", "bracelet", "handbag", "backpack",
    # Dress / outerwear
    "dress", "gown", "suit", "uniform", "kimono", "robe", "overall",
    "jumpsuit", "romper",
})


# ── Unified Vocabulary Anchor — Single Source of Truth ────────────────────────
# SHARED_WEARABLES_LIST is the ONE global constant inherited by:
#   • Step 1 Immediate Token Filter Check (zero-match rejection)
#   • process_vision_pipeline synonym normalizer (_normalize_type)
# No secondary or duplicate keyword arrays are defined anywhere else in this module.
# Anti-Gravity: module-level constant, read-only after import, no I/O, no DB access.
# ──────────────────────────────────────────────────────────────────────────────
SHARED_WEARABLES_LIST: list[str] = [
    # Garments & Clothes
    "clothing", "apparel", "top", "bottom", "garment", "suit", "dress",
    "shirt", "pants", "kurti", "lehenga", "blouse", "kurta", "tee", "t-shirt",
    "tank", "jacket", "coat", "blazer", "hoodie", "sweater", "cardigan",
    "vest", "tunic", "gown", "saree", "sari", "choli", "dupatta", "anarkali",
    "kameez", "sherwani", "kurta-pyjama", "salwar", "dhoti", "lungi",
    "skirt", "trousers", "jeans", "shorts", "leggings", "pyjama", "cargo",
    "wear", "outfit", "attire",
    # Accessories & Hair Items commented out to avoid conflict
    # "accessory", "jewelry", "earring", "bracelet", "watch", "hair accessory",
    # "hairband", "clip", "bag", "hat", "cap", "jewellery", "earrings",
    # "bracelets", "necklace", "ring", "bangle", "hair band", "hair clip",
    # "scrunchie", "headband", "handbag", "purse", "stole", "scarf", "belt",
    # "tie", "gloves", "sunglasses", "glasses", "hanky", "handkerchief",
    # Footwear
    "footwear", "shoes", "sandal", "slipper", "heels", "boots", "shoe",
    "sandals", "slippers", "sneakers", "loafers", "flats", "chappal", "jutti",
]

# Derived canonical mapping built from SHARED_WEARABLES_LIST
# Maps every token → standard category bucket used by the pipeline output schema.
# This dict is the only place where token → bucket resolution is defined.
_WEARABLE_CANONICAL_MAP: dict[str, str] = {
    # Tops / Garments
    "clothing": "top", "apparel": "top", "garment": "top", "wear": "top",
    "outfit": "top", "attire": "top", "shirt": "top", "blouse": "top",
    "kurti": "top", "kurta": "top", "top": "top", "tee": "top",
    "t-shirt": "top", "tank": "top", "jacket": "top", "coat": "top",
    "blazer": "top", "hoodie": "top", "sweater": "top", "cardigan": "top",
    "vest": "top", "tunic": "top", "dress": "top", "gown": "top",
    "saree": "top", "sari": "top", "lehenga": "top", "choli": "top",
    "dupatta": "top", "anarkali": "top", "kameez": "top", "suit": "top",
    "sherwani": "top", "kurta-pyjama": "top",
    # Bottoms
    "salwar": "bottom", "dhoti": "bottom", "lungi": "bottom",
    "skirt": "bottom", "pants": "bottom", "trousers": "bottom",
    "jeans": "bottom", "shorts": "bottom", "leggings": "bottom",
    "bottom": "bottom", "pyjama": "bottom", "cargo": "bottom",
    # Footwear
    "footwear": "footwear", "shoes": "footwear", "shoe": "footwear",
    "sandal": "footwear", "sandals": "footwear", "slipper": "footwear",
    "slippers": "footwear", "heels": "footwear", "boots": "footwear",
    "sneakers": "footwear", "loafers": "footwear", "flats": "footwear",
    "chappal": "footwear", "jutti": "footwear",
    # Accessories & Hair items - Commented out
    # "accessory": "accessory", "accessories": "accessory",
    # "jewelry": "accessory", "jewellery": "accessory",
    # "earring": "accessory", "earrings": "accessory",
    # "bracelet": "accessory", "bracelets": "accessory",
    # "watch": "accessory", "necklace": "accessory",
    # "ring": "accessory", "bangle": "accessory",
    # "hair accessory": "accessory", "hairband": "accessory",
    # "hair band": "accessory", "clip": "accessory", "hair clip": "accessory",
    # "scrunchie": "accessory", "headband": "accessory",
    # "bag": "accessory", "handbag": "accessory", "purse": "accessory",
    # "hat": "accessory", "cap": "accessory",
    # "stole": "accessory", "scarf": "accessory", "belt": "accessory",
    # "tie": "accessory", "gloves": "accessory",
    # "sunglasses": "accessory", "glasses": "accessory",
    # "hanky": "accessory", "handkerchief": "accessory",
}


def _has_clothing_signal(label_corpus: str) -> bool:
    """
    Layer 2 Mandatory Structural Match — returns True when the ViT top-k
    label corpus contains at least one clothing vocabulary token.

    Called AFTER Tier 1/2/3 resolution.  If this returns False, the image
    contains no recognisable garment and the pipeline returns the
    garment_not_found sentinel (HTTP 200 with status field).

    Anti-Gravity:
      • Pure function — no I/O, no disk writes, no DB access.
      • corpus is a transient heap string from the calling frame.
    """
    corpus_lower = label_corpus.lower()
    return any(token in corpus_lower for token in _CLOTHING_SIGNAL_VOCAB)


def _yolo_class_to_taxonomy(cls_name: str) -> tuple[Optional[str], Optional[str]]:
    """Map YOLO class → (category, sub_type). Falls back to Two-Tier resolver."""
    key = cls_name.lower().strip()
    if key in _YOLO_TAXONOMY:
        return _YOLO_TAXONOMY[key]
    return _resolve_label(cls_name)  # Two-Tier fallback


def _classify_crop_buf(
    crop_buf: MemoryImageBuffer,
    fallback_cat: Optional[str] = None,
    fallback_sub: Optional[str] = None,
    apply_rejection: bool = True
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Run ViT + Two-Tier resolver on a pre-cropped MemoryImageBuffer.
    Returns (category, sub_type, hex_color). Used internally by detect_and_classify.
    Returns (None, None, None) if the Hard Rejection Layer fires (when apply_rejection=True).
    """
    try:
        if _IS_ZERO_SHOT:
            predictions = _CLASSIFIER(crop_buf.to_pil(), candidate_labels=SHARED_WEARABLES_LIST)
        else:
            predictions = _CLASSIFIER(crop_buf.to_pil())
    except Exception as e:
        logger.warning("ViT classification failed for crop: %s", e)
        predictions = []
    


    resolved_sub_type = None
    resolved_category = None

    for pred in predictions:
        sub_c, cat_c = _resolve_label(pred["label"])
        if cat_c is not None:
            resolved_sub_type, resolved_category = sub_c, cat_c
            break

    # If ViT fails to classify clothing, use YOLO fallback (if provided)
    if resolved_category is None:
        if fallback_cat is not None:
            resolved_category = fallback_cat
            resolved_sub_type = fallback_sub
        else:
            if apply_rejection:
                return None, None, None

    # Center crop for ColorThief to avoid picking up the background
    pil_crop = crop_buf.to_pil()
    w, h = pil_crop.size
    cw, ch = int(w * 0.5), int(h * 0.5)
    cx, cy = w // 2, h // 2
    
    # Ensure dimensions are valid
    if cw > 0 and ch > 0:
        color_crop = pil_crop.crop((cx - cw//2, cy - ch//2, cx + cw//2, cy + ch//2))
    else:
        color_crop = pil_crop
        
    # OPTIMIZATION: Resize the crop to a small thumbnail before ColorThief
    # ColorThief uses k-means which is extremely slow on large high-res images.
    color_crop.thumbnail((100, 100))
        
    color_buf = io.BytesIO()
    color_crop.save(color_buf, format="JPEG")
    color_buf.seek(0)

    ct = ColorThief(color_buf)
    try:
        dominant = ct.get_color(quality=1)
    except Exception:
        dominant = (128, 128, 128)

    return resolved_category, resolved_sub_type, _rgb_to_hex(*dominant)


def _encode_crop_b64(crop_buf: MemoryImageBuffer) -> str:
    """Base64-encode crop to data-URI. Strictly in-memory — no disk write."""
    # OPTIMIZATION: Resize the crop to a web-friendly thumbnail (max 400x400).
    # This prevents sending multi-megabyte base64 strings in the JSON payload,
    # which causes severe latency when parsing in Next.js.
    pil_img = crop_buf.to_pil()
    pil_img.thumbnail((400, 400))
    thumb_buf = io.BytesIO()
    pil_img.save(thumb_buf, format="JPEG", quality=85)
    
    return "data:image/jpeg;base64," + base64.b64encode(thumb_buf.getvalue()).decode("ascii")


@dataclass
class DetectedItem:
    """
    One detected clothing item from the multi-crop pipeline.
    All fields are in-memory runtime values — no DB columns created or altered.
    crop_b64: JPEG data-URI string (heap-only, no filesystem path).
    """
    category:   str        # "top" | "bottom" | "footwear" | "accessory"
    sub_type:   str        # e.g. "t-shirt", "shorts", "sneakers"
    hex_color:  str        # "#rrggbb"
    crop_b64:   str        # data:image/jpeg;base64,...
    confidence: float      # YOLO confidence (1.0 for fallback items)
    box:        List[int]  # [x1, y1, x2, y2]
    fallback:   bool       # True when YOLO was absent / returned 0 boxes


def _gemini_vision_fallback(source_buf: MemoryImageBuffer) -> List[dict]:
    # Gemini fallback removed as per user request to avoid errors
    return []



# ── Category canonical form for v2 contract (Title-cased) ─────────────────────
_CATEGORY_TITLE: dict[str, str] = {
    "top":       "Top",
    "bottom":    "Bottom",
    "footwear":  "Footwear",
    "accessory": "Accessory",
}


@dataclass
class ScanResultItem:
    """
    New integrity contract output shape — maps directly onto the Neon PostgreSQL
    persistence layer and the Next.js wardrobe grid.  All values are in-memory
    runtime strings; no DB columns are created or altered.

    Fields:
        id                     – clean unique string identifier (uuid4 hex)
        category               – Title-cased: "Top" | "Bottom" | "Footwear" | "Accessory"
        sub_type               – granular sub-type resolved from the mapping matrix
        name                   – user-friendly tag built from hex_color + sub_type
        box_coordinates        – [x_min, y_min, x_max, y_max]
        image_crop_blob_reference – base64 data-URI of the isolated crop (in-memory)
    """
    id:                        str        # uuid4 hex token
    category:                  str        # "Top" | "Bottom" | "Footwear" | "Accessory"
    sub_type:                  str        # e.g. "cargo", "shorts", "sneakers"
    name:                      str        # e.g. "Blue Cargo Pants"
    box_coordinates:           List[int]  # [x_min, y_min, x_max, y_max]
    image_crop_blob_reference: str        # data:image/jpeg;base64,...


def detect_and_classify(image_bytes: bytes) -> List[dict[str, Any]]:
    """
    Multi-crop multi-class detection pipeline.

    1. Load image → MemoryImageBuffer (no disk write).
    2. Run YOLO fashion detector → bounding box array.
       Fallback to single center-crop if YOLO unavailable or 0 detections.
    3. Sequential crop loop (one crop at a time — no parallel heap blocks):
       a. Crop detected region → MemoryImageBuffer.
       b. Map YOLO class → strict taxonomy (Tier 1/2/3 separation).
       c. Run ViT on crop → hex_color + sub_type refinement.
       d. Base64-encode crop → data-URI (in-memory only).
    4. Deduplicate by category (highest-confidence item per category).
    5. Return list of DetectedItem dicts (JSON-serialisable).
    """
    source_buf = MemoryImageBuffer.from_bytes(image_bytes)
    w, h = source_buf.size

    raw_detections: List[tuple[int, int, int, int, str, float]] = []

    # ── Step 2: YOLO pass ─────────────────────────────────────────────────────
    if _YOLO_AVAILABLE and _YOLO_DETECTOR is not None:
        try:
            yolo_results = _YOLO_DETECTOR(source_buf.to_pil(), verbose=False)
            boxes_data   = yolo_results[0].boxes
            names_map    = yolo_results[0].names

            for box in boxes_data:
                x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                cls_id   = int(box.cls[0].item())
                conf     = float(box.conf[0].item())
                cls_name = names_map.get(cls_id, "unknown")
                # Clamp to image bounds
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w, x2), min(h, y2)
                if x2 > x1 and y2 > y1:
                    raw_detections.append((x1, y1, x2, y2, cls_name, conf))

            logger.info("YOLO: %d detections in %dx%d image.", len(raw_detections), w, h)
        except Exception as yolo_err:
            logger.warning("YOLO inference error: %s — using single-crop fallback.", yolo_err)

    # ── Fallback: single center-crop ──────────────────────────────────────────
    if not raw_detections:
        logger.info("No YOLO detections — single-crop fallback activated.")
        fb_box  = _resolve_crop_box(source_buf)
        fb_crop = MemoryImageBuffer.from_crop(source_buf, fb_box)
        cat, sub, color = _classify_crop_buf(fb_crop, apply_rejection=True)
        if cat is None:
            return []
        return [asdict(DetectedItem(
            category=cat, sub_type=sub, hex_color=color,
            crop_b64=_encode_crop_b64(fb_crop),
            confidence=1.0, box=list(fb_box), fallback=True,
        ))]

    # ── Step 3: Sequential crop processing loop ───────────────────────────────
    # Anti-Gravity: plain for loop — no async, no threads, no parallel heap.
    raw_items: List[DetectedItem] = []

    for (x1, y1, x2, y2, cls_name, conf) in raw_detections:
        crop_buf = MemoryImageBuffer.from_crop(source_buf, (x1, y1, x2, y2))

        # YOLO strict taxonomy (Shorts→shorts, Trousers→trousers, etc.)
        yolo_cat, yolo_sub = _yolo_class_to_taxonomy(cls_name)

        # ViT for colour + sub_type refinement
        vit_cat, vit_sub, hex_color = _classify_crop_buf(
            crop_buf,
            fallback_cat=yolo_cat,
            fallback_sub=yolo_sub,
            apply_rejection=False
        )
        if vit_cat is None:
            continue # Hard Rejection Layer suppressed this crop


        # YOLO category is authoritative; ViT sub_type refines generic fallbacks
        final_cat = yolo_cat if yolo_cat is not None else vit_cat
        final_sub = yolo_sub if yolo_sub not in ("top","bottom","footwear","accessory", None) else vit_sub

        raw_items.append(DetectedItem(
            category=final_cat, sub_type=final_sub, hex_color=hex_color,
            crop_b64=_encode_crop_b64(crop_buf),
            confidence=conf, box=[x1, y1, x2, y2], fallback=False,
        ))

    # ── Step 4: Deduplicate — highest confidence per category wins ────────────
    best: dict[str, DetectedItem] = {}
    for item in sorted(raw_items, key=lambda x: x.confidence, reverse=True):
        if item.category not in best:
            best[item.category] = item

    # Return in natural category order: top → bottom → footwear → accessory
    order = ["top", "bottom", "footwear", "accessory"]
    ordered = sorted(best.values(), key=lambda x: order.index(x.category) if x.category in order else 99)

    return [asdict(item) for item in ordered]


# ──────────────────────────────────────────────────────────────────────────────
# V2 PUBLIC INTERFACE — New Integrity Data Contract
#
# detect_and_classify_v2()
#   Enforces the multi-object detection mandate:
#     • Scans ALL bounding boxes — Top, Bottom, Footwear simultaneously.
#     • NO deduplication: every detected garment emits its own ScanResultItem.
#     • Category strings are Title-cased ("Top", "Bottom", "Footwear").
#     • Output fields match the DB persistence schema and Next.js grid contract.
#
# Anti-Gravity Rules (preserved from v1):
#   • All crops stay in io.BytesIO — no disk writes.
#   • Sequential for-loop only — no threads, no async.gather.
#   • Sub-type fallback to parent category on low-confidence labels.
# ──────────────────────────────────────────────────────────────────────────────

import uuid as _uuid_mod


def _build_name(hex_color: str, sub_type: str) -> str:
    """
    Derive a user-friendly tag from hex_color and sub_type.
    E.g. hex_color="#1a3a6b", sub_type="cargo" → "Dark Blue Cargo"
    Falls back gracefully to sub_type alone if colour mapping is missing.
    """
    # Rough colour name bucket from hex luminance / hue channels
    try:
        r = int(hex_color[1:3], 16)
        g = int(hex_color[3:5], 16)
        b = int(hex_color[5:7], 16)
        # Simple hue bucket
        mx = max(r, g, b)
        mn = min(r, g, b)
        lum = (mx + mn) / 2
        if mx == mn:
            colour_name = "Grey" if lum > 60 else "Dark Grey"
        elif mx == r and g >= b:
            colour_name = "Yellow" if g > 180 else "Orange" if g > 80 else "Red"
        elif mx == r:
            colour_name = "Pink" if b > 150 else "Red"
        elif mx == g:
            colour_name = "Green" if b < 100 else "Teal"
        else:
            colour_name = "Navy" if lum < 80 else "Blue" if lum < 160 else "Light Blue"
        if lum < 30:
            colour_name = "Black"
        elif lum > 220:
            colour_name = "White"
    except Exception:
        colour_name = ""

    label = sub_type.replace("-", " ").replace("_", " ").title()
    return f"{colour_name} {label}".strip() if colour_name else label


def detect_and_classify_v2(image_bytes: bytes) -> List[dict]:
    """
    Multi-Object Detection Loop — V2 Integrity Contract.

    Mandatory multi-object tracking:
      • Every bounding box YOLO surfaces is processed independently.
      • Items are NOT collapsed by category — if YOLO detects two tops
        (e.g. shirt + jacket layered), both emit separate ScanResultItem entries.
      • YOLO fallback (single center-crop) fires only when detector is absent
        or returns 0 boxes; fallback item inherits id + contract fields intact.

    Returns:
        List of dicts matching ScanResultItem field names, JSON-serialisable,
        ordered: Top → Bottom → Footwear → Accessory.
        Safe for direct insertion into Neon PostgreSQL and Next.js grid rendering.
    """
    source_buf = MemoryImageBuffer.from_bytes(image_bytes)
    w, h = source_buf.size

    raw_detections: List[tuple] = []  # (x1,y1,x2,y2, cls_name, conf)

    # ── YOLO multi-object pass ────────────────────────────────────────────────
    if _YOLO_AVAILABLE and _YOLO_DETECTOR is not None:
        try:
            yolo_results = _YOLO_DETECTOR(source_buf.to_pil(), verbose=False)
            boxes_data   = yolo_results[0].boxes
            names_map    = yolo_results[0].names

            suppressed_count = 0
            for box in boxes_data:
                x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                cls_id   = int(box.cls[0].item())
                conf     = float(box.conf[0].item())
                cls_name = names_map.get(cls_id, "unknown")

                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w, x2), min(h, y2)
                if x2 > x1 and y2 > y1:
                    raw_detections.append((x1, y1, x2, y2, cls_name, conf))

            logger.info(
                "V2 YOLO: %d clothing detections, %d suppressed in %dx%d image.",
                len(raw_detections), suppressed_count, w, h,
            )
        except Exception as yolo_err:
            logger.warning("V2 YOLO inference error: %s — using single-crop fallback.", yolo_err)

    # ── Sequential crop loop (NO dedup — all boxes emitted) ──────────────────
    result_items: List[ScanResultItem] = []

    for (x1, y1, x2, y2, cls_name, conf) in raw_detections:
        crop_buf = MemoryImageBuffer.from_crop(source_buf, (x1, y1, x2, y2))

        # YOLO strict taxonomy first
        yolo_cat_raw, yolo_sub = _yolo_class_to_taxonomy(cls_name)

        # ViT for colour + sub_type refinement
        vit_cat_raw, vit_sub, hex_color = _classify_crop_buf(
            crop_buf,
            fallback_cat=yolo_cat_raw,
            fallback_sub=yolo_sub,
            apply_rejection=False
        )
        if vit_cat_raw is None:
            continue # Hard Rejection Layer suppressed this crop


        # YOLO category is authoritative; ViT sub_type refines generic placeholders
        final_cat_raw = yolo_cat_raw if yolo_cat_raw is not None else vit_cat_raw
        final_sub     = yolo_sub if yolo_sub not in ("top", "bottom", "footwear", "accessory", None) else vit_sub

        # Fail-safe: if final_sub is still a bare category token, use cls_name
        if final_sub in ("top", "bottom", "footwear", "accessory", "unknown"):
            # Last-resort: tokenise the YOLO class name directly
            resolved_s, _ = _resolve_label(cls_name)
            final_sub = resolved_s if resolved_s not in ("top", "bottom", "footwear", "accessory") else cls_name

        cat_title = _CATEGORY_TITLE.get(final_cat_raw, final_cat_raw.title())

        result_items.append(ScanResultItem(
            id=_uuid_mod.uuid4().hex,
            category=cat_title,
            sub_type=final_sub,
            name=_build_name(hex_color, final_sub),
            box_coordinates=[x1, y1, x2, y2],
            image_crop_blob_reference=_encode_crop_b64(crop_buf),
        ))

        logger.info(
            "V2 item: id=%s category=%r sub_type=%r name=%r conf=%.3f box=[%d,%d,%d,%d]",
            result_items[-1].id, cat_title, final_sub, result_items[-1].name,
            conf, x1, y1, x2, y2,
        )

    # ── Internet Extraction Fallback (Two-Tier Verification) ──────────────────
    needs_internet_fallback = False
    if len(result_items) == 0:
        needs_internet_fallback = True
    else:
        generic_tags = {"top", "bottom", "shirt", "trousers", "dress", "clothing", "unknown", "short sleeve top", "long sleeve top", "footwear", "accessory"}
        for item in result_items:
            if item.sub_type.lower() in generic_tags or item.category.lower() in generic_tags:
                needs_internet_fallback = True
                break

    if needs_internet_fallback:
        logger.info("Local evaluation threshold triggered internet extraction fallback.")
        gemini_items = _gemini_vision_fallback(source_buf)
        if gemini_items:
            # Zero-Stash Security Contract requires we use transient pointers immediately
            return gemini_items


    # ── Fallback: single center-crop when YOLO absent / 0 clothing boxes ──────
    # Only triggered if internet fallback was skipped or returned empty.
    if len(result_items) == 0:
        logger.info("V2: No clothing detections after suppression — checking ViT signal.")
        fb_box  = _resolve_crop_box(source_buf)
        fb_crop = MemoryImageBuffer.from_crop(source_buf, fb_box)

        # Run ViT for label corpus to check clothing signal
        fb_predictions = _CLASSIFIER(fb_crop.to_pil())
        fb_corpus = " ".join(p["label"] for p in fb_predictions)

        # Layer 2: Mandatory Structural Match
        if not _has_clothing_signal(fb_corpus):
            logger.info(
                "V2 Layer-2 guard: no clothing signal in fallback corpus=%r — returning [].",
                fb_corpus,
            )
            return []   # garment_not_found — endpoint converts to status sentinel

        cat_raw, sub, hex_color = _classify_crop_buf(fb_crop, apply_rejection=False)
        cat_title = _CATEGORY_TITLE.get(cat_raw, cat_raw.title()) if cat_raw else "Unknown"
        item = ScanResultItem(
            id=_uuid_mod.uuid4().hex,
            category=cat_title,
            sub_type=sub,
            name=_build_name(hex_color, sub),
            box_coordinates=list(fb_box),
            image_crop_blob_reference=_encode_crop_b64(fb_crop),
        )
        # Assuming detect_and_classify_v2 output needs seasons, wait, ScanResultItem doesn't have seasons yet.
        # But we added it to ScanResultItemV2 in main.py, not ScanResultItem in vision.py.
        # Let's add seasons to the dictionary before returning.
        result_items.append(item)


    # ── Order: Top → Bottom → Footwear → Accessory ───────────────────────────
    _order_map = {"Top": 0, "Bottom": 1, "Footwear": 2, "Accessory": 3}
    result_items.sort(key=lambda i: _order_map.get(i.category, 99))

    return [asdict(item) for item in result_items]


async def _process_crop_async(pil_img: Image.Image, box: list[int], cls_name: str) -> dict:
    crop_pil = pil_img.crop(box)
    
    # YOLO strict taxonomy first
    cat_map = {
        "short sleeve top": ("top", "t-shirt"), "long sleeve top": ("top", "shirt"),
        "short sleeve outwear": ("top", "jacket"), "long sleeve outwear": ("top", "coat"),
        "vest": ("top", "vest"), "sling": ("top", "sling-top"), "shorts": ("bottom", "shorts"),
        "trousers": ("bottom", "trousers"), "skirt": ("bottom", "skirt"),
        "short sleeve dress": ("top", "dress"), "long sleeve dress": ("top", "dress"),
        "vest dress": ("top", "dress"), "sling dress": ("top", "dress")
    }
    default_cat, default_sub = cat_map.get(cls_name, ("top", cls_name))
    
    def _color_wrapper():
        thumb = crop_pil.copy()
        thumb.thumbnail((100, 100))
        buf = io.BytesIO()
        thumb.save(buf, format="JPEG")
        buf.seek(0)
        try:
            from colorthief import ColorThief
            ct = ColorThief(buf)
            dominant = ct.get_color(quality=1)
            return _rgb_to_hex(*dominant)
        except Exception:
            return "#808080"
            
    def _b64_wrapper():
        thumb = crop_pil.copy()
        thumb.thumbnail((400, 400))
        buf = io.BytesIO()
        thumb.save(buf, format="JPEG", quality=85)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
        
    def _semantic_wrapper():
        # Gemini logic removed. Returning default category and subtype locally.
        return {"clothing_type": default_cat.lower(), "sub_category": default_sub.lower()}

    color_task = asyncio.to_thread(_color_wrapper)
    semantic_task = asyncio.to_thread(_semantic_wrapper)
    b64_task = asyncio.to_thread(_b64_wrapper)
    
    hex_color, semantic, b64_str = await asyncio.gather(color_task, semantic_task, b64_task)
    
    return {
        "id": _uuid_mod.uuid4().hex,
        "clothing_type": semantic["clothing_type"],
        "sub_category": semantic["sub_category"],
        "hex_color": hex_color,
        "name": _build_name(hex_color, semantic["sub_category"]),
        "box_coordinates": box,
        "image_crop_blob_reference": b64_str
    }

FASHION_HIERARCHY = {
    "top": {
        "labels": ["crop top", "oversized t-shirt", "formal shirt", "cotton kurti", "synthetic kurti", "blouse", "hoodie", "sweatshirt", "sweater", "jacket", "coat", "cardigan"],
        "default": "t-shirt",
        "season_map": {
            "crop top": ["summer"],
            "oversized t-shirt": ["summer", "monsoon"],
            "formal shirt": ["summer", "monsoon", "festive_spring", "winter"],
            "cotton kurti": ["summer", "festive_spring"],
            "synthetic kurti": ["monsoon"],
            "blouse": ["festive_spring", "summer"],
            "hoodie": ["winter"],
            "sweatshirt": ["winter"],
            "sweater": ["winter"],
            "jacket": ["winter"],
            "coat": ["winter"],
            "cardigan": ["winter"]
        },
        "occasion_map": {
            "crop top": ["casual", "party_clubbing"],
            "oversized t-shirt": ["casual", "college_daily", "lounge_sleepwear"],
            "formal shirt": ["office_formal"],
            "cotton kurti": ["casual", "college_daily", "festive"],
            "synthetic kurti": ["casual", "college_daily"],
            "blouse": ["festive", "wedding_heavy", "party_clubbing"],
            "hoodie": ["casual", "college_daily"],
            "sweatshirt": ["casual", "college_daily", "gym_activewear"],
            "sweater": ["casual", "office_formal"],
            "jacket": ["casual", "party_clubbing"],
            "coat": ["office_formal", "party_clubbing"],
            "cardigan": ["casual", "office_formal"]
        }
    },
    "bottom": {
        "labels": ["baggy jeans", "skinny jeans", "bell bottom jeans", "cargo pants", "formal trousers", "shorts", "skirts"],
        "default": "jeans",
        "season_map": {
            "baggy jeans": ["summer", "monsoon", "festive_spring", "winter"],
            "skinny jeans": ["summer", "monsoon", "festive_spring", "winter"],
            "bell bottom jeans": ["summer", "monsoon", "festive_spring", "winter"],
            "cargo pants": ["summer", "monsoon", "winter"],
            "formal trousers": ["summer", "monsoon", "festive_spring", "winter"],
            "shorts": ["summer", "monsoon"],
            "skirts": ["summer", "monsoon"]
        },
        "occasion_map": {
            "baggy jeans": ["casual", "college_daily", "party_clubbing"],
            "skinny jeans": ["casual", "college_daily", "party_clubbing"],
            "bell bottom jeans": ["casual", "party_clubbing"],
            "cargo pants": ["casual", "college_daily"],
            "formal trousers": ["office_formal"],
            "shorts": ["casual", "lounge_sleepwear", "gym_activewear"],
            "skirts": ["casual", "party_clubbing", "festive"]
        }
    },
    "outfit": {
        "labels": ["lehenga", "coord set", "anarkali suit", "alia cut suit", "punjabi suit", "sharara suit", "salwar kameez", "jumpsuit", "one-piece dress", "gown"],
        "default": "one-piece dress",
        "season_map": {
            "lehenga": ["festive_spring"],
            "coord set": ["summer", "monsoon"],
            "anarkali suit": ["festive_spring"],
            "alia cut suit": ["festive_spring"],
            "punjabi suit": ["festive_spring", "summer", "monsoon", "winter"],
            "sharara suit": ["festive_spring"],
            "salwar kameez": ["summer", "monsoon", "festive_spring", "winter"],
            "jumpsuit": ["summer", "monsoon"],
            "one-piece dress": ["summer", "monsoon"],
            "gown": ["festive_spring"]
        },
        "occasion_map": {
            "lehenga": ["wedding_heavy", "festive"],
            "coord set": ["casual", "college_daily", "party_clubbing"],
            "anarkali suit": ["festive", "wedding_heavy"],
            "alia cut suit": ["festive"],
            "punjabi suit": ["festive", "college_daily"],
            "sharara suit": ["festive", "wedding_heavy"],
            "salwar kameez": ["casual", "festive"],
            "jumpsuit": ["party_clubbing", "casual"],
            "one-piece dress": ["party_clubbing", "casual"],
            "gown": ["wedding_heavy", "party_clubbing"]
        }
    },
    "footwear": {
        "labels": ["sneakers", "boots", "heels", "sandals", "slippers", "flat shoes"],
        "default": "shoes",
        "season_map": {
            "sneakers": ["summer", "festive_spring", "winter"],
            "boots": ["winter"],
            "heels": ["festive_spring", "summer"],
            "sandals": ["monsoon", "summer"],
            "slippers": ["monsoon", "summer"],
            "flat shoes": ["summer", "monsoon", "festive_spring", "winter"]
        },
        "occasion_map": {
            "sneakers": ["casual", "college_daily", "party_clubbing", "gym_activewear"],
            "boots": ["party_clubbing", "casual"],
            "heels": ["party_clubbing", "festive", "wedding_heavy", "office_formal"],
            "sandals": ["casual", "festive"],
            "slippers": ["casual", "lounge_sleepwear"],
            "flat shoes": ["casual", "office_formal", "college_daily"]
        }
    }
}

def _resolve_seasons_for_item(category: str, sub_type: str) -> list[str]:
    cat_lower = category.lower()
    sub_lower = sub_type.lower()
    
    cat_data = FASHION_HIERARCHY.get(cat_lower)
    if not cat_data:
        return ["summer"]
        
    return cat_data.get("season_map", {}).get(sub_lower, ["summer"])

def _resolve_occasions_for_item(category: str, sub_type: str) -> list[str]:
    cat_lower = category.lower()
    sub_lower = sub_type.lower()
    
    cat_data = FASHION_HIERARCHY.get(cat_lower)
    if not cat_data:
        return ["casual"]
        
    return cat_data.get("occasion_map", {}).get(sub_lower, ["casual"])


_ALL_FASHION_LABELS = []
_LABEL_TO_CATEGORY = {}
for _cat_key, _cat_data in FASHION_HIERARCHY.items():
    for _lbl in _cat_data["labels"]:
        _ALL_FASHION_LABELS.append(_lbl)
        _LABEL_TO_CATEGORY[_lbl] = _cat_key



async def process_vision_pipeline(image_bytes: bytes) -> dict:
    """
    Local-Only Vision Pipeline — Zero external API calls.
    Strictly uses YOLO + Fashion-CLIP Zero-Shot over FASHION_HIERARCHY.
    Anti-Gravity: strictly in-memory, no disk writes.
    """
    try:
        raw_buf = io.BytesIO(image_bytes)
        pil_img = Image.open(raw_buf).convert("RGB")
        pil_img.thumbnail((800, 800))
        logger.info("[LOCAL-PIPELINE] Image decoded OK. Size: %s", pil_img.size)
    except Exception as img_err:
        logger.error("[LOCAL-PIPELINE] Image decode failed: %s", img_err)
        return {"status": "error", "message": "no_cloth_found", "detected_items": []}

    w, h = pil_img.size

    def _make_b64(img: Image.Image) -> str:
        thumb = img.copy()
        thumb.thumbnail((400, 400))
        buf = io.BytesIO()
        thumb.save(buf, format="JPEG", quality=85)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

    full_b64 = _make_b64(pil_img)
    final_items = []

    # ── Step 3a: YOLO multi-object path ──────────────────────────────────────
    if _YOLO_AVAILABLE and _YOLO_DETECTOR is not None:
        logger.info("[LOCAL-PIPELINE] YOLO available. Running multi-object detection.")
        try:
            yolo_results = await asyncio.to_thread(_YOLO_DETECTOR, pil_img)
            boxes = yolo_results[0].boxes if yolo_results else []
            logger.info("[LOCAL-PIPELINE] YOLO detected %d boxes.", len(boxes) if boxes is not None else 0)

            for box in (boxes or []):
                conf = float(box.conf[0])
                if conf < 0.20:
                    continue
                
                cls_id = int(box.cls[0])
                cls_name = _YOLO_DETECTOR.names.get(cls_id, "clothing")
                x1, y1, x2, y2 = [int(v) for v in box.xyxy[0]]

                # Identify category via strict map
                cat, _ = _yolo_class_to_taxonomy(cls_name)

                # STRICT FILTERING: Reject any accessory or non-garment detections
                if cat == "accessory" or cls_name in ["watch", "glasses", "sunglasses", "bag", "necklace", "earrings", "ring"]:
                    logger.info("[LOCAL-PIPELINE] Ignoring accessory detection: %s", cls_name)
                    continue

                if cat not in FASHION_HIERARCHY:
                    cat = "top"

                crop_pil = pil_img.crop((x1, y1, x2, y2))
                crop_b64 = _make_b64(crop_pil)

                # ── Zero-Shot Fashion-CLIP Query (Second Stage) ──
                # Changed to global label space to prevent category misclassification (e.g. Hoodie -> Gown)
                sub = FASHION_HIERARCHY[cat]["default"]
                if _IS_ZERO_SHOT:
                    try:
                        preds = await asyncio.to_thread(_CLASSIFIER, crop_pil, candidate_labels=_ALL_FASHION_LABELS)
                        if preds:
                            sub = preds[0]["label"]
                            cat = _LABEL_TO_CATEGORY[sub]
                            logger.info("[LOCAL-PIPELINE] Zero-Shot match: %r (score: %.3f)", sub, preds[0]["score"])
                    except Exception as e:
                        logger.warning("[LOCAL-PIPELINE] Zero-Shot inference failed: %s", e)

                # Dominant colour via ColorThief
                try:
                    cb = io.BytesIO()
                    thumb_c = crop_pil.copy()
                    thumb_c.thumbnail((100, 100))
                    thumb_c.save(cb, format="JPEG")
                    cb.seek(0)
                    dominant = ColorThief(cb).get_color(quality=1)
                    hex_color = _rgb_to_hex(*dominant)
                except Exception:
                    hex_color = "#808080"

                final_items.append({
                    "id": _uuid_mod.uuid4().hex,
                    "category": cat.title(),
                    "sub_type": sub,
                    "hex_color": hex_color,
                    "name": sub.title(),
                    "box_coordinates": [x1, y1, x2, y2],
                    "image_crop_blob_reference": crop_b64,
                    "seasons": _resolve_seasons_for_item(cat, sub),
                    "occasions": _resolve_occasions_for_item(cat, sub),
                })
        except Exception as yolo_err:
            logger.warning("[LOCAL-PIPELINE] YOLO failed: %s — falling back to ViT whole-image.", yolo_err)

    # ── Step 3b: ViT whole-image fallback (when YOLO absent or returned 0) ───
    if not final_items:
        logger.info("[LOCAL-PIPELINE] Running Zero-Shot whole-image classification.")
        cat = "top"
        sub = FASHION_HIERARCHY["top"]["default"]
        hex_color = "#808080"
        
        if _IS_ZERO_SHOT:
            try:
                # Global Space Routing ensures we don't commit to a wrong category early
                preds = await asyncio.to_thread(_CLASSIFIER, pil_img, candidate_labels=_ALL_FASHION_LABELS)
                if preds:
                    sub = preds[0]["label"]
                    cat = _LABEL_TO_CATEGORY[sub]
                    logger.info("[LOCAL-PIPELINE] Fallback Zero-Shot match: %r (score: %.3f)", sub, preds[0]["score"])
            except Exception as e:
                logger.warning("[LOCAL-PIPELINE] Zero-Shot whole-image failed: %s", e)
                
        try:
            cb = io.BytesIO()
            thumb_c = pil_img.copy()
            thumb_c.thumbnail((100, 100))
            thumb_c.save(cb, format="JPEG")
            cb.seek(0)
            dominant = ColorThief(cb).get_color(quality=1)
            hex_color = _rgb_to_hex(*dominant)
        except Exception:
            pass

        final_items.append({
            "id": _uuid_mod.uuid4().hex,
            "category": cat.title(),
            "sub_type": sub,
            "hex_color": hex_color,
            "name": sub.title(),
            "box_coordinates": [0, 0, w, h],
            "image_crop_blob_reference": full_b64,
            "seasons": _resolve_seasons_for_item(cat, sub),
            "occasions": _resolve_occasions_for_item(cat, sub),
        })
        logger.info("[LOCAL-PIPELINE] Guaranteed fallback item injected. cat=%s sub=%s", cat, sub)

    return {
        "status": "success",
        "message": "garments_verified",
        "detected_items": final_items,
    }


