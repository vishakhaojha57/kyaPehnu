/**
 * useVisionCapture – Zero-Friction In-Memory Binary Capturing
 * ─────────────────────────────────────────────────────────────────────────────
 * Captures a single frame from a live MediaStream by routing pixels through an
 * off-screen OffscreenCanvas (or HTMLCanvasElement fallback).
 *
 * Pipeline:
 *   HTMLVideoElement → OffscreenCanvas.drawImage → canvas.convertToBlob (Blob)
 *   → FormData (multipart binary) → fetch POST /api/vision/capture
 *
 * Zero disk writes — the Blob lives entirely in the JS heap and is consumed
 * immediately by the FormData multipart pipe. No temp files are created in
 * the Next.js build directory or anywhere else on disk.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE CONSTRAINTS (strictly enforced):
 *
 * 1. No Inline CSS Matrix Overrides
 *    Camera alignment (mirror, scale, rotate) is applied exclusively through
 *    canvas 2D context transform primitives — ctx.translate() and ctx.scale()
 *    — inside the capture block. No CSS transform strings, no style.transform,
 *    no matrix() values are written to any DOM element at any point.
 *
 * 2. Keep Memory Offscreen State Isolated
 *    Each call to frameToBlob() allocates a fresh OffscreenCanvas (or a fresh
 *    detached HTMLCanvasElement) and a brand-new 2D context. These objects are
 *    local to a single invocation; no canvas, context, or ImageData reference
 *    escapes the function or is stored in a ref/module-level variable. The JS
 *    heap reclaims the buffers as soon as convertToBlob()/toBlob() resolves.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use client";

import { useCallback, useState } from "react";
import type { VisionResult, VisionResultV3 } from "./types";
import { isGarmentNotFound } from "./types";

export type CaptureState =
  | { phase: "idle" }
  | { phase: "capturing" }
  | { phase: "uploading" }
  | { phase: "done"; result: VisionResult }
  | { phase: "error"; message: string };

// ── V3 state types (Tri-Tier Validation Matrix result) ────────────────────────
export type CaptureStateV3 =
  | { phase: "idle" }
  | { phase: "capturing" }
  | { phase: "uploading" }
  | { phase: "done"; result: VisionResultV3 }
  | { phase: "no_garment" }              // Dual-Layer Guard fired — no clothing found
  | { phase: "error"; message: string };

export interface VisionCaptureHandleV3 {
  state:    CaptureStateV3;
  snapshot: (videoEl: HTMLVideoElement) => Promise<void>;
  reset:    () => void;
}

export interface VisionCaptureHandle {
  state:    CaptureState;
  snapshot: (videoEl: HTMLVideoElement) => Promise<void>;
  reset:    () => void;
}

// ── Alignment parameters ──────────────────────────────────────────────────────
// These values are consumed exclusively by ctx.translate / ctx.scale within the
// canvas capture block.  They must NEVER be applied as CSS transform strings.

interface CaptureAlignment {
  /**
   * Horizontal mirror: true when using the front-facing camera so the captured
   * frame matches the natural orientation of the garment (not a selfie-mirror).
   * Applied via ctx.translate(w, 0) + ctx.scale(-1, 1) — no CSS involved.
   */
  mirrorX: boolean;

  /**
   * Uniform scale factor applied to the draw operation before committing pixels.
   * Default 1.0 (no scaling). Values < 1 downsample; > 1 upsample.
   * Applied via ctx.scale(factor, factor) AFTER the mirror transform.
   */
  scaleFactor: number;
}

// Default alignment — no mirror, no scale offset (rear-cam, natural orientation)
const DEFAULT_ALIGNMENT: CaptureAlignment = {
  mirrorX:     false,
  scaleFactor: 1.0,
};

// ── Canvas-based binary capture ───────────────────────────────────────────────

/**
 * Slices the current video frame into a Blob via an **isolated** off-screen
 * canvas context.  The canvas and its context are freshly allocated on every
 * call; they are never shared, cached, or stored outside this function.
 *
 * Camera alignment transforms (mirror / scale) are applied through
 * ctx.translate() and ctx.scale() — never through inline CSS matrix values.
 *
 * @param videoEl   The live <video> element to read pixels from.
 * @param alignment Coordinate-space transforms to apply inside the ctx layer.
 * @param mimeType  Output format for the Blob.
 * @param quality   Encode quality [0–1].
 */
