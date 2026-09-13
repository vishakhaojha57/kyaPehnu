import type {
  WardrobeItem,
  OutfitSuggestion,
  HealthResponse,
  AddItemRequest,
  ConsolidatedVisionResponse,
  WearOutfitRequest,
  OutfitHistoryRecord,
  RepetitionCheckResponse,
} from "./types";

const NEXT_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const FASTAPI_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit, userId?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (userId) {
    headers["X-User-Id"] = userId;
  }

  if (init?.headers) {
    Object.assign(headers, init.headers);
  }

  const isGet = !init || !init.method || init.method.toUpperCase() === "GET";
  const finalPath = isGet
    ? path + (path.includes("?") ? "&" : "?") + `_t=${Date.now()}`
    : path;

  const res = await fetch(`${NEXT_API_URL}${finalPath}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[API ERROR] ${finalPath} -> ${res.status}: ${text}`);
    throw new Error(`[${res.status}] ${finalPath} → ${text}`);
  }

  const data = await res.json();
  if (finalPath.includes("history")) {
    console.log(`[API TRACE] GET ${finalPath} for user ${userId} returned ${Array.isArray(data) ? data.length : "non-array"} items.`);
  }
  return data as T;
}

export const checkHealth = async (): Promise<HealthResponse> => {
  const res = await fetch(`${FASTAPI_URL}/health`);
  return res.json();
};

export const getAllItems = (userId?: string): Promise<WardrobeItem[]> =>
  request<WardrobeItem[]>("/api/wardrobe", { cache: "no-store" }, userId);

export const getItem = (id: string, userId?: string): Promise<WardrobeItem> =>
  request<WardrobeItem>(`/api/wardrobe/${id}`, undefined, userId);

export const updateItem = (id: string, updates: Partial<WardrobeItem>, userId?: string): Promise<WardrobeItem> =>
  request<WardrobeItem>(`/api/wardrobe/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  }, userId);

export const addItem = (payload: AddItemRequest, userId?: string): Promise<WardrobeItem> =>
  request<WardrobeItem>("/api/wardrobe/add", {
    method: "POST",
    body: JSON.stringify(payload),
  }, userId);

export const deleteItem = (id: string, userId?: string): Promise<{ deleted: string }> =>
  request<{ deleted: string }>(`/api/wardrobe/${id}`, { method: "DELETE" }, userId);

export const getOutfitSuggestions = (
  occasion?: string,
  userId?: string
): Promise<OutfitSuggestion[]> => {
  const qs = occasion ? `?occasion=${encodeURIComponent(occasion)}` : "";
  return request<OutfitSuggestion[]>(`/api/outfits/suggestions${qs}`, { cache: "no-store" }, userId);
};

export const getOutfitById = (id: string, userId?: string): Promise<OutfitSuggestion> =>
  request<OutfitSuggestion>(`/api/outfits/suggestions/${id}`, undefined, userId);

export const logOutfitWear = async (
  payload: WearOutfitRequest,
  userId?: string
): Promise<{ message: string; record: OutfitHistoryRecord }> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers["X-User-Id"] = userId;
  const res = await fetch(`${FASTAPI_URL}/outfits/wear`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  return res.json();
};

export const getOutfitHistory = async (userId?: string): Promise<OutfitHistoryRecord[]> => {
  const headers: Record<string, string> = {};
  if (userId) headers["X-User-Id"] = userId;
  const res = await fetch(`${FASTAPI_URL}/outfits/history`, { headers });
  return res.json();
};

export const deleteOutfitHistory = async (id: string, userId?: string): Promise<{ deleted: string }> => {
  const headers: Record<string, string> = {};
  if (userId) headers["X-User-Id"] = userId;
  const res = await fetch(`${FASTAPI_URL}/outfits/history/${id}`, { method: "DELETE", headers });
  return res.json();
};

export async function analyzeClothing(file: File, userId?: string): Promise<ConsolidatedVisionResponse> {
  const form = new FormData();
  form.append("file", file);

  const headers: Record<string, string> = {};
  if (userId) {
    headers["X-User-Id"] = userId;
  }

  const res = await fetch(`${FASTAPI_URL}/vision/analyze`, {
    method: "POST",
    body: form,
    headers,
    // Do NOT set Content-Type — browser sets it with boundary automatically
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[${res.status}] /vision/analyze → ${text}`);
  }

  return res.json() as Promise<ConsolidatedVisionResponse>;
}

export const checkRepetition = async (
  topId: string,
  bottomId: string,
  userId?: string
): Promise<RepetitionCheckResponse> => {
  const headers: Record<string, string> = {};
  if (userId) headers["X-User-Id"] = userId;
  const qs = `?top_id=${encodeURIComponent(topId)}&bottom_id=${encodeURIComponent(bottomId)}`;
  const res = await fetch(`${FASTAPI_URL}/outfits/repetition-check${qs}`, { headers });
  return res.json();
};
