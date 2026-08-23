/**
 * useSuggestions – Decoupled Asynchronous State Rendering Hook
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches outfit recommendations and wardrobe inventory purely from async
 * JSON API response tokens. No SQL strings, no direct DB calls, no blocking
 * operations ever run inside this hook or any component that consumes it.
 *
 * Data shape expected from GET /api/outfits/suggestions?lat=&lon=:
 * {
 *   wardrobe_items:     WardrobeItem[]
 *   outfit_suggestions: OutfitSuggestion[]
 *   seasons_matched:    string[]
 *   wardrobe_item_count: number
 *   outfit_count:       number
 * }
 *
 * Geolocation is obtained from navigator.geolocation (browser-native) and
 * forwarded as query-string params — mirrors the server-side contract in
 * /api/outfits/suggestions/route.ts.
 */

"use client";

import { useState, useCallback } from "react";
import type { WardrobeItem, OutfitSuggestion } from "./types";

// ── Response shape from /api/outfits/suggestions ─────────────────────────────

export interface SuggestionsPayload {
  wardrobe_items:      WardrobeItem[];
  outfit_suggestions:  OutfitSuggestion[];
  seasons_matched:     string[];
  wardrobe_item_count: number;
  outfit_count:        number;
  coords?:             { lat: number; lon: number };
}

export type SuggestionsState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "loading" }
  | { status: "ready";   data: SuggestionsPayload }
  | { status: "error";   message: string };

export interface SuggestionsHandle {
  state:   SuggestionsState;
  refresh: () => void;
}

// ── Geolocation promise wrapper ───────────────────────────────────────────────

function getBrowserCoords(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("navigator.geolocation is not supported in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(new Error(`Geolocation denied: ${err.message}`)),
      { timeout: 8000, maximumAge: 60_000 }
    );
  });
}

// ── JSON array parser / validator ─────────────────────────────────────────────

/**
 * Parses the raw API response into a typed SuggestionsPayload.
 * Rejects blobs that are not JSON arrays for the inventory/forecast fields.
 */
function parseSuggestionsPayload(raw: unknown): SuggestionsPayload {
  if (typeof raw !== "object" || raw === null) {
    throw new TypeError("Response is not a JSON object.");
  }

  const r = raw as Record<string, unknown>;

  if (!Array.isArray(r.wardrobe_items)) {
    throw new TypeError("wardrobe_items must be a JSON array.");
  }
  if (!Array.isArray(r.outfit_suggestions)) {
    throw new TypeError("outfit_suggestions must be a JSON array.");
  }
  if (!Array.isArray(r.seasons_matched)) {
    throw new TypeError("seasons_matched must be a JSON array.");
  }

  return {
    wardrobe_items:      r.wardrobe_items      as WardrobeItem[],
    outfit_suggestions:  r.outfit_suggestions  as OutfitSuggestion[],
    seasons_matched:     r.seasons_matched     as string[],
    wardrobe_item_count: Number(r.wardrobe_item_count ?? r.wardrobe_items.length),
    outfit_count:        Number(r.outfit_count        ?? r.outfit_suggestions.length),
    coords:              r.coords as { lat: number; lon: number } | undefined,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSuggestions(): SuggestionsHandle {
  const [state, setState] = useState<SuggestionsState>({ status: "idle" });

  const refresh = useCallback(() => {
    // Abort any previous in-flight request via AbortController
    const controller = new AbortController();

    (async () => {
      // ── Phase 1: Acquire browser GPS token ─────────────────────────────────
      setState({ status: "locating" });
      let lat: number, lon: number;

      try {
        const coords = await getBrowserCoords();
        lat = coords.latitude;
        lon = coords.longitude;
      } catch (geoErr: unknown) {
        // Fallback: use Delhi coordinates so the app never blocks on GPS denial
        console.warn(
          "[useSuggestions] Geolocation unavailable, using Delhi fallback coords:",
          geoErr
        );
        lat = 28.6139;
        lon = 77.209;
      }

      // ── Phase 2: Fetch — state hooks depend purely on async JSON tokens ─────
      setState({ status: "loading" });

      try {
        const url = `/api/outfits/suggestions?lat=${lat}&lon=${lon}`;
        const res = await fetch(url, { signal: controller.signal });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`[${res.status}] ${text}`);
        }

        // ── Phase 3: Parse returned JSON arrays (no SQL, no DB logic here) ────
        const raw: unknown = await res.json();
        const data = parseSuggestionsPayload(raw);

        setState({ status: "ready", data });
      } catch (fetchErr: unknown) {
        if ((fetchErr as { name?: string }).name === "AbortError") return;
        const message =
          fetchErr instanceof Error
            ? fetchErr.message
            : "Unexpected error while fetching suggestions.";
        setState({ status: "error", message });
      }
    })();

    // Return cleanup so React can abort the fetch if the component unmounts
    return () => controller.abort();
  }, []);

  return { state, refresh };
}
