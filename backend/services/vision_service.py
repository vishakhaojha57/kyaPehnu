import io
import os
import json
import base64
import uuid
import logging
import asyncio
from typing import List, Any, Optional, Tuple

import numpy as np
from PIL import Image
from colorthief import ColorThief

from utils.vision_taxonomy import (
    FASHION_HIERARCHY, _ALL_FASHION_LABELS, _LABEL_TO_CATEGORY,
    _yolo_class_to_taxonomy, _resolve_seasons_for_item, _resolve_occasions_for_item,
    _has_clothing_signal, _resolve_label, _CATEGORY_TITLE,
    MODEL2_TO_TAXONOMY,
)
from utils.image_processing import (
    MemoryImageBuffer, _resolve_crop_box, _rgb_to_hex
)
from services.yolo_service import get_yolo_detector, is_yolo_available

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# MODEL 2 — Custom EfficientNetB0 TFLite Category Classifier (replaces FashionCLIP)
# Architecture: EfficientNetB0 → GAP → BatchNorm → Dense → Dropout → Dense(12, softmax)
# Input: 224×224 RGB float32 [0, 255]   (EfficientNet includes internal rescaling)
# Output: (1, 12) softmax probabilities
# ──────────────────────────────────────────────────────────────────────────────

_MODEL_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "models"))

_TFLITE_MODEL_PATH = os.path.join(_MODEL_DIR, "model2_category_classifier.tflite")
_LABEL_MAP_PATH = os.path.join(_MODEL_DIR, "model2_label_mapping.json")

_TFLITE_INTERPRETER = None
_TFLITE_INPUT_DETAILS = None
_TFLITE_OUTPUT_DETAILS = None
_TFLITE_LABELS: dict[int, str] = {}
_IS_TFLITE_READY = False

logger.info("Loading custom TFLite category classifier...")
try:
    # Try ai-edge-litert first (Python 3.13+), then tflite-runtime, then full TF
    try:
        from ai_edge_litert import interpreter as tflite_interp
        _TFLiteInterpreter = tflite_interp.Interpreter
        logger.info("Using ai-edge-litert TFLite backend.")
    except ImportError:
        try:
            import tflite_runtime.interpreter as tflite_interp
            _TFLiteInterpreter = tflite_interp.Interpreter
            logger.info("Using tflite-runtime TFLite backend.")
        except ImportError:
            import tensorflow as tf
            _TFLiteInterpreter = tf.lite.Interpreter
            logger.info("Using tensorflow.lite TFLite backend.")

    _TFLITE_INTERPRETER = _TFLiteInterpreter(model_path=_TFLITE_MODEL_PATH)
    _TFLITE_INTERPRETER.allocate_tensors()
    _TFLITE_INPUT_DETAILS = _TFLITE_INTERPRETER.get_input_details()
    _TFLITE_OUTPUT_DETAILS = _TFLITE_INTERPRETER.get_output_details()

    with open(_LABEL_MAP_PATH, "r", encoding="utf-8") as f:
        raw_labels = json.load(f)
    _TFLITE_LABELS = {int(k): v for k, v in raw_labels.items()}

    _IS_TFLITE_READY = True
    input_shape = _TFLITE_INPUT_DETAILS[0]["shape"]
    logger.info(
        "TFLite category classifier ready. Input shape: %s, Classes: %d (%s)",
        input_shape, len(_TFLITE_LABELS),
        ", ".join(_TFLITE_LABELS.values()),
    )
except Exception as _tflite_err:
    logger.warning("TFLite model unavailable (%s) — category classification disabled.", _tflite_err)

# ──────────────────────────────────────────────────────────────────────────────
# Security Gateway — ViT (unchanged, lightweight usage)
# ──────────────────────────────────────────────────────────────────────────────

try:
    from transformers import pipeline as _hf_pipeline

    _SECURITY_CLASSIFIER = _hf_pipeline(
        task="image-classification",
        model="google/vit-base-patch16-224",
        top_k=1,
    )
    logger.info("Security Gateway ViT ready.")
except Exception as sec_err:
    _SECURITY_CLASSIFIER = None
    logger.warning("Security Gateway ViT unavailable: %s", sec_err)


# ──────────────────────────────────────────────────────────────────────────────
# TFLite inference helper
# ──────────────────────────────────────────────────────────────────────────────

