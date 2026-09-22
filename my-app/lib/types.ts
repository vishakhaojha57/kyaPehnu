/**
 * KyaPehnu – TypeScript Contract Interfaces
 *
 * CRITICAL: Every key here must match the Pydantic schema field names
 * in backend/main.py exactly — same names, same optional-ness.
 */

// ── Mirrors: WardrobeItem ────────────────────────────────────────────────────
export interface WardrobeItem {
  id: string;
  name: string;
  category: "top" | "bottom" | "footwear" | "accessory" | "outfit" | string;
  sub_type?: string | null;
  color: string;
  brand: string | null;
  tags: string[];
  seasons: string[];
  occasions: string[];
  image_url: string | null;
  is_favourite: boolean;
  last_worn?: string | null;
}

export interface RepeatAlert {
  is_repeat: boolean;
  days_ago?: number;
  badge_text?: string;
  severity?: "warning" | "caution";
}

// ── Mirrors: OutfitSuggestion ────────────────────────────────────────────────
export interface OutfitSuggestion {
  id: string;
  occasion: "casual" | "formal" | "party" | "sport";
  items: WardrobeItem[];
  confidence_score: number;  // 0.0 – 1.0
  style_note: string;
  repeat_alert?: RepeatAlert;
}

// ── Mirrors: WearOutfitRequest ────────────────────────────────────────────────
export interface WearOutfitRequest {
  top_item_id: string;
  bottom_item_id: string;
  occasion_text: string;
  weather_temp: number;
  season: string;
}

// ── Mirrors: OutfitHistoryRecord ──────────────────────────────────────────────
export interface OutfitHistoryRecord {
  id: string;
  top_item_id: string;
  bottom_item_id: string;
  occasion_display: string;
  occasion_category: string;
  weather_temp: number;
  season: string;
  worn_date: string;
  created_at: string;
  top_item?: WardrobeItem | null;
  bottom_item?: WardrobeItem | null;
}

// ── Mirrors: RepetitionCheckResponse ──────────────────────────────────────────
export interface RepetitionCheckResponse {
  top_worn_ago_days: number | null;
  top_last_occasion: string | null;
  bottom_worn_ago_days: number | null;
  bottom_last_occasion: string | null;
  combo_worn_ago_days: number | null;
  combo_last_occasion: string | null;
  top_worn_count_month: number;
  bottom_worn_count_month: number;
  combo_worn_count_month: number;
}

// ── Mirrors: HealthResponse ──────────────────────────────────────────────────
export interface HealthResponse {
  status: string;
  version: string;
  mode: string;
}

// ── Mirrors: AddItemRequest (used when POSTing) ──────────────────────────────
export interface AddItemRequest {
  name: string;
  category: string;
  sub_type?: string | null;
  color: string;
  brand?: string | null;
  tags?: string[];
  seasons?: string[];
  occasions?: string[];
  image_url?: string | null;
}

// ── Mirrors: VisionResult ─────────────────────────────────────────────────────
export interface VisionResult {
  clothing_type: "top" | "bottom" | "footwear" | "accessory" | "outfit";
  /** Fine-grained sub-type — JSON metadata only, no DB column. */
  sub_type:  string;
  hex_color: string;
}

// ── Mirrors: VisionResultV3 — Tri-Tier Validation Matrix (Sub-Phase 3) ────────
// Maps directly onto the FastAPI VisionResultV3 Pydantic schema.
// specific_type is stored in tags TEXT[] or meta JSON — no new DB column.
export interface VisionResultV3 {
  /** Broad wardrobe bucket resolved by Tier 1 / Tier 2. */
  clothing_type: "top" | "bottom" | "footwear" | "accessory" | "outfit";
  /** Tier 1/2 resolved label e.g. "jeans", "shirt", "sneakers". */
  sub_category:  string;
  /**
   * Tier 3 granular fabric/silhouette label.
   * e.g. "baggy", "skinny", "bell_bottom", "formal_shirt", "oversized_t-shirt".
   * Empty string "" when no fine-grained pattern matched — treat as "general".
   */
  specific_type: string;
  /** Dominant colour as #rrggbb. */
  hex_color:     string;
}

export interface ConsolidatedVisionResponse {
  status: "success" | "error";
  message: string;
  detected_items: ScanResultItemV2[];
}

// ── Type guard helper ──────────────────────────────────────────────────────────
/** Returns true when the API response is a No Cloth Found sentinel. */
export function isGarmentNotFound(r: unknown): boolean {
  return (
    r !== null &&
    typeof r === "object" &&
    (r as Record<string, unknown>)["status"] === "error" &&
    (r as Record<string, unknown>)["message"] === "no_cloth_found"
  );
}

// ── Mirrors: DetectedItemResult (multi-crop YOLO scan — v1 contract) ──────────
export interface DetectedItem {

  category:   "top" | "bottom" | "footwear" | "accessory" | "outfit";
  sub_type:   string;    // e.g. "t-shirt", "shorts", "sneakers"
  hex_color:  string;    // "#rrggbb"
  crop_b64:   string;    // data:image/jpeg;base64,... (heap blob, no disk)
  confidence: number;    // YOLO confidence 0–1 (1.0 for fallback)
  box:        number[];  // [x1, y1, x2, y2]
  fallback:   boolean;   // true when YOLO found nothing
  seasons:    string[];
  occasions:  string[];
}

// ── Mirrors: ScanResultItemV2 (multi-object V2 integrity contract) ─────────────
// Maps directly onto the Neon PostgreSQL persistence layer and Next.js grid.
// Field names are an exact mirror of the FastAPI ScanResultItemV2 Pydantic model.
export interface ScanResultItemV2 {
  /** Unique uuid4 hex identifier — safe as React key and DB primary key. */
  id:                        string;
  /** Title-cased category: "Top" | "Bottom" | "Footwear" | "Accessory" */
  category:                  "Top" | "Bottom" | "Footwear" | "Accessory" | "Outfit";
  /** Granular sub-type resolved from the Tri-Tier mapping matrix. */
  sub_type:                  string;   // e.g. "cargo", "jeans", "sneakers"
  /** User-friendly display tag derived from colour + sub_type. */
  name:                      string;   // e.g. "Blue Cargo Pants"
  /** Bounding box pixel coordinates of the detected item. */
  box_coordinates:           [number, number, number, number]; // [x_min, y_min, x_max, y_max]
  /** JPEG base64 data-URI containing only the isolated garment crop. */
  image_crop_blob_reference: string;   // data:image/jpeg;base64,...
  /** List of suitable Indian seasons mapped by AI heuristic */
  seasons:                   string[];
  /** List of suitable occasions (e.g. casual, festive) */
  occasions:                 string[];
}
