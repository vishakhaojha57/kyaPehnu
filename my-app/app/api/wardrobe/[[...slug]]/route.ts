import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const FASTAPI_BASE = process.env.FASTAPI_URL ?? "http://localhost:8000";

function optimizeItemPayload(item: any) {
  if (!item) return item;

  // 1. Storage Payload Verification & CDN Optimization
  let optimizedImageUrl = item.image_url;
  if (optimizedImageUrl) {
    if (optimizedImageUrl.startsWith("data:image")) {
      // Should not happen normally as backend intercepts, but safety strip
      optimizedImageUrl = null;
    } else if (optimizedImageUrl.includes("res.cloudinary.com") && optimizedImageUrl.includes("/upload/")) {
      // Inject CDN delivery transformations if not already present
      if (!optimizedImageUrl.includes("f_auto")) {
        optimizedImageUrl = optimizedImageUrl.replace("/upload/", "/upload/f_auto,q_auto,w_400,c_limit/");
      }
    }
  }

  // 2. Database Query Projection (Pruning unused diagnostic/metadata arrays if any)
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    sub_type: item.sub_type,
    color: item.color,
    brand: item.brand,
    tags: item.tags ?? [],
    seasons: item.seasons ?? [],
    occasions: item.occasions ?? [],
    image_url: optimizedImageUrl,
    is_favourite: item.is_favourite,
    // Add any fields needed for outfit history or other views that fetch single items
    last_worn: item.last_worn,
  };
}

async function proxy(request: NextRequest, { params }: { params: Promise<{ slug?: string[] }> }) {
  // Secure: resolve user ID from server-side session cookie, NOT from client header
  const session = await auth();
  const userId = session?.user?.id ?? null;
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

    let data = await res.json();

    // Apply optimization on GET requests
    if (request.method === "GET") {
      if (Array.isArray(data)) {
        data = data.map(optimizeItemPayload);
      } else {
        data = optimizeItemPayload(data);
      }
    }

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
