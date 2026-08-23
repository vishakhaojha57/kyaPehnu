/**
 * CameraLens – Live Camera Capture Component
 * ─────────────────────────────────────────────────────────────────────────────
 * Wires useLensStream (hardware-stream separation) and useVisionCapture
 * (in-memory binary) together into a single capture viewport.
 *
 * Constraints:
 *  • getUserMedia called ONLY from this client component — never from a server
 *    component, API route, or external state module.
 *  • MediaStream ref lives entirely in useLensStream's ref — not in React state.
 *  • Frame Blob is created and consumed without touching the disk.
 *
 * Anti-Gravity Rules (enforced below):
 *  1. No Inline CSS Matrix Overrides — camera alignment (mirror / scale) is
 *     expressed through the CaptureAlignment object passed to useVisionCapture.
 *     The hook applies transforms exclusively via ctx.translate / ctx.scale
 *     inside the canvas capture block.  NO style.transform, CSS matrix(), or
 *     transform string is written to the <video> or any wrapper element.
 *
 *  2. Keep Memory Offscreen State Isolated — each capture allocates a fresh
 *     OffscreenCanvas (or detached HTMLCanvasElement) scoped to one invocation.
 *     No canvas or context reference is held across calls; the JS heap reclaims
 *     the buffer as soon as convertToBlob / toBlob resolves.
 */

"use client";

import { useEffect, useMemo, useRef } from "react";
import { Camera, Sparkles, Loader2, X } from "lucide-react";
import { useLensStream } from "@/lib/useLensStream";
import { useVisionCaptureV3 } from "@/lib/useVisionCapture";
import type { VisionResultV3 } from "@/lib/types";

const CATEGORY_ICONS: Record<string, string> = {
  top:       "👕",
  bottom:    "👖",
  footwear:  "👟",
  accessory: "⌚",
  // Title-cased aliases (V2/V3 contract)
  Top:       "👕",
  Bottom:    "👖",
  Footwear:  "👟",
  Accessory: "⌚",
};

interface CameraLensProps {
  onResult?: (result: VisionResultV3) => void;
}