async function frameToBlob(
  videoEl:   HTMLVideoElement,
  alignment: CaptureAlignment = DEFAULT_ALIGNMENT,
  mimeType:  "image/webp" | "image/jpeg" = "image/webp",
  quality    = 0.88,
): Promise<Blob> {
  const { videoWidth: w, videoHeight: h } = videoEl;
  if (!w || !h) throw new Error("Video element has no dimensions yet.");

  // ── Apply alignment transforms in ctx space (never CSS) ───────────────────
  //
  //   Step A — Translate origin to right edge if mirroring horizontally.
  //            ctx.translate(w, 0) shifts the coordinate origin so that
  //            the subsequent scale(-1, 1) reflects around the canvas center.
  //
  //   Step B — Apply scale transforms.
  //            ctx.scale(-1, 1) flips X axis (mirror).
  //            ctx.scale(sf, sf) applies the uniform scale factor.
  //            Both are composed in a single ctx.scale() call below.
  //
  //   Step C — Draw the video frame into the transformed coordinate space.
  //            drawImage renders into the already-transformed context, so
  //            no pixel mutation is needed after the draw.
  //
  // This is the ONLY place transforms are applied.  No element.style.transform,
  // no CSS matrix(), no inline style string is written anywhere.

  const applyContextTransforms = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void => {
    // Reset to identity before composing — ensures each call starts clean
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const { mirrorX, scaleFactor } = alignment;

    if (mirrorX) {
      // Translate origin to the right edge, then flip X axis
      ctx.translate(w, 0);
      ctx.scale(-1 * scaleFactor, scaleFactor);
    } else if (scaleFactor !== 1.0) {
      ctx.scale(scaleFactor, scaleFactor);
    }
    // If neither transform is needed the identity matrix from setTransform() holds
  };

  // Prefer OffscreenCanvas (no DOM attachment, fully isolated heap buffer)
  // Each branch allocates a brand-new canvas + context — never reused.
  let blob: Blob | null;

  if (typeof OffscreenCanvas !== "undefined") {
    // ── Isolated OffscreenCanvas block ────────────────────────────────────
    // This canvas lives entirely off-screen in a separate memory allocation.
    // It is not attached to the document and cannot affect layout.
    const osc = new OffscreenCanvas(w, h);
    const ctx  = osc.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable.");

    // Apply ctx-layer alignment transforms (Step A–B)
    applyContextTransforms(ctx);

    // Draw video pixels into the transformed coordinate space (Step C)
    ctx.drawImage(videoEl, 0, 0, w, h);

    // Encode and flush — osc and ctx go out of scope after this line
    blob = await osc.convertToBlob({ type: mimeType, quality });

  } else {
    // ── Isolated HTMLCanvasElement fallback ───────────────────────────────
    // createElement("canvas") creates a detached node — it is NOT appended to
    // the document, so it has zero layout / paint footprint.
    // The reference is kept strictly local and released when this block exits.
    const canvas   = document.createElement("canvas");
    canvas.width   = w;
    canvas.height  = h;
    // canvas is intentionally NOT appended to document.body or any container

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");

    // Apply ctx-layer alignment transforms (Step A–B)
    applyContextTransforms(ctx);

    // Draw video pixels into the transformed coordinate space (Step C)
    ctx.drawImage(videoEl, 0, 0, w, h);

    // Encode asynchronously; canvas goes out of scope after the Promise resolves
    blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, mimeType, quality)
    );
  }

  if (!blob) throw new Error("Frame-to-Blob conversion returned null.");
  return blob;
}

// ── FormData binary POST ──────────────────────────────────────────────────────

/**
 * Wraps the raw Blob in a multipart FormData segment and POSTs it to the
 * Next.js API route, which proxies to the FastAPI vision endpoint.
 * The binary buffer is NEVER written to disk — it passes from heap → wire.
 */
