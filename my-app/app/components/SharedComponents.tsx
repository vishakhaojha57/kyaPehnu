import React, { CSSProperties } from "react";
import type { HealthResponse } from "../../lib/types";

// ── Category colour map ──────────────────────────────────────────────────────
export const CATEGORY_COLORS: Record<string, string> = {
  top: "#a78bfa",
  bottom: "#60a5fa",
  footwear: "#34d399",
  accessory: "#fbbf24",
  outfit: "#f472b6",
  traditional: "#ec4899",
  western: "#c026d3",
};

// ── Occasion badge colours ───────────────────────────────────────────────────
export const OCCASION_COLORS: Record<string, { bg: string; text: string }> = {
  casual: { bg: "rgba(52, 211, 153, 0.15)", text: "#34d399" },
  formal: { bg: "rgba(167, 139, 250, 0.15)", text: "#a78bfa" },
  party: { bg: "rgba(251, 191, 36, 0.15)", text: "#fbbf24" },
  sport: { bg: "rgba(96, 165, 250, 0.15)", text: "#60a5fa" },
};

// ── Season chip colour palette ────────────────────────────────────────────────
// Light blue-green tint for Season (left chip)
export const SEASON_CHIP_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "3px 10px",
  borderRadius: 99,
  fontSize: "0.68rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "capitalize",
  background: "rgba(52, 211, 153, 0.10)",
  border: "1px solid rgba(52, 211, 153, 0.30)",
  color: "#6ee7b7",
};

// Purple-orange tint for Occasion (right chip)
export const OCCASION_CHIP_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  casual: { bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.30)", text: "#c4b5fd" },
  formal: { bg: "rgba(96,165,250,0.10)", border: "rgba(96,165,250,0.30)", text: "#93c5fd" },
  party: { bg: "rgba(251,146,60,0.10)", border: "rgba(251,146,60,0.30)", text: "#fdba74" },
  festive: { bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.30)", text: "#fcd34d" },
  sport: { bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.30)", text: "#6ee7b7" },
  default: { bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.30)", text: "#c4b5fd" },
};


// ── Helper: Human-readable Color Names ─────────────────────────────────────────
export function getNearestColorName(hex: string): string {
  if (!hex || !hex.startsWith("#")) return hex;
  const colors = [
    { name: "Black", hex: "#000000" }, { name: "White", hex: "#ffffff" },
    { name: "Navy", hex: "#000080" }, { name: "Blue", hex: "#0000ff" },
    { name: "Red", hex: "#ff0000" }, { name: "Green", hex: "#008000" },
    { name: "Yellow", hex: "#ffff00" }, { name: "Grey", hex: "#808080" },
    { name: "Brown", hex: "#a52a2a" }, { name: "Pink", hex: "#ffc0cb" },
    { name: "Orange", hex: "#ffa500" }, { name: "Purple", hex: "#800080" },
    { name: "Beige", hex: "#f5f5dc" }, { name: "Maroon", hex: "#800000" },
    { name: "Olive", hex: "#808000" }, { name: "Teal", hex: "#008080" },
    { name: "Silver", hex: "#c0c0c0" }, { name: "Gold", hex: "#ffd700" }
  ];

  const hexToRgb = (h: string) => {
    let c = h.substring(1);
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    return [parseInt(c.substring(0, 2), 16), parseInt(c.substring(2, 4), 16), parseInt(c.substring(4, 6), 16)];
  };

  try {
    const [r, g, b] = hexToRgb(hex);
    let minD = Infinity, closest = "Color";
    for (const c of colors) {
      const [cr, cg, cb] = hexToRgb(c.hex);
      const d = Math.pow(r - cr, 2) + Math.pow(g - cg, 2) + Math.pow(b - cb, 2);
      if (d < minD) { minD = d; closest = c.name; }
    }
    return closest;
  } catch (e) { return hex; }
}

// ── Helper: colour dot ───────────────────────────────────────────────────────
export function ColorDot({ color }: { color: string }) {
  return (
    <span
      title={color}
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        backgroundColor: color,
        border: "1px solid rgba(255,255,255,0.2)",
        flexShrink: 0,
      }}
    />
  );
}

// ── Skeleton block ───────────────────────────────────────────────────────────
export function Skeleton({ h = 16, w = "100%" }: { h?: number; w?: string }) {
  return (
    <div className="skeleton" style={{ height: h, width: w, borderRadius: 8 }} />
  );
}


// ── Health Status Pill ───────────────────────────────────────────────────────
export function HealthPill({ health }: { health: HealthResponse | null; error?: boolean }) {
  if (!health) return null;
  return (
    <div className="badge-cyan">
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "var(--cyan)",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      FastAPI · {health.status} · v{health.version} · {health.mode}
    </div>
  );
}


// ── Location Permission Toast ─────────────────────────────────────────────────
// Shows once per session. Dismissed state stored in sessionStorage only.
export function LocationToast({ onAllow, onDismiss }: { onAllow: () => void; onDismiss: () => void }) {
  return (
    <div
      id="location-toast"
      style={{
        position: "fixed", bottom: 28, left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60, width: "min(480px, calc(100vw - 32px))",
        background: "rgba(14,14,18,0.92)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(0,245,255,0.20)",
        borderRadius: 18,
        boxShadow: "0 0 40px rgba(0,245,255,0.08), 0 8px 32px rgba(0,0,0,0.5)",
        padding: "18px 20px",
        display: "flex", alignItems: "flex-start", gap: 14,
        animation: "fadeInUp 0.35s ease both",
      }}
    >
      <span style={{ fontSize: "1.6rem", flexShrink: 0, marginTop: 2 }}>📍</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: "0 0 3px", fontWeight: 700, fontSize: "0.88rem" }}>
          kyaPehnu wants your location
        </p>
        <p style={{ margin: "0 0 14px", fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
          Allow access to sync your city&apos;s live weather context for smarter outfit suggestions.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            id="location-allow"
            onClick={onAllow}
            style={{
              padding: "7px 18px", borderRadius: 99, border: "none",
              background: "var(--cyan)", color: "#06060a",
              fontSize: "0.78rem", fontWeight: 700, cursor: "pointer",
              boxShadow: "0 0 14px rgba(0,245,255,0.30)",
            }}
          >
            Allow
          </button>
          <button
            id="location-dismiss"
            onClick={onDismiss}
            style={{
              padding: "7px 18px", borderRadius: 99,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--text-muted)", fontSize: "0.78rem",
              fontWeight: 600, cursor: "pointer",
            }}
          >
            Not now
          </button>
        </div>
      </div>
      <button
        onClick={onDismiss}
        style={{
          background: "none", border: "none", color: "var(--text-muted)",
          cursor: "pointer", fontSize: "1rem", flexShrink: 0, padding: 0
        }}
      >×</button>
    </div>
  );
}
