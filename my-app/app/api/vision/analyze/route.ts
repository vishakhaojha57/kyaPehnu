import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const FASTAPI_BASE = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Secure: resolve user ID from server-side session cookie
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const headers: Record<string, string> = {};
  if (userId) headers["X-User-Id"] = userId;

  try {
    const formData = await request.formData();
    // Do NOT set Content-Type, fetch sets multipart/form-data with boundary automatically when passing FormData
    const res = await fetch(`${FASTAPI_BASE}/vision/analyze`, { 
      method: "POST",
      headers,
      body: formData
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