async function postBlobToVision(blob: Blob): Promise<VisionResult> {
  const form = new FormData();
  // Field name matches the FastAPI UploadFile parameter "file"
  form.append("file", blob, `capture-${Date.now()}.webp`);

  const res = await fetch("/api/vision/capture", {
    method: "POST",
    body:   form,
    // Do NOT set Content-Type — browser inserts the multipart boundary automatically
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[${res.status}] Vision API error: ${text}`);
  }

  return res.json() as Promise<VisionResult>;
}

/**
 * Posts a raw Blob to the V3 proxy route (/api/vision/capture/v3).
 * Returns a VisionResultV3 with the 4-field Tri-Tier contract.
 * Binary buffer passes from JS heap → wire without touching disk.
 */
async function postBlobToVisionV3(blob: Blob): Promise<VisionResultV3 | { status: "no_garment"; message: string }> {
  const form = new FormData();
  form.append("file", blob, `capture-${Date.now()}.webp`);

  // ── Calls the real FastAPI backend directly (no Next.js proxy needed) ──
  const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const res = await fetch(`${BASE_URL}/vision/analyze`, {
    method: "POST",
    body:   form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[${res.status}] V3 Vision API error: ${text}`);
  }

  const json = await res.json();

  // Check gateway rejection (no_cloth_found)
  if (json.status === "error" || json.message === "no_cloth_found") {
    return { status: "no_garment", message: json.message };
  }

  // Map first detected item from V2 contract → VisionResultV3 shape for display
  const items = json.detected_items || [];
  if (!items.length) {
    return { status: "no_garment", message: "no_cloth_found" };
  }

  const first = items[0];

  // Extract dominant color from item name (e.g. "Blue Blouse" → #3b82f6)
  const COLOR_MAP: Record<string, string> = {
    red: "#ef4444", blue: "#3b82f6", green: "#22c55e", yellow: "#eab308",
    orange: "#f97316", purple: "#a855f7", pink: "#ec4899", white: "#f5f5f5",
    black: "#1a1a1a", grey: "#6b7280", gray: "#6b7280", brown: "#92400e",
    navy: "#1e3a5f", teal: "#14b8a6", maroon: "#7f1d1d", beige: "#d4c4a0",
    cream: "#fef3c7", olive: "#65a30d", cyan: "#06b6d4", violet: "#7c3aed",
  };
  const nameLower = (first.name || "").toLowerCase();
  const matchedColor = Object.entries(COLOR_MAP).find(([key]) => nameLower.includes(key));
  const hex_color = matchedColor ? matchedColor[1] : "#6b7280";

  return {
    clothing_type: first.category?.toLowerCase() || "top",
    sub_category: first.sub_type || "",
    specific_type: first.name || "",
    hex_color,
  } as VisionResultV3;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVisionCapture(
  alignment: CaptureAlignment = DEFAULT_ALIGNMENT,
): VisionCaptureHandle {
  const [state, setState] = useState<CaptureState>({ phase: "idle" });

  const snapshot = useCallback(async (videoEl: HTMLVideoElement) => {
    setState({ phase: "capturing" });
    try {
      // Step 1 — Isolated off-screen pixel slice → in-memory Blob
      //          Alignment applied via ctx.translate / ctx.scale (not CSS)
      const blob = await frameToBlob(videoEl, alignment);

      // Step 2 — Binary FormData multipart POST (heap → wire, no disk writes)
      setState({ phase: "uploading" });
      const result = await postBlobToVision(blob);

      setState({ phase: "done", result });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Capture pipeline failed.";
      setState({ phase: "error", message });
    }
  // alignment is a stable object passed from the component; including it here
  // is correct — callers should memoize if they construct it inline.
  }, [alignment]);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, snapshot, reset };
}

// ── V3 Hook — Tri-Tier Validation Matrix ──────────────────────────────────────

/**
 * useVisionCaptureV3 — Isolated V3 capture hook.
 *
 * Identical pipeline to useVisionCapture but POSTs to /api/vision/capture/v3
 * and resolves a VisionResultV3 state (clothing_type + sub_category +
 * specific_type + hex_color).
 *
 * Anti-Gravity: fully isolated from useVisionCapture — no shared state,
 * no module-level variables, no parallel heap blocks.
 */
export function useVisionCaptureV3(
  alignment: CaptureAlignment = DEFAULT_ALIGNMENT,
): VisionCaptureHandleV3 {
  const [state, setState] = useState<CaptureStateV3>({ phase: "idle" });

  const snapshot = useCallback(async (videoEl: HTMLVideoElement) => {
    setState({ phase: "capturing" });
    try {
      const blob = await frameToBlob(videoEl, alignment);
      setState({ phase: "uploading" });
      const raw = await postBlobToVisionV3(blob);

      // Dual-Layer Guard sentinel — no clothing in frame
      // Short-circuit here: phase set to "no_garment", no DB path reached.
      if (isGarmentNotFound(raw)) {
        setState({ phase: "no_garment" });
        return;
      }

      setState({ phase: "done", result: raw as VisionResultV3 });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "V3 Capture pipeline failed.";
      setState({ phase: "error", message });
    }
  }, [alignment]);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, snapshot, reset };
}
