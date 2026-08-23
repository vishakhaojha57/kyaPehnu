import React, { useState } from "react";
import Image from "next/image";
import type { WardrobeItem } from "../../lib/types";
import { type WeatherPayload, tagAffinityScore } from "../../lib/weather";
import { Trash2, Edit2, Check } from "lucide-react";
import { CATEGORY_COLORS, OCCASION_CHIP_COLORS, SEASON_CHIP_STYLE, ColorDot } from "./SharedComponents";

// ── Item Detail Modal ─────────────────────────────────────────────────────────
// Glassmorphism overlay panel triggered by clothing card onClick event.
// Pure in-memory visualization — zero network calls, zero DB mutations.
// selectedItem tracking variable lives in Home() state only — never crosses
// useSuggestions hook boundaries or alters any background network parameters.
export function ItemDetailModal({
  item,
  weather,
  onClose,
  onDelete,
  onUpdate,
}: {
  item: WardrobeItem;
  weather: WeatherPayload | null;
  onClose: () => void;
  onDelete: (item: WardrobeItem) => void;
  onUpdate?: (item: WardrobeItem) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editBrand, setEditBrand] = useState(item.brand ?? "");
  const [editCategory, setEditCategory] = useState(item.category);

  const handleSave = () => {
    if (onUpdate) {
      onUpdate({ ...item, name: editName, brand: editBrand || null, category: editCategory });
    }
    setIsEditing(false);
  };

  const catColor = CATEGORY_COLORS[item.category] ?? "#8b8b9a";
  const affinity = weather ? tagAffinityScore(item.tags, weather) : null;

  return (
    // Backdrop — click-away dismisses, no state mutations to network params
    <div
      id="item-detail-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        animation: "fadeInUp 0.22s ease both",
      }}
    >
      {/* Panel — stopPropagation so click inside doesn't close */}
      <div
        id="item-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Details for ${item.name}`}
        onClick={(e) => e.stopPropagation()}
        className="card-glass relative w-full max-w-4xl"
        style={{
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          animation: "fadeInUp 0.25s ease both",
        }}
      >
        {/* Close button */}
        <button
          id="item-detail-close"
          onClick={onClose}
          aria-label="Close detail panel"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 99,
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--text-primary)",
            fontSize: "1.2rem",
            zIndex: 10,
            transition: "all 0.2s",
          }}
          className="hover:bg-zinc-800"
        >
          ×
        </button>

        {/* Split Layout: Image (Left) / Metadata (Right) */}
        <div className="flex flex-col md:grid md:grid-cols-2 gap-8">
          
          {/* Left Side: Full Image */}
          <div 
            className="w-full relative rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 flex items-center justify-center min-h-[300px] md:min-h-[500px]"
            style={{
              background: item.image_url ? "transparent" : `linear-gradient(135deg, ${item.color || '#888888'}55 0%, var(--bg-elevated) 100%)`,
            }}
          >
            {item.image_url ? (
              <Image 
                src={item.image_url} 
                alt={item.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-contain md:object-cover"
                style={{ maxHeight: "70vh" }}
              />
            ) : (
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 16,
                  background: item.color,
                  boxShadow: `0 0 40px ${item.color}55`,
                }}
              />
            )}
            {item.is_favourite && (
              <span style={{ position: "absolute", top: 16, left: 16, fontSize: "1.8rem", color: "#fbbf24", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }} title="Favourite">★</span>
            )}
          </div>

          {/* Right Side: Metadata */}
          <div className="flex flex-col gap-6 py-2">
            
            {/* Header: Brand & Title */}
            <div>
              {isEditing ? (
                <input 
                  value={editBrand} 
                  onChange={e => setEditBrand(e.target.value)} 
                  placeholder="Brand (e.g. Zara)" 
                  className="bg-transparent border border-zinc-700 rounded px-2 py-1 text-xs mb-2 w-full text-white outline-none focus:border-blue-500" 
                />
              ) : (
                <p style={{ margin: "0 0 4px", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
                  {item.brand ?? "NO BRAND"}
                </p>
              )}
              {isEditing ? (
                 <input 
                   value={editName} 
                   onChange={e => setEditName(e.target.value)} 
                   placeholder="Item Name" 
                   className="bg-transparent border border-zinc-700 rounded px-2 py-1 text-xl font-bold w-full text-white outline-none focus:border-blue-500" 
                 />
              ) : (
                <h2 style={{ margin: 0, fontWeight: 800, fontSize: "1.8rem", lineHeight: 1.2 }}>
                  {item.name}
                </h2>
              )}
            </div>

            {/* Badges */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="badge px-3 py-1 text-xs" style={{ borderColor: catColor, color: catColor }}>
                {item.category.toUpperCase()}
              </span>
              
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "var(--bg-elevated)",
                  padding: "4px 10px",
                  borderRadius: 99,
                  border: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: item.color,
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}
                />
                <span style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--text-muted)" }}>
                  {item.color}
                </span>
              </div>
            </div>

            {/* Tags */}
            {item.tags.length > 0 && (
              <div>
                <p style={{ margin: "0 0 10px", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
                  Tags
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {item.tags.map((tag) => (
                    <span key={tag} className="text-[12px] font-medium px-3 py-1 rounded-full bg-zinc-100 text-zinc-800 dark:bg-white/10 dark:text-zinc-200 dark:border dark:border-white/10 transition-colors hover:bg-zinc-200 dark:hover:bg-white/20">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Weather Match Box */}
            {affinity !== null && (
              <div style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
                padding: "16px 20px",
                borderRadius: 16,
                background: affinity > 0
                  ? "rgba(52,211,153,0.05)"
                  : affinity < 0
                    ? "rgba(248,113,113,0.05)"
                    : "var(--bg-elevated)",
                border: `1px solid ${affinity > 0 ? "rgba(52,211,153,0.2)" :
                  affinity < 0 ? "rgba(248,113,113,0.2)" :
                    "var(--border)"
                  }`,
                marginTop: "auto"
              }}>
                <span style={{ fontSize: "1.5rem", marginTop: 2 }}>
                  {affinity > 1 ? "🔥" : affinity > 0 ? "✅" : affinity < 0 ? "🟡" : "—"}
                </span>
                <div>
                  <p style={{
                    margin: 0, fontSize: "0.95rem", fontWeight: 700,
                    color: affinity > 0 ? "#34d399" : affinity < 0 ? "#f87171" : "var(--text-primary)"
                  }}>
                    {affinity > 1 ? "Great weather match"
                      : affinity > 0 ? "Good weather match"
                        : affinity < 0 ? "May not suit today's conditions"
                          : "Neutral weather match"}
                  </p>
                  {weather && (
                    <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {weather.tempC}°C · {weather.description} · affinity {affinity > 0 ? `+${affinity}` : affinity}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Footer Actions */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid var(--border)",
              paddingTop: 16,
              marginTop: affinity === null ? "auto" : 0
            }}>
              <p style={{
                margin: 0,
                fontSize: "0.7rem",
                color: "var(--text-muted)",
                opacity: 0.5,
              }}>
                ID · <code style={{ fontFamily: "monospace" }}>{item.id}</code>
              </p>
              
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <button onClick={() => setIsEditing(false)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors text-[0.8rem] font-bold cursor-pointer shadow-sm">
                      Cancel
                    </button>
                    <button onClick={handleSave} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-[0.8rem] font-bold border border-emerald-500/20 cursor-pointer shadow-sm">
                      <Check size={14} strokeWidth={2.5} /> Save
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors text-[0.8rem] font-bold border border-blue-500/20 cursor-pointer shadow-sm hover:shadow-md">
                      <Edit2 size={14} strokeWidth={2.5} /> Edit
                    </button>
                    <button onClick={() => onDelete(item)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-[0.8rem] font-bold border border-red-500/20 cursor-pointer shadow-sm hover:shadow-md">
                      <Trash2 size={14} strokeWidth={2.5} /> Delete Item
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
