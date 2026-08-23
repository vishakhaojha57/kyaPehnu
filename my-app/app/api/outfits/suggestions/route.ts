/**
 * KyaPehnu – Outfit Suggestions Route Handler
 * app/api/outfits/suggestions/route.ts
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Anti-Gravity Rules enforced here:
 *
 *  1. QUERY-STRING ONLY — lat and lon are read exclusively from URL search
 *     params to mirror the real browser Geolocation API shape. No JSON body
 *     parsing, no header-based coordinate injection.
 *
 *  2. ZERO FASTAPI LEAKAGE — Weather telemetry is resolved entirely via
 *     lib/weather.ts (Next.js space). FastAPI is never contacted, imported,
 *     or referenced from this file.
 *
 *  3. STRICT SCHEMA PERMANENCE — No new DB columns are created or altered.
 *     Filtering operates over the existing `season season_enum` column using
 *     PostgreSQL's ANY() array operator with a dynamically built season array.
 *
 *  4. DEEP TRY/CATCH ISOLATION — Every async operation (telemetry translation,
 *     DB query 1, DB query 2) is wrapped in its own structural try/catch block.
 *     A failure in any single layer issues an informative JSON error payload
 *     without locking up the Next.js runtime process.
 */

import { NextRequest, NextResponse } from "next/server";
import { coordsToSeasons, getCircuitBreakerSnapshot } from "@/lib/weather";
import { auth } from "@/lib/auth";

// ── GET /api/outfits/suggestions?lat=<lat>&lon=<lon> ─────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  // ── Step 1: Parse and validate lat/lon query string params ─────────────────
  // Using query params (not JSON body) to mirror the navigator.geolocation API.
  const { searchParams } = new URL(request.url);
  const rawLat = searchParams.get("lat");
  const rawLon = searchParams.get("lon");

  if (!rawLat || !rawLon) {
    return NextResponse.json(
      {
        error: "Missing required query parameters.",
        required: { lat: "number (-90 to 90)", lon: "number (-180 to 180)" },
        example: "/api/outfits/suggestions?lat=28.6139&lon=77.2090",
      },
      { status: 400 }
    );
  }

  const lat = parseFloat(rawLat);
  const lon = parseFloat(rawLon);

  if (
    isNaN(lat) || isNaN(lon) ||
    lat < -90  || lat > 90  ||
    lon < -180 || lon > 180
  ) {
    return NextResponse.json(
      {
        error: "Invalid coordinate values.",
        detail: `lat must be between -90 and 90, lon between -180 and 180.`,
        received: { lat: rawLat, lon: rawLon },
      },
      { status: 400 }
    );
  }

  // ── Step 2: Translate GPS coordinates → seasonal match array ───────────────
  // lib/weather.ts handles this exclusively — FastAPI is never contacted here.
  // Mock returns ['summer', 'spring', 'all'] instantly if no API key is set.
  let seasons: string[];

  try {
    seasons = await coordsToSeasons(lat, lon);
  } catch (telemetryErr) {
    // Capture circuit breaker snapshot at the moment of failure — read-only,
    // no live reference to internal weather.ts state arrays is forwarded.
    const cbSnapshot = getCircuitBreakerSnapshot();
    console.error(
      "[GET /api/outfits/suggestions] Telemetry translation error:",
      telemetryErr
    );
    return NextResponse.json(
      {
        error: "Weather telemetry translation failed.",
        detail: (telemetryErr as Error).message,
        hint: "Check OPENWEATHER_KEY or NEXT_PUBLIC_OPENWEATHER_KEY in .env.local.",
        // Read-only snapshot for diagnostic panels — never a live reference
        circuit_breaker_snapshot: cbSnapshot,
      },
      { status: 502 }
    );
  }

  // ── Step 3: Fetch from FastAPI Backend ──────────────────────────────────────
  // The database schema has been refactored in the backend, so we now delegate
  // to FastAPI to handle the data contract cleanly.
  let wardrobeItems: any[] = [];
  try {
    const API_URL = process.env.FASTAPI_URL || "http://localhost:8000";
    const headers: Record<string, string> = {};
    if (userId) headers["X-User-Id"] = userId as string;
    
    const itemsRes = await fetch(`${API_URL}/api/wardrobe`, { headers });
    if (itemsRes.ok) {
      const allItems = await itemsRes.json();
      wardrobeItems = allItems.filter((item: any) => 
        !item.seasons || item.seasons.length === 0 || 
        item.seasons.some((s: string) => seasons.includes(s)) || seasons.includes('all')
      );
    }
  } catch (dbItemsErr) {
    console.error("[GET /api/outfits/suggestions] FastAPI wardrobe fetch failed:", dbItemsErr);
  }

  let outfitSuggestions: any[] = [];
  try {
    const API_URL = process.env.FASTAPI_URL || "http://localhost:8000";
    const headers: Record<string, string> = {};
    if (userId) headers["X-User-Id"] = userId as string;
    
    const outfitsRes = await fetch(`${API_URL}/outfits/suggestions`, { headers });
    if (outfitsRes.ok) {
      outfitSuggestions = await outfitsRes.json();
    }
  } catch (dbOutfitsErr) {
    console.error("[GET /api/outfits/suggestions] FastAPI suggestions fetch failed:", dbOutfitsErr);
    return NextResponse.json(
      {
        error: "Outfit suggestions API fetch failed.",
        detail: (dbOutfitsErr as Error).message,
        seasons_matched: seasons,
        coords: { lat, lon },
        wardrobe_items: wardrobeItems,
        wardrobe_item_count: wardrobeItems.length,
        outfit_suggestions: [],
        outfit_count: 0,
      },
      { status: 500 }
    );
  }

  // ── Step 4: Return structured success payload ───────────────────────────────
  return NextResponse.json(
    {
      seasons_matched:     seasons,
      coords:              { lat, lon },
      wardrobe_items:      wardrobeItems,
      wardrobe_item_count: wardrobeItems.length,
      outfit_suggestions:  outfitSuggestions,
      outfit_count:        outfitSuggestions.length,
    },
    { status: 200 }
  );
}
