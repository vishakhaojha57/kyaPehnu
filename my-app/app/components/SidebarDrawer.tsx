import React from "react";
import { signOut, useSession } from "next-auth/react";
import { COLORS, GRADIENTS } from "../theme/designSystem";

// Scan analytics mock — replace with real aggregation when DB is wired
const SCAN_STATS = [
  { label: "Casual", pct: 48, color: COLORS.success },
  { label: "Formal", pct: 28, color: COLORS.accent },
  { label: "Party", pct: 14, color: "#fb923c" },
  { label: "Sport", pct: 10, color: COLORS.cyan },
];

export function SidebarDrawer({
  open,
  onClose,
  activeTab,
  onTabChange,
}: {
  open: boolean;
  onClose: () => void;
  activeTab: string;
  onTabChange: (tab: "history" | "wardrobe" | "outfits" | "vision" | "camera") => void;
}) {
  const { data: session } = useSession();

  const user = session?.user || {
    name: "Wardrobe Master",
    email: "user@kyapehnu.app",
    username: "wardrobe_master"
  };

  const initials = (user.name || "U").slice(0, 2).toUpperCase();

  const NAV = [
    { key: "wardrobe", label: "My Wardrobe" },
    { key: "outfits", label: "Outfit Suggestions" },
    { key: "vision", label: "Vision AI" },
    { key: "camera", label: "Live Lens" },
    { key: "history", label: "Wear History" },
  ] as const;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 40,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Drawer panel */}
      <div
        id="sidebar-drawer"
        style={{
          position: "fixed", top: 0, right: 0,
          height: "100vh", width: 300, zIndex: 50,
          background: "rgba(14,14,18,0.88)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "-8px 0 40px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Close button */}
        <button
          id="sidebar-close"
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 16,
            background: COLORS.elevated, border: `1px solid ${COLORS.border}`,
            borderRadius: 99, width: 30, height: 30,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: COLORS.textMuted, fontSize: "0.85rem",
          }}
        >×</button>


        {/* ── Profile header ─────────────────────────────── */}
        <div style={{
          padding: "18px 24px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          {/* Avatar */}
          <div style={{ position: "relative", width: 56, height: 56, marginBottom: 12 }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: GRADIENTS.primaryBackground,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.2rem", fontWeight: 800, color: "#fff",
              boxShadow: `0 0 20px ${COLORS.borderHover}`,
              overflow: "hidden"
            }}>
              {session?.user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.user.image} alt={user.name!} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : initials}
            </div>
            {/* Online dot */}
            <span style={{
              position: "absolute", bottom: 2, right: 2,
              width: 12, height: 12, borderRadius: "50%",
              background: "#34d399", border: "2px solid #0e0e12",
            }} />
          </div>

          <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem" }}>{user.name}</p>
          <p style={{ margin: "2px 0 8px", fontSize: "0.74rem", color: COLORS.textMuted }}>
            @{(user as any).username || user.email?.split("@")[0]}
          </p>

          {/* Gold badge */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: 99,
            background: "linear-gradient(135deg, rgba(251,191,36,0.15) 0%, rgba(251,146,60,0.15) 100%)",
            border: "1px solid rgba(251,191,36,0.45)",
            color: "#fbbf24", fontSize: "0.65rem", fontWeight: 800,
            letterSpacing: "0.05em", textTransform: "uppercase",
            boxShadow: "0 0 12px rgba(251,191,36,0.20)",
          }}>
            ★ Active Wardrobe Master
          </span>
        </div>

        {/* ── Navigation links ───────────────────────────── */}
        <nav style={{ padding: "14px 16px 0", display: "flex", flexDirection: "column", gap: 4 }}>
          <p style={{
            fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.09em",
            textTransform: "uppercase", color: COLORS.textMuted, opacity: 0.5,
            padding: "0 8px", margin: "0 0 6px"
          }}>
            Navigation
          </p>
          {NAV.map(({ key, label }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                id={`sidebar-nav-${key}`}
                onClick={() => { onTabChange(key as any); onClose(); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "9px 12px", borderRadius: 12,
                  border: active ? "1px solid rgba(167,139,250,0.35)" : "1px solid transparent",
                  background: active ? "rgba(167,139,250,0.10)" : "transparent",
                  color: active ? COLORS.accent : COLORS.textMuted,
                  fontSize: "0.85rem", fontWeight: active ? 700 : 500,
                  cursor: "pointer", textAlign: "left", width: "100%",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                {label}
                {active && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: COLORS.accent }} />}
              </button>
            );
          })}
        </nav>

        {/* ── Scan Analytics mini-panel ──────────────────── */}
        <div style={{
          margin: "16px 16px 0",
          padding: "12px 14px",
          borderRadius: 14,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <p style={{
            margin: "0 0 10px", fontSize: "0.65rem", fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", opacity: 0.55
          }}>
            Wardrobe Breakdown
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {SCAN_STATS.map(({ label, pct, color }) => (
              <div key={label}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: "0.70rem", color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontSize: "0.70rem", fontWeight: 700, color }}>{pct}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${pct}%`, borderRadius: 99,
                    background: color, boxShadow: `0 0 6px ${color}88`,
                    transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)"
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* ── Sign out ─────────────────────── */}
        <div style={{ padding: "12px 16px 24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            id="sidebar-signout"
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{
              width: "100%", padding: "9px 14px", borderRadius: 12,
              border: "1px solid rgba(248,113,113,0.25)",
              background: "rgba(248,113,113,0.06)",
              color: "#f87171", fontSize: "0.82rem", fontWeight: 600,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 8,
              transition: "background 0.2s, border-color 0.2s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,113,113,0.14)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(248,113,113,0.5)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,113,113,0.06)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(248,113,113,0.25)";
            }}
          >
            <span>⎋</span> Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
