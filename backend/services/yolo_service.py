import logging

logger = logging.getLogger(__name__)

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

def get_yolo_detector():
    return _YOLO_DETECTOR

def is_yolo_available():
    return _YOLO_AVAILABLE
