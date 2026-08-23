import io
import base64
import uuid
import logging
import asyncio
from typing import List, Any, Optional, Tuple
from PIL import Image
from colorthief import ColorThief
from transformers import pipeline

from utils.vision_taxonomy import (
    FASHION_HIERARCHY, _ALL_FASHION_LABELS, _LABEL_TO_CATEGORY,
    _yolo_class_to_taxonomy, _resolve_seasons_for_item, _resolve_occasions_for_item,
    _has_clothing_signal, _resolve_label, _CATEGORY_TITLE
)
from utils.image_processing import (
    MemoryImageBuffer, _resolve_crop_box, _rgb_to_hex
)
from services.yolo_service import get_yolo_detector, is_yolo_available

logger = logging.getLogger(__name__)

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

try:
    _SECURITY_CLASSIFIER = pipeline(
        task="image-classification",
        model="google/vit-base-patch16-224",
        top_k=1,
    )
    logger.info("Security Gateway ViT ready.")
except Exception as sec_err:
    _SECURITY_CLASSIFIER = None
    logger.warning("Security Gateway ViT unavailable: %s", sec_err)


async def process_vision_pipeline(image_bytes: bytes) -> dict:
    try:
        raw_buf = io.BytesIO(image_bytes)
        pil_img = Image.open(raw_buf).convert("RGB")
        pil_img.thumbnail((800, 800))
        logger.info("[LOCAL-PIPELINE] Image decoded OK. Size: %s", pil_img.size)
    except Exception as img_err:
        logger.error("[LOCAL-PIPELINE] Image decode failed: %s", img_err)
        return {"status": "error", "message": "no_cloth_found", "detected_items": []}

    w, h = pil_img.size

    if _SECURITY_CLASSIFIER:
        try:
            sec_preds = await asyncio.to_thread(_SECURITY_CLASSIFIER, pil_img)
            if sec_preds:
                top_label = sec_preds[0]["label"].lower()
                whitelist_keywords = [
                    "shirt", "jean", "coat", "jacket", "suit", "dress", "skirt",
                    "shoe", "boot", "sneaker", "sandal", "tie", "hat", "cap",
                    "sweater", "pullover", "hoodie", "glove", "sock", "clothing",
                    "apparel", "vest", "gown", "pajama", "swim", "bra", "robe",
                    "trousers", "pants", "belt", "scarf", "accessory", "sunglass",
                    "cardigan", "poncho", "sweatshirt", "maillot", "jersey", "abaya",
                    "purse", "bag", "backpack", "wallet", "stole", "apron", "miniskirt",
                    "overskirt", "sombrero", "cloak", "uniform", "sweatpant", "shorts",
                    "denim", "t-shirt", "tee", "cargo", "loafer", "moccasin", "clog",
                    "sari", "saree", "sarong", "kimono", "tunic", "costume", "fabric",
                    "textile", "pattern", "salwaar", "salwar", "kurta", "kurti", "lehenga",
                    "dhoti", "churidar", "sherwani", "garment", "outfit", "wear",
                    "khaki", "military", "pant", "trouser", "lower", "bottom", "jeans",
                    "pocket", "zipper", "waistband", "ankle", "leg", "fashion", "cloth"
                ]
                if not any(kw in top_label for kw in whitelist_keywords):
                    logger.warning("[LOCAL-PIPELINE] Security Gateway rejected: '%s'", top_label)
                    return {"status": "error", "message": "no_cloth_found", "detected_items": []}
                else:
                    logger.info("[LOCAL-PIPELINE] Security Gateway passed: '%s'", top_label)
        except Exception as e:
            logger.warning("[LOCAL-PIPELINE] Security Gateway failed: %s", e)

    def _make_b64(img: Image.Image) -> str:
        thumb = img.copy()
        thumb.thumbnail((400, 400))
        buf = io.BytesIO()
        thumb.save(buf, format="JPEG", quality=85)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

    full_b64 = _make_b64(pil_img)
    final_items = []

    yolo = get_yolo_detector()
    if is_yolo_available() and yolo is not None:
        logger.info("[LOCAL-PIPELINE] YOLO available. Running multi-object detection.")
        try:
            yolo_results = await asyncio.to_thread(yolo, pil_img)
            boxes = yolo_results[0].boxes if yolo_results else []
            logger.info("[LOCAL-PIPELINE] YOLO detected %d boxes.", len(boxes) if boxes is not None else 0)

            for box in (boxes or []):
                conf = float(box.conf[0])
                if conf < 0.20:
                    continue

                cls_id = int(box.cls[0])
                cls_name = yolo.names.get(cls_id, "clothing")
                x1, y1, x2, y2 = [int(v) for v in box.xyxy[0]]

                cat, _ = _yolo_class_to_taxonomy(cls_name)
                if cat not in FASHION_HIERARCHY:
                    cat = "top"

                crop_pil = pil_img.crop((x1, y1, x2, y2))
                crop_b64 = _make_b64(crop_pil)

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

                try:
                    cb = io.BytesIO()
                    cw, ch = crop_pil.size
                    center_crop = crop_pil.crop((int(cw * 0.25), int(ch * 0.25), int(cw * 0.75), int(ch * 0.75)))
                    center_crop.thumbnail((100, 100))
                    center_crop.save(cb, format="JPEG")
                    cb.seek(0)
                    dominant = ColorThief(cb).get_color(quality=1)
                    hex_color = _rgb_to_hex(*dominant)
                except Exception:
                    hex_color = "#808080"

                final_items.append({
                    "id": uuid.uuid4().hex,
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

    if not final_items:
        logger.info("[LOCAL-PIPELINE] Running Zero-Shot whole-image classification.")
        cat = "top"
        sub = FASHION_HIERARCHY["top"]["default"]
        hex_color = "#808080"

        if _IS_ZERO_SHOT:
            try:
                preds = await asyncio.to_thread(_CLASSIFIER, pil_img, candidate_labels=_ALL_FASHION_LABELS)
                if preds:
                    sub = preds[0]["label"]
                    cat = _LABEL_TO_CATEGORY[sub]
                    logger.info("[LOCAL-PIPELINE] Fallback Zero-Shot match: %r (score: %.3f)", sub, preds[0]["score"])
            except Exception as e:
                logger.warning("[LOCAL-PIPELINE] Zero-Shot whole-image failed: %s", e)

        try:
            cb = io.BytesIO()
            cw, ch = pil_img.size
            center_crop = pil_img.crop((int(cw * 0.25), int(ch * 0.25), int(cw * 0.75), int(ch * 0.75)))
            center_crop.thumbnail((100, 100))
            center_crop.save(cb, format="JPEG")
            cb.seek(0)
            dominant = ColorThief(cb).get_color(quality=1)
            hex_color = _rgb_to_hex(*dominant)
        except Exception:
            pass

        final_items.append({
            "id": uuid.uuid4().hex,
            "category": cat.title(),
            "sub_type": sub,
            "hex_color": hex_color,
            "name": sub.title(),
            "box_coordinates": [0, 0, w, h],
            "image_crop_blob_reference": full_b64,
            "seasons": _resolve_seasons_for_item(cat, sub),
            "occasions": _resolve_occasions_for_item(cat, sub),
        })
        logger.info("[LOCAL-PIPELINE] Fallback item injected. cat=%s sub=%s", cat, sub)

    return {
        "status": "success",
        "message": "garments_verified",
        "detected_items": final_items,
    }

def classify_image(image_bytes: bytes) -> Optional[Tuple[str, str, str]]:
    source_buf = MemoryImageBuffer.from_bytes(image_bytes)
    box = _resolve_crop_box(source_buf)
    crop_buf = MemoryImageBuffer.from_crop(source_buf, box)
    predictions = _CLASSIFIER(crop_buf.to_pil())

    resolved_sub_type = None
    resolved_category = None

    for pred in predictions:
        sub_type_candidate, category_candidate = _resolve_label(pred["label"])
        if category_candidate is not None:
            resolved_sub_type = sub_type_candidate
            resolved_category = category_candidate
            break

    if resolved_category is None:
        return None

    label_corpus = " ".join(p["label"] for p in predictions)
    if not _has_clothing_signal(label_corpus):
        return None

    ct = ColorThief(crop_buf.to_bytesio())
    try:
        dominant = ct.get_color(quality=1)
    except Exception:
        dominant = (128, 128, 128)

    hex_color = _rgb_to_hex(*dominant)
    return resolved_category, resolved_sub_type, hex_color
