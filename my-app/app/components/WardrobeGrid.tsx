import React, { useState, useCallback } from "react";
import Image from "next/image";
import type { WardrobeItem } from "../../lib/types";
import { type WeatherPayload, tagAffinityScore } from "../../lib/weather";
import { Trash2, X } from "lucide-react";
import { CATEGORY_COLORS, getNearestColorName, Skeleton } from "./SharedComponents";

// ── ItemCard ─────────────────────────────────────────────────────────────────
export function ItemCard({
  item,
  index,
  onSelect,
  selectedId,
  onDelete,
  // Outfit builder mode props
  outfitBuilderMode = false,
  outfitSelected = false,
  onOutfitToggle,
}: {
  item: WardrobeItem;
  index: number;
  onSelect: (item: WardrobeItem) => void;
  selectedId: string | null;
  onDelete: (item: WardrobeItem) => void;
  outfitBuilderMode?: boolean;
  outfitSelected?: boolean;
  onOutfitToggle?: (item: WardrobeItem) => void;
}) {
  const catColor = CATEGORY_COLORS[item.category] ?? "#8b8b9a";
  const isSelected = selectedId === item.id;

  const handleClick = () => {
    if (outfitBuilderMode && onOutfitToggle) {
      onOutfitToggle(item);
    } else {
      onSelect(item);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={outfitBuilderMode ? outfitSelected : isSelected}
      aria-label={`Select ${item.name}`}
      onClick={handleClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleClick()}
      className={`card-interactive animate-enter stagger-${Math.min(index + 1, 6)} bg-[#0c0c0f]/80 backdrop-blur-md border border-white/5 group`}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        borderRadius: 16,
        overflow: "hidden",
        padding: 0,
        transition: "box-shadow 0.2s, border-color 0.2s",
        ...(outfitBuilderMode && outfitSelected
          ? { borderColor: "#a78bfa", boxShadow: "0 0 0 2px #a78bfa, 0 0 24px rgba(167,139,250,0.35)" }
          : !outfitBuilderMode && isSelected
          ? { borderColor: "var(--cyan)", boxShadow: "0 0 0 2px var(--cyan), 0 0 28px var(--cyan-glow)" }
          : {}),
      }}
    >
      {/* Outfit builder checkmark */}
      {outfitBuilderMode && outfitSelected && (
        <div
          style={{
            position: "absolute", top: 10, right: 10,
            width: 26, height: 26, borderRadius: "50%",
            background: "#a78bfa", display: "flex",
            alignItems: "center", justifyContent: "center",
            zIndex: 3, boxShadow: "0 2px 8px rgba(167,139,250,0.5)",
            pointerEvents: "none",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0c0c0f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
      {/* Normal selected ribbon */}
      {!outfitBuilderMode && isSelected && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: -24,
            background: "var(--cyan)",
            color: "#0c0c0f",
            fontSize: "0.58rem",
            fontWeight: 900,
            letterSpacing: "0.08em",
            padding: "3px 32px",
            transform: "rotate(38deg)",
            transformOrigin: "top right",
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          SELECTED
        </div>
      )}

      <div
        className="aspect-[4/5] w-full relative overflow-hidden"
        style={{
          background: item.image_url
            ? `var(--bg-elevated)`
            : `linear-gradient(135deg, ${item.color || '#888888'}55 0%, ${item.color || '#888888'}22 60%, var(--bg-elevated) 100%)`,
        }}
      >
        {item.image_url && (
          <Image 
            src={item.image_url} 
            alt={item.name}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
        
        {item.is_favourite && (
          <span
            title="Favourite"
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              fontSize: "1.2rem",
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
              color: "#fbbf24",
              zIndex: 10
            }}
          >
            ★
          </span>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item);
          }}
          className="absolute top-3 right-3 p-2.5 rounded-full bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 hover:bg-red-600 shadow-lg hover:scale-110 cursor-pointer"
          title="Delete Item"
        >
          <Trash2 size={15} strokeWidth={2.5} />
        </button>

      </div>

      <div
        style={{
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flex: 1,
        }}
      >
        <span
          style={{
            fontSize: "1rem",
            fontWeight: 700,
            lineHeight: 1.2,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.name}
        </span>
        
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          <span
            className="badge"
            style={{
              borderColor: catColor,
              color: catColor,
              flexShrink: 0,
              fontSize: "0.65rem",
              padding: "2px 8px"
            }}
          >
            {item.category}
          </span>
          {item.sub_type && (
            <span
              className="badge"
              style={{
                borderColor: "rgba(255,255,255,0.15)",
                color: "var(--text-muted)",
                flexShrink: 0,
                fontSize: "0.65rem",
                padding: "2px 8px"
              }}
            >
              {item.sub_type}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── FilterPanel ──────────────────────────────────────────────────────────────
const SEASON_META: {
  key: string; label: string;
  bg: string; border: string; text: string; activeBg: string; activeGlow: string
}[] = [
    {
      key: "summer", label: "Summer",
      bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.20)", text: "#fbbf24",
      activeBg: "rgba(251,191,36,0.18)", activeGlow: "rgba(251,191,36,0.30)"
    },
    {
      key: "monsoon", label: "Monsoon",
      bg: "rgba(96,165,250,0.06)", border: "rgba(96,165,250,0.20)", text: "#60a5fa",
      activeBg: "rgba(96,165,250,0.18)", activeGlow: "rgba(96,165,250,0.30)"
    },
    {
      key: "winter", label: "Winter",
      bg: "rgba(186,230,253,0.06)", border: "rgba(186,230,253,0.20)", text: "#bae6fd",
      activeBg: "rgba(186,230,253,0.18)", activeGlow: "rgba(186,230,253,0.30)"
    },
    {
      key: "autumn", label: "Autumn",
      bg: "rgba(251,146,60,0.06)", border: "rgba(251,146,60,0.20)", text: "#fb923c",
      activeBg: "rgba(251,146,60,0.18)", activeGlow: "rgba(251,146,60,0.30)"
    },
    {
      key: "spring", label: "Spring",
      bg: "rgba(244,114,182,0.06)", border: "rgba(244,114,182,0.20)", text: "#f472b6",
      activeBg: "rgba(244,114,182,0.18)", activeGlow: "rgba(244,114,182,0.30)"
    },
    {
      key: "festive_spring", label: "Festive Spring",
      bg: "rgba(167,139,250,0.06)", border: "rgba(167,139,250,0.20)", text: "#a78bfa",
      activeBg: "rgba(167,139,250,0.18)", activeGlow: "rgba(167,139,250,0.30)"
    },
  ];

const OCCASION_META: {
  key: string; label: string;
  bg: string; border: string; text: string; activeBg: string; activeGlow: string
}[] = [
    {
      key: "casual", label: "Casual",
      bg: "rgba(52,211,153,0.06)", border: "rgba(52,211,153,0.20)", text: "#34d399",
      activeBg: "rgba(52,211,153,0.18)", activeGlow: "rgba(52,211,153,0.30)"
    },
    {
      key: "formal", label: "Office Formal",
      bg: "rgba(167,139,250,0.06)", border: "rgba(167,139,250,0.20)", text: "#a78bfa",
      activeBg: "rgba(167,139,250,0.18)", activeGlow: "rgba(167,139,250,0.30)"
    },
    {
      key: "college_daily", label: "College",
      bg: "rgba(96,165,250,0.06)", border: "rgba(96,165,250,0.20)", text: "#60a5fa",
      activeBg: "rgba(96,165,250,0.18)", activeGlow: "rgba(96,165,250,0.30)"
    },
    {
      key: "party", label: "Party",
      bg: "rgba(251,146,60,0.06)", border: "rgba(251,146,60,0.20)", text: "#fb923c",
      activeBg: "rgba(251,146,60,0.18)", activeGlow: "rgba(251,146,60,0.30)"
    },
    {
      key: "festive", label: "Festive",
      bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.20)", text: "#fbbf24",
      activeBg: "rgba(251,191,36,0.18)", activeGlow: "rgba(251,191,36,0.30)"
    },
    {
      key: "sport", label: "Sport",
      bg: "rgba(0,245,255,0.06)", border: "rgba(0,245,255,0.20)", text: "#00f5ff",
      activeBg: "rgba(0,245,255,0.18)", activeGlow: "rgba(0,245,255,0.30)"
    },
    {
      key: "wedding_heavy", label: "Wedding",
      bg: "rgba(244,114,182,0.06)", border: "rgba(244,114,182,0.20)", text: "#f472b6",
      activeBg: "rgba(244,114,182,0.18)", activeGlow: "rgba(244,114,182,0.30)"
    },
  ];

export function FilterPanel({
  activeSeasons, activeOccasions, smartSearch, onSeasonToggle, onOccasionToggle, onSearchChange, onClear,
}: {
  activeSeasons: Set<string>;
  activeOccasions: Set<string>;
  smartSearch: string;
  onSeasonToggle: (key: string) => void;
  onOccasionToggle: (key: string) => void;
  onSearchChange: (val: string) => void;
  onClear: () => void;
}) {
  const hasActive = activeSeasons.size > 0 || activeOccasions.size > 0 || smartSearch.length > 0;

  return (
    <div
      id="filter-panel"
      style={{
        marginBottom: 20,
        padding: "16px 18px",
        borderRadius: 16,
        background: "rgba(18,18,22,0.65)",
        border: "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "var(--text-muted)"
        }}>
          🔎 Smart Filters
        </span>
        {hasActive && (
          <button
            onClick={onClear}
            style={{
              fontSize: "0.7rem", fontWeight: 600, color: "var(--accent)",
              background: "none", border: "none", cursor: "pointer",
              letterSpacing: "0.04em", opacity: 0.8,
              textDecoration: "underline", textUnderlineOffset: 3
            }}
          >
            ✕ Clear all
          </button>
        )}
      </div>

      <div style={{ position: "relative", marginBottom: 4 }}>
        <input
          type="text"
          value={smartSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Type an event, mood, or item (e.g. 'Date Night', 'Blue Jeans')..."
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            color: "#fff",
            fontSize: "0.85rem",
            fontWeight: 500,
            outline: "none",
            transition: "all 0.2s ease",
            boxShadow: smartSearch ? "0 0 0 1px var(--cyan), 0 0 16px rgba(0,245,255,0.1)" : "none",
            borderColor: smartSearch ? "var(--cyan)" : "rgba(255,255,255,0.1)",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{
          fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.07em",
          textTransform: "uppercase", color: "var(--text-muted)", opacity: 0.6
        }}>
          Season
        </span>
        <div style={{
          display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2,
          scrollbarWidth: "none"
        }}>
          {SEASON_META.map((s) => {
            const active = activeSeasons.has(s.key);
            return (
              <button
                key={s.key}
                id={`filter-season-${s.key}`}
                onClick={() => onSeasonToggle(s.key)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "5px 13px",
                  borderRadius: 99,
                  border: `1px solid ${active ? s.text : s.border}`,
                  background: active ? s.activeBg : s.bg,
                  color: active ? s.text : "var(--text-muted)",
                  fontSize: "0.76rem", fontWeight: active ? 700 : 500,
                  cursor: "pointer", flexShrink: 0,
                  boxShadow: active ? `0 0 14px ${s.activeGlow}` : "none",
                  transform: active ? "scale(1.05)" : "scale(1)",
                  transition: "all 0.18s ease",
                  letterSpacing: active ? "0.01em" : "0em",
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{
          fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.07em",
          textTransform: "uppercase", color: "var(--text-muted)", opacity: 0.6
        }}>
          Occasion
        </span>
        <div style={{
          display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2,
          scrollbarWidth: "none"
        }}>
          {OCCASION_META.map((o) => {
            const active = activeOccasions.has(o.key);
            return (
              <button
                key={o.key}
                id={`filter-occasion-${o.key}`}
                onClick={() => onOccasionToggle(o.key)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "5px 13px",
                  borderRadius: 99,
                  border: `1px solid ${active ? o.text : o.border}`,
                  background: active ? o.activeBg : o.bg,
                  color: active ? o.text : "var(--text-muted)",
                  fontSize: "0.76rem", fontWeight: active ? 700 : 500,
                  cursor: "pointer", flexShrink: 0,
                  boxShadow: active ? `0 0 14px ${o.activeGlow}` : "none",
                  transform: active ? "scale(1.05)" : "scale(1)",
                  transition: "all 0.18s ease",
                  letterSpacing: active ? "0.01em" : "0em",
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {hasActive && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: -2 }}>
          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", opacity: 0.6 }}>
            Showing items matching
          </span>
          {Array.from(activeSeasons).map(k => {
            const m = SEASON_META.find(s => s.key === k);
            return m ? (
              <button key={k} onClick={() => onSeasonToggle(k)} className="group relative cursor-pointer overflow-hidden rounded-full transition-all" style={{
                fontSize: "0.68rem", fontWeight: 700,
                color: m.text, background: m.activeBg,
                border: `1px solid ${m.border}`, padding: "2px 10px"
              }}>
                <span className="group-hover:invisible block">{m.label}</span>
                <span className="absolute inset-0 flex items-center justify-center font-bold invisible group-hover:visible bg-black/40 backdrop-blur-sm">✕</span>
              </button>
            ) : null;
          })}
          {Array.from(activeOccasions).map(k => {
            const m = OCCASION_META.find(o => o.key === k);
            return m ? (
              <button key={k} onClick={() => onOccasionToggle(k)} className="group relative cursor-pointer overflow-hidden rounded-full transition-all" style={{
                fontSize: "0.68rem", fontWeight: 700,
                color: m.text, background: m.activeBg,
                border: `1px solid ${m.border}`, padding: "2px 10px"
              }}>
                <span className="group-hover:invisible block">{m.label}</span>
                <span className="absolute inset-0 flex items-center justify-center font-bold invisible group-hover:visible bg-black/40 backdrop-blur-sm">✕</span>
              </button>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

// ── WardrobeGrid ─────────────────────────────────────────────────────────────
export function WardrobeGrid({
  items,
  itemsLoading,
  itemsError,
  weather,
  selectedId,
  onSelect,
  onDelete,
  // Outfit builder mode
  outfitBuilderMode = false,
  outfitSelectedIds = [],
  onOutfitToggle,
  onOutfitConfirm,
  onOutfitCancel,
}: {
  items: WardrobeItem[];
  itemsLoading: boolean;
  itemsError: string | null;
  weather: WeatherPayload | null;
  selectedId: string | null;
  onSelect: (item: WardrobeItem) => void;
  onDelete: (item: WardrobeItem) => void;
  outfitBuilderMode?: boolean;
  outfitSelectedIds?: string[];
  onOutfitToggle?: (item: WardrobeItem) => void;
  onOutfitConfirm?: (selectedItems: WardrobeItem[]) => void;
  onOutfitCancel?: () => void;
}) {
  const [activeSeasons, setActiveSeasons] = useState<Set<string>>(new Set());
  const [activeOccasions, setActiveOccasions] = useState<Set<string>>(new Set());
  const [smartSearch, setSmartSearch] = useState<string>("");

  const handleSeasonToggle = useCallback((key: string) => {
    setActiveSeasons((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const handleOccasionToggle = useCallback((key: string) => {
    setActiveOccasions((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const handleFilterClear = useCallback(() => {
    setActiveSeasons(new Set());
    setActiveOccasions(new Set());
    setSmartSearch("");
  }, []);

  const weatherSorted = weather
    ? [...items].sort((a, b) => tagAffinityScore(b.tags, weather) - tagAffinityScore(a.tags, weather))
    : items;

  const filteredItems = weatherSorted.filter(item => {
    const seasonOk = activeSeasons.size === 0 || item.seasons.some(s => activeSeasons.has(s));
    const occasionOk = activeOccasions.size === 0 || item.occasions.some(o => activeOccasions.has(o));

    let searchOk = true;
    if (smartSearch.trim().length > 0) {
      const query = smartSearch.toLowerCase();
      const searchableText = [
        item.name,
        item.category,
        item.sub_type,
        item.brand,
        item.color,
        ...(item.seasons || []),
        ...(item.occasions || []),
        ...(item.tags || [])
      ].filter(Boolean).join(" ").toLowerCase();

      searchOk = searchableText.includes(query);
    }

    return seasonOk && occasionOk && searchOk;
  });

  const outfitSelectedItems = items.filter(i => outfitSelectedIds.includes(i.id));

  return (
    <>
      {/* ── Outfit Builder Banner ── */}
      {outfitBuilderMode && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderRadius: 14, marginBottom: 20,
          background: "linear-gradient(135deg, rgba(167,139,250,0.12) 0%, rgba(96,165,250,0.08) 100%)",
          border: "1px solid rgba(167,139,250,0.35)",
          boxShadow: "0 0 20px rgba(167,139,250,0.08)",
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.2rem" }}>✨</span>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "0.88rem", color: "#c4b5fd" }}>
                Building Custom Outfit
              </p>
              <p style={{ margin: 0, fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 2 }}>
                Tap any items below — tops, dresses, bottoms, footwear, anything!
              </p>
            </div>
          </div>
          <button
            onClick={onOutfitCancel}
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, padding: "6px 12px", color: "var(--text-muted)",
              fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", flexShrink: 0,
            }}
          >
            ✕ Cancel
          </button>
        </div>
      )}

      <FilterPanel
        activeSeasons={activeSeasons}
        activeOccasions={activeOccasions}
        smartSearch={smartSearch}
        onSeasonToggle={handleSeasonToggle}
        onOccasionToggle={handleOccasionToggle}
        onSearchChange={setSmartSearch}
        onClear={handleFilterClear}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          {itemsLoading
            ? "Loading items…"
            : activeSeasons.size > 0 || activeOccasions.size > 0
              ? `${filteredItems.length} of ${items.length} items`
              : `${items.length} items in your wardrobe`}
        </p>
      </div>

      {itemsError && (
        <div
          id="wardrobe-error"
          style={{
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.4)",
            borderRadius: 12,
            padding: "14px 18px",
            color: "#f87171",
            fontSize: "0.85rem",
            marginBottom: 24,
          }}
        >
          ⚠️ Could not reach the API: {itemsError}
          <br />
          <span style={{ opacity: 0.7, fontSize: "0.78rem" }}>
            Make sure the FastAPI server is running on port 8000.
          </span>
        </div>
      )}

      <div
        id="wardrobe-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
          contain: "layout style",
        }}
      >
        {itemsLoading
          ? Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`card p-4 flex flex-col gap-3 stagger-${i + 1}`}>
              <Skeleton h={18} w="70%" />
              <Skeleton h={14} w="40%" />
              <Skeleton h={12} w="85%" />
            </div>
          ))
          : items.length === 0
            ? (
              <div style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: "64px 24px",
                borderRadius: 16,
                background: "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
                border: "1px dashed rgba(255,255,255,0.12)",
                color: "var(--text-muted)",
              }}>
                <p style={{ fontSize: "2.5rem", margin: "0 0 16px" }}>✨</p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: "1.1rem", color: "var(--text)" }}>Your wardrobe is empty!</p>
                <p style={{ margin: "8px 0 0", fontSize: "0.85rem", opacity: 0.8, maxWidth: "300px", marginLeft: "auto", marginRight: "auto", lineHeight: "1.5" }}>
                  Scan your first item using Vision AI to start building your digital closet.
                </p>
              </div>
            )
            : filteredItems.length === 0
              ? (
                <div style={{
                  gridColumn: "1 / -1",
                  textAlign: "center",
                  padding: "48px 24px",
                  borderRadius: 16,
                  border: "1px dashed rgba(255,255,255,0.08)",
                  color: "var(--text-muted)",
                }}>
                  <p style={{ fontSize: "2rem", margin: "0 0 10px" }}>🔍</p>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>No outfit combinations found for your filters.</p>
                  <p style={{ margin: "6px 0 0", fontSize: "0.78rem", opacity: 0.6 }}>Try clearing filters to see all your items.</p>
                </div>
              )
              : filteredItems.map((item, i) => (
              <ItemCard
                key={item.id}
                item={item}
                index={i}
                onSelect={onSelect}
                selectedId={selectedId}
                onDelete={onDelete}
                outfitBuilderMode={outfitBuilderMode}
                outfitSelected={outfitSelectedIds.includes(item.id)}
                onOutfitToggle={onOutfitToggle}
              />
            ))}
      </div>

      {/* ── Floating Outfit Builder Tray ── */}
      {outfitBuilderMode && (
        <div
          style={{
            position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
            zIndex: 50, width: "min(640px, calc(100vw - 32px))",
            background: "rgba(15,15,20,0.92)", backdropFilter: "blur(20px)",
            border: "1px solid rgba(167,139,250,0.4)",
            borderRadius: 20, padding: "14px 18px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(167,139,250,0.2)",
            display: "flex", alignItems: "center", gap: 14,
          }}
        >
          {/* Selected item thumbnails */}
          <div style={{ display: "flex", gap: 8, flex: 1, overflowX: "auto", paddingBottom: 2 }}>
            {outfitSelectedItems.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                Tap items above to add them…
              </p>
            ) : (
              outfitSelectedItems.map(item => (
                <div
                  key={item.id}
                  className="group"
                  style={{
                    width: 48, height: 58, borderRadius: 10, overflow: "hidden", flexShrink: 0,
                    border: "1px solid rgba(167,139,250,0.4)",
                    background: item.color
                      ? `linear-gradient(135deg, ${item.color}88, ${item.color}33)`
                      : "rgba(255,255,255,0.05)",
                    position: "relative",
                    cursor: "pointer",
                  }}
                  title={`Remove ${item.name}`}
                  onClick={() => onOutfitToggle?.(item)}
                >
                  {item.image_url && (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      width={48}
                      height={58}
                      className="object-cover"
                      style={{ width: "100%", height: "100%" }}
                    />
                  )}
                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <X size={18} color="#fff" />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Create Outfit button */}
          <button
            disabled={outfitSelectedItems.length < 1}
            onClick={() => onOutfitConfirm?.(outfitSelectedItems)}
            style={{
              flexShrink: 0,
              padding: "10px 20px", borderRadius: 12, border: "none",
              background: outfitSelectedItems.length >= 1
                ? "linear-gradient(135deg, #a78bfa 0%, #60a5fa 100%)"
                : "rgba(255,255,255,0.08)",
              color: outfitSelectedItems.length >= 1 ? "#0c0c0f" : "var(--text-muted)",
              fontWeight: 800, fontSize: "0.85rem",
              cursor: outfitSelectedItems.length >= 1 ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
              boxShadow: outfitSelectedItems.length >= 1
                ? "0 0 20px rgba(167,139,250,0.4)" : "none",
              transition: "all 0.2s ease",
            }}
          >
            Build Outfit
            {outfitSelectedItems.length > 0 && ` (${outfitSelectedItems.length})`}
          </button>
        </div>
      )}
    </>
  );
}