export default function CameraLens({ onResult }: CameraLensProps) {
  const lens = useLensStream();

  // ── Stable alignment object (Rule 1: transforms live in ctx, not CSS) ─────
  // mirrorX: false — rear-facing camera captures natural orientation.
  // scaleFactor: 1.0 — no resampling; full native resolution is preserved.
  // Memoised so the reference is stable across re-renders; useVisionCapture
  // uses it as a useCallback dependency and must not rebuild on every render.
  const alignment = useMemo(
    () => ({ mirrorX: false, scaleFactor: 1.0 }),
    [],
  );

  const capture = useVisionCaptureV3(alignment);

  // Attach the stream to <video> once both the element and stream are ready
  const videoCallbackRef = (el: HTMLVideoElement | null) => {
    // Keep the ref in sync
    // eslint-disable-next-line react-hooks/immutability
    (lens.videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
    if (el && lens.streamRef.current) {
      el.srcObject = lens.streamRef.current;
    }
  };

  // Notify parent whenever a result is ready
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (capture.state.phase === "done") {
      onResultRef.current?.(capture.state.result);
    }
  }, [capture.state]);

  const handleCapture = () => {
    const videoEl = lens.videoRef.current;
    if (!videoEl || !lens.active) return;
    capture.snapshot(videoEl);
  };

  const isCapturing =
    capture.state.phase === "capturing" || capture.state.phase === "uploading";

  return (
    <div
      id="camera-lens-root"
      style={{
        maxWidth: 600,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* ── Viewport — neon-cyan glow ring wraps the live feed ────────────── */}
      {/* camera-glow-ring: cyan-ring-pulse keyframe from globals.css         */}
      {/* Activates only when lens.active — never fires hardware prematurely  */}
      {/* ── Cinematic gradient-border viewport wrapper ─────────────────── */}
      <div
        style={{
          padding: 2,
          borderRadius: 22,
          background: lens.active
            ? "linear-gradient(135deg, rgba(0,245,255,0.6) 0%, rgba(167,139,250,0.6) 50%, rgba(96,165,250,0.6) 100%)"
            : "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)",
          boxShadow: lens.active
            ? "0 0 40px rgba(0,245,255,0.15), 0 0 80px rgba(167,139,250,0.08)"
            : "none",
          transition: "background 0.5s ease, box-shadow 0.5s ease",
        }}
      >
      <div
        style={{
          position: "relative",
          borderRadius: 20,
          overflow: "hidden",
          background: "#06060a",
          aspectRatio: "16/9",
        }}
      >
        {/* Live video feed
             ─────────────────────────────────────────────────────────────────
             Rule 1 – No Inline CSS Matrix Overrides:
             This element carries NO transform, scale, or matrix CSS property.
             Camera alignment (mirror / scale) is handled exclusively in the
             OffscreenCanvas ctx.translate / ctx.scale layer inside
             useVisionCapture → frameToBlob.  Adding style.transform here is
             prohibited per the Anti-Gravity Camera Alignment rules.
             ───────────────────────────────────────────────────────────────── */}
        <video
          ref={videoCallbackRef}
          id="camera-lens-video"
          autoPlay
          playsInline
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: lens.active ? "block" : "none",
            // transform is intentionally absent — alignment is applied in
            // canvas ctx space, not on the DOM element (Anti-Gravity Rule 1)
          }}
        />

        {/* ── Premium idle screen ───────────────────────────────────────── */}
        {!lens.active && !lens.error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              background: "radial-gradient(ellipse at 50% 60%, rgba(0,245,255,0.04) 0%, transparent 70%)",
            }}
          >
            {/* Pulse rings */}
            <div style={{ position: "relative", width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{
                position: "absolute", inset: -16,
                borderRadius: "50%",
                border: "1px solid rgba(0,245,255,0.15)",
                animation: "pulse 2.4s ease-in-out infinite",
              }} />
              <div style={{
                position: "absolute", inset: -6,
                borderRadius: "50%",
                border: "1px solid rgba(0,245,255,0.25)",
                animation: "pulse 2.4s ease-in-out infinite 0.4s",
              }} />
              <div style={{
                width: 60, height: 60, borderRadius: "50%",
                background: "rgba(0,245,255,0.06)",
                border: "1px solid rgba(0,245,255,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.6rem",
              }}>📷</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                Live Lens
              </p>
              <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "var(--text-muted)", opacity: 0.7 }}>
                Tap Open Camera to start scanning
              </p>
            </div>
          </div>
        )}

        {/* ── Shot-guide alignment frame when live ─────────────────────── */}
        {lens.active && !isCapturing && (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}>
            <div style={{
              position: "relative",
              width: "60%",
              height: "80%",
              borderRadius: 24, // rounded-2xl
              background: "rgba(9, 9, 11, 0.2)", // bg-zinc-950/20
              backdropFilter: "blur(2px)",
              WebkitBackdropFilter: "blur(2px)",
              border: "1px solid rgba(255,255,255,0.2)",
              boxShadow: "inset 0 0 32px rgba(0,0,0,0.5)",
            }}>
              {/* ── Corner Brackets ── */}
              <div style={{ position: "absolute", top: 16, left: 16, width: 20, height: 20, borderTop: "2px solid rgba(255,255,255,0.7)", borderLeft: "2px solid rgba(255,255,255,0.7)", borderRadius: "4px 0 0 0" }} />
              <div style={{ position: "absolute", top: 16, right: 16, width: 20, height: 20, borderTop: "2px solid rgba(255,255,255,0.7)", borderRight: "2px solid rgba(255,255,255,0.7)", borderRadius: "0 4px 0 0" }} />
              <div style={{ position: "absolute", bottom: 16, left: 16, width: 20, height: 20, borderBottom: "2px solid rgba(255,255,255,0.7)", borderLeft: "2px solid rgba(255,255,255,0.7)", borderRadius: "0 0 0 4px" }} />
              <div style={{ position: "absolute", bottom: 16, right: 16, width: 20, height: 20, borderBottom: "2px solid rgba(255,255,255,0.7)", borderRight: "2px solid rgba(255,255,255,0.7)", borderRadius: "0 0 4px 0" }} />

              {/* ── Text Tag ── */}
              <div style={{
                position: "absolute",
                top: -10,
                left: "50%",
                transform: "translateX(-50%)",
                background: "var(--bg-surface)",
                padding: "0 12px",
                fontSize: "0.6rem",
                fontWeight: 700,
                letterSpacing: "0.2em",
                color: "rgba(255,255,255,0.6)",
                textTransform: "uppercase",
                borderRadius: 99,
                border: "1px solid rgba(255,255,255,0.1)",
              }}>
                AI Scanning Zone
              </div>
            </div>
          </div>
        )}

        {/* Scanning overlay while capturing */}
        {isCapturing && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(167,139,250,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(1px)",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <ScanRing />
              <p
                style={{
                  color: "var(--accent)",
                  fontSize: "0.82rem",
                  marginTop: 12,
                  fontWeight: 600,
                }}
              >
                {capture.state.phase === "capturing"
                  ? "Slicing frame…"
                  : "Analysing with ViT…"}
              </p>
            </div>
          </div>
        )}

        {/* Live indicator */}
        {lens.active && !isCapturing && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(0,0,0,0.55)",
              borderRadius: 99,
              padding: "4px 10px",
              backdropFilter: "blur(8px)",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#f87171",
                display: "inline-block",
                animation: "pulse 1.4s infinite",
              }}
            />
            <span
              style={{
                fontSize: "0.66rem",
                fontWeight: 700,
                color: "#fff",
                letterSpacing: "0.06em",
              }}
            >
              LIVE
            </span>
          </div>
        )}
      </div>
      </div> {/* gradient border wrapper */}

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "center",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {!lens.active ? (
          <button
            id="camera-lens-start"
            onClick={lens.start}
            className="inline-flex items-center gap-2.5 px-8 py-3 rounded-full font-bold text-[0.92rem] tracking-[0.01em] bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm transition-all hover:scale-[1.02] cursor-pointer border-none"
          >
            <Camera size={18} strokeWidth={2.5} />
            Open Camera
          </button>
        ) : (
          <>
            {/* Main capture CTA — large, pulsing when idle */}
            <button
              id="camera-lens-capture"
              onClick={handleCapture}
              disabled={isCapturing}
              className={`inline-flex items-center justify-center gap-2.5 px-9 py-3 rounded-full font-bold text-[0.92rem] transition-all min-w-[180px] border-none ${
                isCapturing
                  ? "bg-zinc-800 text-zinc-400 cursor-not-allowed"
                  : "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm cursor-pointer hover:scale-[1.02]"
              }`}
              style={{ animation: isCapturing ? "none" : "pulse 2s ease-in-out infinite" }}
            >
              {isCapturing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Analysing…
                </>
              ) : (
                <>
                  <Sparkles size={18} strokeWidth={2.5} />
                  Capture & Scan
                </>
              )}
            </button>
            <button
              id="camera-lens-stop"
              onClick={() => { lens.stop(); capture.reset(); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-[0.82rem] bg-red-500/10 text-red-500 border border-red-500/30 transition-all hover:bg-red-500/20 cursor-pointer"
            >
              <X size={16} strokeWidth={2.5} />
              Stop
            </button>
          </>
        )}
      </div>

      {/* ── Error states ──────────────────────────────────────────────────── */}
      {lens.error && (
        <div
          id="camera-lens-error"
          style={{
            background: "rgba(248,113,113,0.10)",
            border: "1px solid rgba(248,113,113,0.38)",
            borderRadius: 12,
            padding: "14px 18px",
            color: "#f87171",
            fontSize: "0.84rem",
          }}
        >
          ⚠️ {lens.error}
        </div>
      )}

      {capture.state.phase === "error" && (
        <div
          id="camera-capture-error"
          style={{
            background: "rgba(248,113,113,0.10)",
            border: "1px solid rgba(248,113,113,0.38)",
            borderRadius: 12,
            padding: "14px 18px",
            color: "#f87171",
            fontSize: "0.84rem",
          }}
        >
          ⚠️ {capture.state.message}
          <button
            onClick={capture.reset}
            style={{
              marginLeft: 12,
              fontSize: "0.78rem",
              color: "#f87171",
              textDecoration: "underline",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Garment-Not-Found glassmorphic flash panel ──────────────────── */}
      {/* Fires when Dual-Layer Validation Guard detects no clothing in frame. */}
      {/* Server returned HTTP 200 { status: "no_garment" } — no DB write made. */}
      {capture.state.phase === "no_garment" && (
        <div
          id="camera-garment-not-found"
          style={{
            position: "relative",
            borderRadius: 20,
            overflow: "hidden",
            background: "rgba(15, 10, 30, 0.72)",
            border: "1px solid rgba(251,191,36,0.35)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            padding: "32px 28px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
            boxShadow:
              "0 0 0 1px rgba(251,191,36,0.12), 0 8px 40px rgba(251,191,36,0.08)",
            animation: "fadeSlideUp 0.35s ease both",
          }}
        >
          {/* Ambient glow ring behind the icon */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: -40,
              left: "50%",
              transform: "translateX(-50%)",
              width: 140,
              height: 140,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(251,191,36,0.18) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          {/* Warning icon — pulsing amber */}
          <span
            style={{
              fontSize: "2.8rem",
              lineHeight: 1,
              animation: "pulse 1.8s ease-in-out infinite",
              filter: "drop-shadow(0 0 12px rgba(251,191,36,0.55))",
              zIndex: 1,
            }}
          >
            🪡
          </span>

          {/* Headline */}
          <p
            style={{
              margin: 0,
              fontWeight: 800,
              fontSize: "1.08rem",
              color: "#fbbf24",
              letterSpacing: "0.01em",
              textAlign: "center",
              zIndex: 1,
            }}
          >
            Clothe Not Found
          </p>

          {/* Body copy */}
          <p
            style={{
              margin: 0,
              fontSize: "0.82rem",
              color: "rgba(251,191,36,0.75)",
              textAlign: "center",
              maxWidth: 300,
              lineHeight: 1.55,
              zIndex: 1,
            }}
          >
            Please capture your garment cleanly — point the camera at a
            clothing item with a clear background.
          </p>

          {/* Diagnostic badge */}
          <span
            id="camera-no-garment-badge"
            style={{
              fontSize: "0.66rem",
              fontFamily: "monospace",
              letterSpacing: "0.06em",
              color: "rgba(251,191,36,0.45)",
              background: "rgba(251,191,36,0.06)",
              border: "1px solid rgba(251,191,36,0.18)",
              borderRadius: 99,
              padding: "3px 10px",
              zIndex: 1,
            }}
          >
            Layer-1 suppression · Layer-2 signal guard · HTTP 200
          </span>

          {/* Try Again CTA */}
          <button
            id="camera-no-garment-retry"
            onClick={capture.reset}
            style={{
              marginTop: 6,
              padding: "9px 28px",
              borderRadius: 99,
              border: "1px solid rgba(251,191,36,0.45)",
              background: "rgba(251,191,36,0.10)",
              color: "#fbbf24",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.04em",
              transition: "background 0.2s, box-shadow 0.2s",
              zIndex: 1,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(251,191,36,0.22)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                "0 0 18px rgba(251,191,36,0.30)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(251,191,36,0.10)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
            }}
          >
            ↺ Try Again
          </button>
        </div>
      )}

      {/* ── Vision result card (Tri-Tier display) ───────────────────────── */}

      {capture.state.phase === "done" && (
        <div
          id="camera-vision-result"
          className="card"
          style={{
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Tier 1/2 — Core Category */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.4rem" }}>
              {CATEGORY_ICONS[capture.state.result.clothing_type] ?? "👗"}
            </span>
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                }}
              >
                Tier 1/2 — Category
              </p>
              <p
                style={{
                  margin: 0,
                  fontWeight: 700,
                  fontSize: "1.1rem",
                  textTransform: "capitalize",
                }}
              >
                {capture.state.result.clothing_type}
              </p>
            </div>
          </div>

          {/* Tier 2 — Sub-Category tag */}
          {capture.state.result.sub_category && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: "0.68rem",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  flexShrink: 0,
                  minWidth: 90,
                }}
              >
                Tier 2 — Sub-type
              </span>
              <span
                id="camera-sub-category-tag"
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 99,
                  background: "rgba(0,245,255,0.08)",
                  border: "1px solid rgba(0,245,255,0.30)",
                  color: "var(--cyan)",
                  letterSpacing: "0.03em",
                  textTransform: "capitalize",
                }}
              >
                {capture.state.result.sub_category.replace(/-/g, " ")}
              </span>
            </div>
          )}

          {/* Tier 3 — Granular Fabric / Silhouette tag */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: "0.68rem",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                flexShrink: 0,
                minWidth: 90,
              }}
            >
              Tier 3 — Specific
            </span>
            <span
              id="camera-specific-type-tag"
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 99,
                background: capture.state.result.specific_type
                  ? "rgba(167,139,250,0.10)"
                  : "rgba(255,255,255,0.04)",
                border: capture.state.result.specific_type
                  ? "1px solid rgba(167,139,250,0.35)"
                  : "1px solid var(--border)",
                color: capture.state.result.specific_type
                  ? "var(--accent)"
                  : "var(--text-muted)",
                letterSpacing: "0.03em",
                textTransform: "capitalize",
              }}
            >
              {capture.state.result.specific_type
                ? capture.state.result.specific_type.replace(/_/g, " ")
                : "general"}
            </span>
          </div>

          {/* ── Glass Card Panel for Dominant Colour ── */}
          <div className="bg-zinc-950/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-inner">
            <div className="flex flex-col gap-1">
              <span className="text-[0.68rem] text-zinc-400 uppercase tracking-[0.08em] font-semibold">
                Dominant Colour
              </span>
              <span className="text-sm font-medium text-white/90">
                AI Extracted Shade
              </span>
            </div>
            
            {/* Interactive Subtle Ring Selection Frame */}
            <div className="relative flex items-center justify-center w-14 h-14 rounded-full border border-white/10 bg-black/40 shadow-inner group">
              {/* Outer dynamic dashed ring */}
              <div 
                className="absolute inset-0 rounded-full border border-dashed opacity-40 transition-all duration-500 group-hover:rotate-45 group-hover:opacity-80" 
                style={{ borderColor: capture.state.result.hex_color }} 
              />
              {/* Inner glow pulse */}
              <div 
                className="absolute w-8 h-8 rounded-full opacity-40 animate-pulse"
                style={{ backgroundColor: capture.state.result.hex_color, filter: "blur(4px)" }}
              />
              {/* Core colour node */}
              <div
                className="relative w-8 h-8 rounded-full shadow-inner transition-transform duration-300 group-hover:scale-110 cursor-pointer border border-white/20"
                style={{ backgroundColor: capture.state.result.hex_color }}
                title={capture.state.result.hex_color}
              />
            </div>
          </div>

          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              borderTop: "1px solid var(--border)",
              paddingTop: 14,
              fontStyle: "italic",
            }}
          >
            Tri-Tier · OffscreenCanvas → FormData →{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              YOLOv8 → ViT-Base → Tier-3 Taxonomy
            </strong>{" "}
            · No disk writes
          </p>

          <button
            id="camera-capture-again"
            onClick={capture.reset}
            style={{
              alignSelf: "center",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 99,
              padding: "6px 18px",
              color: "var(--text-muted)",
              fontSize: "0.78rem",
              cursor: "pointer",
            }}
          >
            ↺ Capture another frame
          </button>
        </div>
      )}
    </div>
  );
}


// ── Sub-components ────────────────────────────────────────────────────────────

// ── ScanRing ──────────────────────────────────────────────────────────────────
// @keyframes spin and @keyframes pulse are defined in app/globals.css.
// Inline <style> blocks inside components are prohibited here because:
//  a) they bypass the CSS cascade and can silently override global keyframes.
//  b) each render creates a new <style> node — memory and selector bloat.
// The animation name strings below reference the global keyframes directly.
function ScanRing() {
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: "50%",
        border: "3px solid var(--border)",
        borderTopColor: "var(--accent)",
        // "spin" and "pulse" keyframes are declared in globals.css — not inline
        animation: "spin 0.75s linear infinite",
        margin: "0 auto",
      }}
    />
  );
}
