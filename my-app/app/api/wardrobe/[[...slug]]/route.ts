import { NextRequest, NextResponse } from "next/server";

const FASTAPI_BASE = process.env.FASTAPI_URL ?? "http://localhost:8000";

async function proxy(request: NextRequest, { params }: { params: Promise<{ slug?: string[] }> }) {
  const userId = request.headers.get("X-User-Id");
  const headers: Record<string, string> = {};
  if (userId) headers["X-User-Id"] = userId;
  
  // Also pass the Content-Type if it exists
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers["Content-Type"] = contentType;

  const resolvedParams = await params;
  const slugPath = resolvedParams.slug ? resolvedParams.slug.join("/") : "";
  const endpoint = slugPath ? `/api/wardrobe/${slugPath}` : "/api/wardrobe";

  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const query = qs ? `?${qs}` : "";

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    // Determine if it's multipart or JSON
    if (contentType?.includes("multipart/form-data")) {
      init.body = await request.formData();
      // Remove content-type so fetch can set it with boundary
      delete headers["Content-Type"];
    } else {
      init.body = await request.text();
    }
  }

  try {
    const res = await fetch(`${FASTAPI_BASE}${endpoint}${query}`, init);
    
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

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
