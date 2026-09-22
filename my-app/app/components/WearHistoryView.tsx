"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { getOutfitHistory, deleteOutfitHistory } from "../../lib/api";
import { type OutfitHistoryRecord } from "../../lib/types";
import { Trash2, Shirt } from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "react-hot-toast";

/** Returns a human-readable rewear insight for a given outfit record. */
function computeRewearInsight(record: OutfitHistoryRecord, allHistory: OutfitHistoryRecord[]): string {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const comboThisMonth = allHistory.filter(r => {
    if (r.top_item_id !== record.top_item_id || r.bottom_item_id !== record.bottom_item_id) return false;
    const worn = new Date(r.worn_date);
    return worn >= monthStart;
  });

  const count = comboThisMonth.length;

  if (count <= 1) return "🎉 First time this combo this month!";
  if (count === 2) return "Worn 2× this month";
  return `Worn ${count}× this month`;
}

export default function WearHistoryView() {
  const { data: session } = useSession();
  const [history, setHistory] = useState<OutfitHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    getOutfitHistory(userId)
      .then(res => { setHistory(res); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [session?.user?.id]);

  // Dynamically derive unique occasions from actual logged records
  const occasionFilters = useMemo(() => {
    const map = new Map<string, number>();
    history.forEach(r => {
      const key = r.occasion_display;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([label, count]) => ({ label, count }));
  }, [history]);

  const filtered = useMemo(() =>
    activeFilter === "all"
      ? history
      : history.filter(r => r.occasion_display === activeFilter),
    [history, activeFilter]
  );

  // Most worn occasion
  const topOccasion = useMemo(() => {
    if (!occasionFilters.length) return "-";
    return occasionFilters.reduce((a, b) => a.count >= b.count ? a : b).label;
  }, [occasionFilters]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px", gap: 12, color: "var(--text-muted)" }}>
        <span style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--cyan)", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
        Loading history…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.4)", padding: 20, borderRadius: 12, color: "#f87171" }}>
        ⚠️ Failed to load history: {error}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* ── Metrics Row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "Total Logged", value: history.length, color: "var(--cyan)" },
          { label: "Unique Occasions", value: occasionFilters.length, color: "#a78bfa" },
          { label: "Most Worn", value: topOccasion, color: "#fb923c", small: true },
        ].map(({ label, value, color, small }) => (
          <div key={label} className="card-glass" style={{ padding: "18px 20px", borderRadius: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: small ? "1.2rem" : "2rem", fontWeight: 800, color, lineHeight: 1.1 }}>{value}</span>
          </div>
        ))}
      </div>

      {/* ── Dynamic Occasion Filter Bar ── */}
      {occasionFilters.length > 0 && (
        <div>
          <p style={{ margin: "0 0 10px", fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>
            Filter by Occasion
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {/* All pill */}
            <button
              onClick={() => setActiveFilter("all")}
              style={{
                padding: "6px 14px", borderRadius: 99, border: "1px solid",
                fontSize: "0.78rem", fontWeight: 700, cursor: "pointer",
                transition: "all 0.2s ease",
                background: activeFilter === "all" ? "rgba(255,255,255,0.12)" : "transparent",
                color: activeFilter === "all" ? "#fff" : "var(--text-muted)",
                borderColor: activeFilter === "all" ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              All
              <span style={{
                fontSize: "0.65rem", fontWeight: 800,
                background: activeFilter === "all" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)",
                padding: "1px 6px", borderRadius: 99,
              }}>
                {history.length}
              </span>
            </button>

            {/* Dynamic occasion pills */}
            {occasionFilters.map(({ label, count }) => {
              const isActive = activeFilter === label;
              return (
                <button
                  key={label}
                  onClick={() => setActiveFilter(isActive ? "all" : label)}
                  style={{
                    padding: "6px 14px", borderRadius: 99, border: "1px solid",
                    fontSize: "0.78rem", fontWeight: 700, cursor: "pointer",
                    transition: "all 0.2s ease",
                    background: isActive ? "rgba(167,139,250,0.15)" : "transparent",
                    color: isActive ? "#c4b5fd" : "var(--text-muted)",
                    borderColor: isActive ? "rgba(167,139,250,0.5)" : "rgba(255,255,255,0.1)",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {label}
                  <span style={{
                    fontSize: "0.65rem", fontWeight: 800,
                    background: isActive ? "rgba(167,139,250,0.25)" : "rgba(255,255,255,0.06)",
                    color: isActive ? "#c4b5fd" : "var(--text-muted)",
                    padding: "1px 6px", borderRadius: 99,
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Timeline Cards ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 16 }}>
            <p style={{ fontSize: "2.5rem", margin: "0 0 14px" }}>🗂️</p>
            <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem", color: "#fff" }}>Your History is Empty</h3>
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Pick an outfit from Suggestions and confirm the occasion to start tracking your wears!
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 16, color: "var(--text-muted)" }}>
            <p style={{ margin: "0 0 8px", fontSize: "1.5rem" }}>🔍</p>
            <p style={{ margin: 0, fontSize: "0.88rem" }}>No records for "{activeFilter}"</p>
          </div>
        ) : (
          Object.entries(
            filtered.reduce((acc, record) => {
              const today = new Date().toISOString().slice(0, 10);
              const wornDate = record.worn_date || today;
              if (!acc[wornDate]) acc[wornDate] = [];
              acc[wornDate].push(record);
              return acc;
            }, {} as Record<string, OutfitHistoryRecord[]>)
          )
          .sort((a, b) => b[0].localeCompare(a[0])) // Sort by YYYY-MM-DD descending
          .map(([dateStr, records]) => {
            const today = new Date().toISOString().slice(0, 10);
            const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            let dateLabel = dateStr;
            
            if (dateStr === today) {
              dateLabel = `TODAY · ${new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}`;
            } else if (dateStr === yesterday) {
              dateLabel = `YESTERDAY · ${new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}`;
            } else {
              dateLabel = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
            }

            return (
              <div key={dateStr} className="relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-0 before:w-px before:bg-white/10 last:before:hidden flex flex-col gap-4 mb-6">
                {/* Timeline Node & Date Header */}
                <div className="flex items-center gap-3 relative -left-[19px]">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-600 shadow-sm z-10 border-[2px] border-[#0a0a0d]" />
                  <h3 className="text-[0.68rem] font-semibold text-zinc-400 tracking-widest uppercase">
                    {dateLabel}
                  </h3>
                </div>

              {/* Outfit Entries for this Date */}
              {records.map(record => (
                <div key={record.id} className="group relative bg-zinc-900/40 backdrop-blur-md rounded-[20px] border border-white/5 hover:border-white/10 hover:bg-zinc-800/40 transition-all p-3.5 flex flex-col sm:flex-row gap-5 items-start sm:items-center shadow-sm">
                  
                  {/* Delete Button (Hover) */}
                  <button
                    onClick={() => {
                      const userId = session?.user?.id;
                      toast(
                        (t) => (
                          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            Delete this outfit log?
                            <button
                              onClick={async () => {
                                toast.dismiss(t.id);
                                try {
                                  await deleteOutfitHistory(record.id, userId);
                                  setHistory(prev => prev.filter(r => r.id !== record.id));
                                  toast.success("Log deleted.");
                                } catch {
                                  toast.error("Failed to delete log.");
                                }
                              }}
                              style={{ marginLeft: 8, padding: "4px 12px", borderRadius: 6, background: "#ef4444", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer", fontSize: "0.8rem" }}
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => toast.dismiss(t.id)}
                              style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer", fontSize: "0.8rem" }}
                            >
                              Cancel
                            </button>
                          </span>
                        ),
                        { duration: 6000 }
                      );
                    }}
                    className="absolute top-3 right-3 p-2 rounded-full bg-red-500/10 text-red-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white cursor-pointer z-10"
                    title="Remove Log"
                  >
                    <Trash2 size={15} />
                  </button>

                  {/* Thumbnail Row */}
                  <div className="flex gap-2">
                    {[record.top_item, record.bottom_item].map((item, idx) => (
                      <div key={idx} className="relative w-[4.5rem] h-[5.5rem] rounded-[14px] overflow-hidden bg-black/20 border border-white/5 flex items-center justify-center">
                        {item?.image_url ? (
                          <Image 
                            src={item.image_url} 
                            alt={item.name} 
                            width={72} 
                            height={88} 
                            className="w-full h-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-105" 
                            loading="lazy" 
                            quality={60} 
                            sizes="(max-width: 768px) 50vw, 25vw"
                            placeholder="blur"
                            blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzIiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzFhMWExZiIvPjwvc3ZnPg=="
                          />
                        ) : (
                          <div
                            style={{ 
                              background: item?.color ? `linear-gradient(135deg, ${item.color}88 0%, ${item.color}33 100%)` : 'linear-gradient(135deg, #3f3f46 0%, #18181b 100%)' 
                            }}
                            className="w-full h-full flex flex-col items-center justify-center opacity-80"
                          >
                            <Shirt size={22} className="text-white/40 mb-1" strokeWidth={1.5} />
                            <span className="text-[0.55rem] font-bold text-white/60 uppercase tracking-widest bg-black/20 px-1.5 py-0.5 rounded-sm">
                              {idx === 0 ? "Top" : "Bottom"}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Context Info */}
                  <div className="flex-1 flex flex-col gap-1.5 min-w-0 pr-6 py-1">
                    <h4 className="text-[0.95rem] font-semibold text-white/95 truncate tracking-tight">
                      {(record.occasion_category || "Casual").charAt(0).toUpperCase() + (record.occasion_category || "casual").slice(1)} Look
                    </h4>

                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <span className="px-2 py-0.5 rounded text-[0.65rem] font-medium text-zinc-300 bg-zinc-800/60 border border-zinc-700/50 uppercase tracking-wider">
                        {record.occasion_display}
                      </span>
                      <span className="text-[0.65rem] font-medium text-zinc-400 flex items-center gap-1">
                        ⛅ {record.weather_temp}°C
                      </span>
                    </div>

                    {/* Rewear Insight */}
                    <p className="text-[0.7rem] text-zinc-400 flex items-center gap-1.5 mt-1">
                      {computeRewearInsight(record, history)}
                    </p>
                  </div>

                </div>
              ))}
            </div>
          );
        })
        )}
      </div>
    </div>
  );
}
