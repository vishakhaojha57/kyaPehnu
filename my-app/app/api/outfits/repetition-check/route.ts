import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const FASTAPI_BASE = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Secure: resolve user ID from server-side session cookie
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const headers: Record<string, string> = {};
  if (userId) headers["X-User-Id"] = userId;

  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const query = qs ? `?${qs}` : "";

  try {
    const res = await fetch(`${FASTAPI_BASE}/outfits/repetition-check${query}`, { headers });
    
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
