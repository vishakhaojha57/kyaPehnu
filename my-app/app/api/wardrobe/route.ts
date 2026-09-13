
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Port 8000 FastAPI vision node — isolated computer-vision calculator only. */
const FASTAPI_BASE =
  process.env.FASTAPI_URL ?? "http://localhost:8000";

const VISION_ENDPOINT = `${FASTAPI_BASE}/vision/analyze`;

// ── Type definitions ──────────────────────────────────────────────────────────

interface VisionResult {
  clothing_type: "top" | "bottom" | "footwear" | "accessory" | "outfit";
  /** Fine-grained sub-category from the Two-Tier label resolver. JSON-only; no DB column mutation. */
  sub_type:      string;
  hex_color:     string;
}

interface WardrobeItemRow {
  id: string;
  name: string;
  item_type: string;
  category: string;
  season: string;
  hex_color: string;
  color_label: string | null;
  brand: string | null;
  tags: string[];
  image_url: string | null;
  image_hash: string | null;
  is_favourite: boolean;
  created_at: string;
  updated_at: string;
  sub_type?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Proxy the raw multipart image bytes to FastAPI's vision endpoint.
 * Returns the parsed VisionResult or throws a descriptive error.
 */
async function callVisionAPI(imageFormData: FormData): Promise<VisionResult> {
  let response: Response;

  try {
    response = await fetch(VISION_ENDPOINT, {
      method: "POST",
      body: imageFormData,
      // No explicit Content-Type header — fetch sets it with the correct boundary.
    });
  } catch (networkErr) {
    // FastAPI service is unreachable (offline, wrong port, firewall, etc.)
    throw new Error(
      `FastAPI vision service is unreachable at ${VISION_ENDPOINT}. ` +
        `Start it with: uvicorn main:app --reload --port 8000\n` +
        `Network detail: ${(networkErr as Error).message}`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)");
    throw new Error(
      `FastAPI vision endpoint returned ${response.status}: ${body}`
    );
  }

  let visionResult: VisionResult;
  try {
    visionResult = (await response.json()) as VisionResult;
  } catch {
    throw new Error("FastAPI returned a non-JSON response from /vision/analyze");
  }

  // Validate the payload shape before trusting it
  const validTypes = ["top", "bottom", "footwear", "accessory"] as const;
  if (!validTypes.includes(visionResult.clothing_type as typeof validTypes[number])) {
    throw new Error(
      `Invalid clothing_type returned by vision API: "${visionResult.clothing_type}". ` +
        `Expected one of: ${validTypes.join(", ")}`
    );
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(visionResult.hex_color)) {
    throw new Error(
      `Invalid hex_color returned by vision API: "${visionResult.hex_color}". ` +
        `Expected format: #rrggbb`
    );
  }
  // Property Continuity Protection: sub_type must be a non-empty string
  if (!visionResult.sub_type || typeof visionResult.sub_type !== "string" || visionResult.sub_type.trim() === "") {
    // Fail-safe: fall back to clothing_type as the sub_type token rather than hard-failing
    (visionResult as { sub_type: string }).sub_type = visionResult.clothing_type;
  }

  return visionResult;
}

/**
 * Persist a validated wardrobe item to PostgreSQL.
 * All DB logic lives exclusively in this route — not in the Python service.
 */
async function insertWardrobeItem(params: {
  name: string;
  item_type: VisionResult["clothing_type"];
  sub_type:  string;
  hex_color: string;
  image_url: string | null;
  image_hash: string | null;
  brand: string | null;
  tags: string[];
}): Promise<WardrobeItemRow> {
  const { name, item_type, sub_type, hex_color, image_url, image_hash, brand, tags } =
    params;

  const result = await db.query<WardrobeItemRow>(
    `
    INSERT INTO wardrobe_items
      (name, item_type, category, sub_type, hex_color, image_url, image_hash, brand, tags)
    VALUES
      ($1,   $2,        $2,       $3,       $4,        $5,        $6,         $7,    $8)
    ON CONFLICT DO NOTHING
    RETURNING *
    `,
    [name, item_type, sub_type, hex_color, image_url, image_hash, brand, tags]
  );

  if (result.rowCount === 0) {
    throw new Error(
      "Duplicate item detected — a wardrobe item with identical metadata already exists."
    );
  }

  return result.rows[0];
}

// ── Route handlers ────────────────────────────────────────────────────────────

/**
 * GET /api/wardrobe
 * Returns all wardrobe items from PostgreSQL, ordered by creation date.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const result = await db.query<WardrobeItemRow>(
      `SELECT * FROM wardrobe_items ORDER BY created_at DESC`
    );
    
    // Map DB schema to frontend WardrobeItem interface
    const mappedItems = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category || row.item_type,
      sub_type: row.sub_type,
      color: row.hex_color, // Map hex_color to color
      brand: row.brand,
      tags: row.tags || [],
      seasons: row.season ? [row.season] : [], // Wrap singular season in array
      occasions: [], // DB doesn't have occasions yet, but UI expects array
      image_url: row.image_url,
      is_favourite: row.is_favourite,
      created_at: row.created_at,
    }));
    
    return NextResponse.json(mappedItems, { status: 200 });
  } catch (err) {
    console.error("[GET /api/wardrobe] DB error:", err);
    return NextResponse.json(
      {
        error: "Failed to fetch wardrobe items.",
        detail: (err as Error).message,
      },
      { status: 500 }
    );
  }
}




export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Step 1: Intercept raw multipart upload ───────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (parseErr) {
    return NextResponse.json(
      {
        error: "Failed to parse multipart form data.",
        detail: (parseErr as Error).message,
      },
      { status: 400 }
    );
  }

  const imageFile = formData.get("image") as File | null;
  if (!imageFile || typeof imageFile === "string") {
    return NextResponse.json(
      { error: 'Missing required field "image" (must be an image file).' },
      { status: 400 }
    );
  }

  if (!imageFile.type.startsWith("image/")) {
    return NextResponse.json(
      {
        error: `Invalid file type "${imageFile.type}". Only image files are accepted.`,
      },
      { status: 415 }
    );
  }

  // Optional metadata fields the client may supply alongside the image
  const itemName = (formData.get("name") as string | null)?.trim() || imageFile.name;
  const brand = (formData.get("brand") as string | null)?.trim() || null;
  const tagsRaw = formData.get("tags") as string | null;
  const tags: string[] = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const imageUrl = (formData.get("image_url") as string | null)?.trim() || null;
  const imageHash = (formData.get("image_hash") as string | null)?.trim() || null;

  // ── Step 2: Proxy image to FastAPI — pure CV calculator, zero DB logic ───
  let visionResult: VisionResult;

  // Build a fresh FormData to forward only the raw file bytes to FastAPI.
  const visionForm = new FormData();
  visionForm.append("file", imageFile);

  try {
    visionResult = await callVisionAPI(visionForm);
  } catch (visionErr) {
    const message = (visionErr as Error).message;
    console.error("[POST /api/wardrobe] Vision API error:", message);

    // Informative error to the client — no DB write attempted.
    return NextResponse.json(
      {
        error: "AI vision analysis failed. The item was NOT saved.",
        detail: message,
        hint: "Ensure the FastAPI server is running on port 8000 (`uvicorn main:app --reload`).",
      },
      { status: 502 }
    );
  }

  // ── Step 3: Write to PostgreSQL — only after valid vision response ────────
  let newItem: WardrobeItemRow;
  try {
    newItem = await insertWardrobeItem({
      name: itemName,
      item_type: visionResult.clothing_type,
      sub_type:  visionResult.sub_type,
      hex_color: visionResult.hex_color,
      image_url: imageUrl,
      image_hash: imageHash,
      brand,
      tags,
    });
  } catch (dbErr) {
    const message = (dbErr as Error).message;
    console.error("[POST /api/wardrobe] DB write error:", message);

    return NextResponse.json(
      {
        error: "Database write failed.",
        detail: message,
        vision_result: visionResult, // Include so the client can retry without re-uploading
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      message: "Wardrobe item added successfully.",
      item: newItem,
      vision_result: visionResult,
    },
    { status: 201 }
  );
}
