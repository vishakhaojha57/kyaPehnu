import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

const FASTAPI_BASE = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Secure: resolve user ID from server-side session cookie
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers["X-User-Id"] = userId;

  try {
    const body = await request.json();
    
    // --- Anti-Gravity Repetition System: Log to Next.js Database ---
    try {
      const { top_item_id, bottom_item_id, occasion_text, season } = body;
      if (top_item_id && bottom_item_id) {
        await db.query(
          `INSERT INTO outfit_history (top_item_id, bottom_item_id, occasion, season, user_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [top_item_id, bottom_item_id, occasion_text, season, userId]
        );
        console.log(`[Next.js POST /outfits/wear] Inserted history for top: ${top_item_id}, bottom: ${bottom_item_id}`);
      }
    } catch (dbErr) {
      console.error("[Next.js POST /outfits/wear] Non-blocking DB insert failed:", dbErr);
      // Non-Blocking Fallback: We do not fail the request.
    }
    // -------------------------------------------------------------

    const res = await fetch(`${FASTAPI_BASE}/outfits/wear`, { 
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      return NextResponse.json({ error: "FastAPI fetch failed", detail: errText }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Could not reach FastAPI", detail: (error as Error).message },
      { status: 502 }
    );
  }
}
