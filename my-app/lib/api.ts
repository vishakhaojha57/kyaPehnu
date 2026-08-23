import type {
  WardrobeItem,
  OutfitSuggestion,
  HealthResponse,
  AddItemRequest,
  ConsolidatedVisionResponse,
  WearOutfitRequest,
  OutfitHistoryRecord,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[${res.status}] ${path} → ${text}`);
  }

  return res.json() as Promise<T>;
}

export const checkHealth = (): Promise<HealthResponse> =>
  request<HealthResponse>("/health");

export const getAllItems = (userId?: string): Promise<WardrobeItem[]> =>
  request<WardrobeItem[]>("/api/wardrobe", undefined, userId);

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
  return request<OutfitSuggestion[]>(`/outfits/suggestions${qs}`, undefined, userId);
};

export const getOutfitById = (id: string, userId?: string): Promise<OutfitSuggestion> =>
  request<OutfitSuggestion>(`/outfits/suggestions/${id}`, undefined, userId);

export const logOutfitWear = (
  payload: WearOutfitRequest,
  userId?: string
): Promise<{ message: string; record: OutfitHistoryRecord }> =>
  request<{ message: string; record: OutfitHistoryRecord }>("/outfits/wear", {
    method: "POST",
    body: JSON.stringify(payload),
  }, userId);

export const getOutfitHistory = (userId?: string): Promise<OutfitHistoryRecord[]> =>
  request<OutfitHistoryRecord[]>("/outfits/history", undefined, userId);

export const deleteOutfitHistory = (id: string, userId?: string): Promise<{ deleted: string }> =>
  request<{ deleted: string }>(`/outfits/history/${id}`, { method: "DELETE" }, userId);

export async function analyzeClothing(file: File, userId?: string): Promise<ConsolidatedVisionResponse> {
  const form = new FormData();
  form.append("file", file);

  const headers: Record<string, string> = {};
  if (userId) {
    headers["X-User-Id"] = userId;
  }

  const res = await fetch(`${BASE_URL}/vision/analyze`, {
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
