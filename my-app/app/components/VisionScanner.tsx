import React, { Suspense, lazy } from "react";

// Lazy load heavy components
const MultiScanPanel = lazy(() => import("./MultiScanPanel"));
const CameraLens = lazy(() => import("./CameraLens"));

export function VisionScanner({
  activeTab,
}: {
  activeTab: "vision" | "camera";
}) {
  if (activeTab === "vision") {
    return (
      <Suspense
        fallback={
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Loading Vision module…
          </div>
        }
      >
        <MultiScanPanel />
      </Suspense>
    );
  }

  return (
    <>
      {/* Neon-cyan gradient mesh description header */}
      <div
        style={{
          marginBottom: 24,
          textAlign: "center",
          padding: "18px 24px",
          borderRadius: 16,
          background:
            "linear-gradient(135deg, rgba(0,245,255,0.06) 0%, rgba(167,139,250,0.06) 100%)",
          border: "1px solid rgba(0,245,255,0.14)",
        }}
      >
        {/* Animated status indicator — camera-active badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
          <span className="badge-cyan">
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "var(--cyan)", display: "inline-block",
            }} />
            LIVE LENS
          </span>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>
          Point your camera at any garment — a live frame is captured via
          OffscreenCanvas and sent as binary FormData to the ViT model.
        </p>
        <p style={{ fontSize: "0.73rem", color: "var(--text-muted)", margin: "6px 0 0", opacity: 0.55 }}>
          No photos are saved to disk at any stage.
        </p>
      </div>
      <Suspense
        fallback={
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Loading camera module…
          </div>
        }
      >
        <CameraLens />
      </Suspense>
    </>
  );
}