def _tflite_classify(pil_img: Image.Image) -> tuple[str, str, float]:
    """
    Run the TFLite EfficientNetB0 model on a PIL image.
    Returns (category, sub_type, confidence).
    Falls back to ("top", "t-shirt", 0.0) if the model is not available.
    """
    if not _IS_TFLITE_READY:
        return "top", "t-shirt", 0.0

    # Determine expected input shape from the model
    input_shape = _TFLITE_INPUT_DETAILS[0]["shape"]  # e.g. [1, 224, 224, 3]
    h, w = int(input_shape[1]), int(input_shape[2])

    # Preprocess: resize → numpy float32 → expand dims
    img_resized = pil_img.resize((w, h), Image.LANCZOS)
    img_arr = np.array(img_resized, dtype=np.float32)  # shape (224, 224, 3), values [0, 255]
    img_arr = np.expand_dims(img_arr, axis=0)           # shape (1, 224, 224, 3)

    # Run inference
    _TFLITE_INTERPRETER.set_tensor(_TFLITE_INPUT_DETAILS[0]["index"], img_arr)
    _TFLITE_INTERPRETER.invoke()
    output = _TFLITE_INTERPRETER.get_tensor(_TFLITE_OUTPUT_DETAILS[0]["index"])  # shape (1, 12)

    # Get top prediction
    probs = output[0]
    class_idx = int(np.argmax(probs))
    confidence = float(probs[class_idx])
    class_name = _TFLITE_LABELS.get(class_idx, "Tops")

    # Map to taxonomy
    cat, sub = MODEL2_TO_TAXONOMY.get(class_name, ("top", "t-shirt"))

    logger.info(
        "[TFLITE] Predicted: %s (idx=%d, conf=%.3f) → category=%s, sub_type=%s",
        class_name, class_idx, confidence, cat, sub,
    )
    return cat, sub, confidence


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

                # YOLO gives an initial category guess
                yolo_cat, _ = _yolo_class_to_taxonomy(cls_name)
                if yolo_cat not in FASHION_HIERARCHY:
                    yolo_cat = "top"

                crop_pil = pil_img.crop((x1, y1, x2, y2))
                crop_b64 = _make_b64(crop_pil)

                # ── Use TFLite Model 2 instead of FashionCLIP ─────────────
                if _IS_TFLITE_READY:
                    try:
                        cat, sub, tflite_conf = await asyncio.to_thread(_tflite_classify, crop_pil)
                        logger.info(
                            "[LOCAL-PIPELINE] TFLite classified crop: cat=%s, sub=%s (conf=%.3f)",
                            cat, sub, tflite_conf,
                        )
                    except Exception as e:
                        logger.warning("[LOCAL-PIPELINE] TFLite inference failed: %s", e)
                        cat = yolo_cat
                        sub = FASHION_HIERARCHY[yolo_cat]["default"]
                else:
                    cat = yolo_cat
                    sub = FASHION_HIERARCHY[yolo_cat]["default"]

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
            logger.warning("[LOCAL-PIPELINE] YOLO failed: %s — falling back to TFLite whole-image.", yolo_err)

    if not final_items:
        logger.info("[LOCAL-PIPELINE] Running TFLite whole-image classification.")
        cat = "top"
        sub = FASHION_HIERARCHY["top"]["default"]
        hex_color = "#808080"

        if _IS_TFLITE_READY:
            try:
                cat, sub, tflite_conf = await asyncio.to_thread(_tflite_classify, pil_img)
                logger.info(
                    "[LOCAL-PIPELINE] Fallback TFLite match: cat=%s, sub=%s (conf=%.3f)",
                    cat, sub, tflite_conf,
                )
            except Exception as e:
                logger.warning("[LOCAL-PIPELINE] TFLite whole-image failed: %s", e)

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

    # Use TFLite Model 2 for classification
    if _IS_TFLITE_READY:
        cat, sub, confidence = _tflite_classify(crop_buf.to_pil())
        if confidence < 0.15:
            return None
    else:
        return None

    ct = ColorThief(crop_buf.to_bytesio())
    try:
        dominant = ct.get_color(quality=1)
    except Exception:
        dominant = (128, 128, 128)

    hex_color = _rgb_to_hex(*dominant)
    return cat, sub, hex_color
