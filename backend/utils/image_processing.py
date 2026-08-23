import io
import logging
from typing import Tuple, Optional
from PIL import Image
import numpy as np

logger = logging.getLogger(__name__)

def _rgb_to_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02x}{g:02x}{b:02x}"

class MemoryImageBuffer:
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
