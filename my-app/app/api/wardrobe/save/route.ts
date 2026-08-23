/**
 * POST /api/wardrobe/save
 * Saves an already-detected ScanResultItemV2 item to the wardrobe via FastAPI.
 * Bypasses vision pipeline — item is already classified.
 */
import { NextRequest, NextResponse } from "next/server";

const FASTAPI_BASE = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: {
    name: string;
    category: string;
    sub_type: string;
    seasons: string[];
    occasions: string[];
    image_crop_blob_reference?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { name, category, sub_type, seasons, occasions, image_crop_blob_reference } = body;

  if (!name || !category) {
    return NextResponse.json(
      { error: "Missing required fields: name and category." },
      { status: 400 }
    );
  }

  const payload = {
    name,
    category: category.toLowerCase(),
    sub_type,
    color: "#888888",
    brand: null,
    tags: [sub_type].filter(Boolean),
    seasons: seasons ?? [],
    occasions: occasions ?? [],
    image_url: image_crop_blob_reference ?? null,
  };

  let fastapiRes: Response;
  try {
    fastapiRes = await fetch(`${FASTAPI_BASE}/api/wardrobe/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    return NextResponse.json(
      {
        error: `FastAPI is unreachable at ${FASTAPI_BASE}. Start it with: uvicorn main:app --reload --port 8000`,
        detail: (networkErr as Error).message,
      },
      { status: 502 }
    );
  }

  if (!fastapiRes.ok) {
    const errBody = await fastapiRes.text().catch(() => "(no body)");
    return NextResponse.json(
      { error: "FastAPI rejected the save request.", detail: errBody },
      { status: fastapiRes.status }
    );
  }

  const savedItem = await fastapiRes.json();
  return NextResponse.json(
    { message: "Item saved to your wardrobe! 🎉", item: savedItem },
    { status: 201 }
  );
}
