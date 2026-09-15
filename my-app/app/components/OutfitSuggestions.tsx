import React, { useState, useEffect } from "react";
import Image from "next/image";
import type { WardrobeItem, OutfitSuggestion } from "../../lib/types";
import { type WeatherPayload, weatherToOccasionHints } from "../../lib/weather";
import { Sparkles, RefreshCw, Check, Heart } from "lucide-react";
import { OCCASION_COLORS, Skeleton } from "./SharedComponents";
import { toast } from "react-hot-toast";

// ── Condition → Emoji map ────────────────────────────────────────────────────
const CONDITION_ICONS: Record<string, string> = {
  clear: "☀️",
  clouds: "☁️",
  rain: "🌧️",
  drizzle: "🌦️",
  thunderstorm: "⛈️",
  snow: "❄️",
  mist: "🌫️",
  haze: "🌫️",
};

export function WeatherWidget({ weather }: { weather: WeatherPayload }) {
  const icon = CONDITION_ICONS[weather.condition] ?? "🌡️";
  const isHot = weather.tempC >= 35;
  const isCold = weather.tempC <= 15;

  let alert = null;
  if (["rain", "drizzle", "thunderstorm"].includes(weather.condition)) {
    alert = { text: "Looks like rain/breeze by evening. We recommend carrying a light windbreaker jacket!", icon: "☔", color: "text-blue-300", bg: "bg-blue-500/10 border-blue-500/20" };
  } else if (isCold) {
    alert = { text: "Temperature is dropping. Consider layering up with a warm coat or jacket!", icon: "🧣", color: "text-blue-200", bg: "bg-blue-400/10 border-blue-400/20" };
  } else if (isHot) {
    alert = { text: "High heat warning! Stay hydrated and opt for breathable, light fabrics today.", icon: "🧴", color: "text-orange-300", bg: "bg-orange-500/10 border-orange-500/20" };
  }

  return (
    <div className="flex flex-col gap-2 mb-5">
      <div
        className={`relative flex items-center gap-4 p-4 rounded-2xl border transition-all duration-500 overflow-hidden ${isHot
          ? "border-orange-500/20 bg-orange-500/5 shadow-[0_0_40px_-10px_rgba(249,115,22,0.15)]"
          : isCold
            ? "border-blue-500/20 bg-blue-500/5 shadow-[0_0_40px_-10px_rgba(59,130,246,0.15)]"
            : "border-white/10 bg-zinc-900/40 shadow-sm"
          } backdrop-blur-md`}
      >
        {isHot && (
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/15 rounded-full blur-[60px] -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        )}
        {isCold && (
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/15 rounded-full blur-[60px] -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        )}

        <span style={{ fontSize: "1.8rem", flexShrink: 0 }} className="z-10">{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }} className="z-10">
          <p className="m-0 font-bold text-[0.95rem] text-white flex items-center gap-2">
            {weather.tempC}°C <span className="text-zinc-500">·</span>
            <span style={{ textTransform: "capitalize" }} className={isHot ? "text-orange-200" : isCold ? "text-blue-200" : "text-zinc-300"}>{weather.description}</span>
          </p>
          <p className="m-0 text-[0.76rem] text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-zinc-300">{weather.city}{weather.country ? `, ${weather.country}` : ""}</span>
            <span className="text-zinc-600">·</span>
            <span>Feels like {weather.feelsLikeC}°C</span>
            <span className="text-zinc-600">·</span>
            <span>{weather.humidity}% humidity</span>
            <span className="text-zinc-600">·</span>
            <span>💨 {weather.windKph} km/h</span>
          </p>
        </div>
        {weather.isMock && (
          <span
            className="z-10 shrink-0 text-[0.66rem] font-bold tracking-wider px-2 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-500"
          >
            MOCK
          </span>
        )}
      </div>

      {alert && (
        <div className={`flex items-start gap-2.5 px-4 py-3.5 rounded-xl border ${alert.bg} animate-enter shadow-sm`}>
          <span className="text-lg leading-none shrink-0 mt-0.5">{alert.icon}</span>
          <p className={`text-[0.8rem] font-medium leading-relaxed ${alert.color}`}>
            <strong className="text-white mr-1.5">Smart Insight:</strong>{alert.text}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Outfit Suggestion Card ───────────────────────────────────────────────────
export function OutfitCard({
  outfit,
  index,
  allItems = [],
  onWearToday,
}: {
  outfit: OutfitSuggestion;
  index: number;
  allItems?: WardrobeItem[];
  onWearToday: (outfit: OutfitSuggestion) => void;
}) {
  const [currentItems, setCurrentItems] = useState<WardrobeItem[]>(outfit.items || []);

  // When outfit changes (e.g. refresh), reset current items
  useEffect(() => {
    setCurrentItems(outfit.items || []);
  }, [outfit]);

  const handleSwap = (e: React.MouseEvent, targetItemIndex: number) => {
    e.stopPropagation();
    const itemToSwap = currentItems[targetItemIndex];
    if (!itemToSwap || allItems.length === 0) return;

    const alternatives = allItems.filter(i =>
      i.category === itemToSwap.category &&
      i.id !== itemToSwap.id &&
      (i.occasions?.includes(outfit.occasion) || (i.occasions as any) === outfit.occasion)
    );

    if (alternatives.length > 0) {
      const randomAlt = alternatives[Math.floor(Math.random() * alternatives.length)];
      setCurrentItems(prev => {
        const next = [...prev];
        next[targetItemIndex] = randomAlt;
        return next;
      });
    } else {
      const genericAlts = allItems.filter(i => i.category === itemToSwap.category && i.id !== itemToSwap.id);
      if (genericAlts.length > 0) {
        const randomAlt = genericAlts[Math.floor(Math.random() * genericAlts.length)];
        setCurrentItems(prev => {
          const next = [...prev];
          next[targetItemIndex] = randomAlt;
          return next;
        });
      } else {
        toast.error("No alternatives available for this item in your wardrobe!");
      }
    }
  };

  const handleShuffleOutfit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (allItems.length === 0) return;

    setCurrentItems(prev => {
      const next = [...prev];
      let shuffled = false;

      next.forEach((item, index) => {
        const alternatives = allItems.filter(i =>
          i.category === item.category &&
          i.id !== item.id &&
          (i.occasions?.includes(outfit.occasion) || (i.occasions as any) === outfit.occasion)
        );

        if (alternatives.length > 0) {
          next[index] = alternatives[Math.floor(Math.random() * alternatives.length)];
          shuffled = true;
        } else {
          const genericAlts = allItems.filter(i => i.category === item.category && i.id !== item.id);
          if (genericAlts.length > 0) {
            next[index] = genericAlts[Math.floor(Math.random() * genericAlts.length)];
            shuffled = true;
          }
        }
      });

      if (!shuffled) {
        toast.error("Not enough clothes in your wardrobe to shuffle this combo!");
      }

      return next;
    });
  };

  const occ = OCCASION_COLORS[outfit.occasion] ?? {
    bg: "rgba(255,255,255,0.05)",
    text: "#8b8b9a",
  };
  const pct = Math.round(outfit.confidence_score * 100);

  return (
    <div
      className={`relative flex flex-col h-full gap-4 p-5 rounded-[28px] border border-white/10 bg-zinc-900/60 backdrop-blur-2xl animate-enter stagger-${Math.min(index + 1, 6)} group overflow-hidden transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_24px_50px_-12px_rgba(168,85,247,0.15)] hover:border-white/20`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

      <div className="flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: occ.text }} />
          <span style={{ color: occ.text }} className="text-[0.7rem] font-bold uppercase tracking-[0.15em]">
            {outfit.occasion}
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 border border-white/5 backdrop-blur-md">
          <Sparkles size={11} className="text-cyan-400" />
          <span className="text-[0.7rem] font-bold tracking-wider text-white">
            {pct}% Match
          </span>
        </div>
      </div>

      <div className="flex flex-row gap-2 h-[15rem] z-10">
        {currentItems.map((item, idx) => (
          <div key={`${item.id}-${idx}`} className="flex-1 relative rounded-2xl overflow-hidden bg-black/60 border border-white/10 group/item cursor-pointer shadow-inner transition-all duration-500 hover:border-purple-400/40 hover:shadow-[0_0_20px_rgba(168,85,247,0.2)]">
            <button
              onClick={(e) => handleSwap(e, idx)}
              className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-all duration-300 z-20 hover:bg-white hover:text-black hover:scale-110 shadow-xl backdrop-blur-sm border border-white/20"
              title="Shuffle item"
            >
              <RefreshCw size={16} strokeWidth={2.5} />
            </button>

            <Image 
              src={item.image_url || ""} 
              alt={item.name} 
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition-transform duration-700 group-hover/item:scale-110 opacity-90 group-hover/item:opacity-100" 
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-4 mt-auto border-t border-white/5 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onWearToday({ ...outfit, items: currentItems });
          }}
          className="flex-1 flex items-center justify-center gap-2 bg-black/20 text-zinc-400 py-2.5 rounded-full text-[0.75rem] font-bold border border-white/10 hover:border-white/30 hover:text-white hover:bg-white/5 transition-all duration-300 cursor-pointer"
        >
          <Check size={15} strokeWidth={3} />
          <span className="tracking-widest uppercase">Wore This</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toast.success("Saved to Lookbook! ❤️");
          }}
          className="flex-1 flex items-center justify-center gap-2 bg-black/20 text-zinc-400 py-2.5 rounded-full text-[0.75rem] font-bold border border-white/10 hover:border-white/30 hover:text-white hover:bg-white/5 transition-all duration-300 cursor-pointer group/save"
        >
          <Heart size={15} strokeWidth={2.5} className="group-hover/save:text-pink-400 transition-colors" />
          <span className="tracking-widest uppercase">Save Combo</span>
        </button>
      </div>
    </div>
  );
}

// ── Main Outfit Suggestions Grid ─────────────────────────────────────────────
export function OutfitSuggestionsGrid({
  outfits,
  outfitsLoading,
  outfitsError,
  weather,
  items,
  activeSeasons,
  onWearToday,
  onRefresh,
  onScanNew,
  onOpenManualCreator,
}: {
  outfits: OutfitSuggestion[];
  outfitsLoading: boolean;
  outfitsError: string | null;
  weather: WeatherPayload | null;
  items: WardrobeItem[];
  activeSeasons: Set<string>;
  onWearToday: (outfit: OutfitSuggestion) => void;
  onRefresh: () => void;
  onScanNew: () => void;
  onOpenManualCreator: () => void;
}) {
  const [activeOutfitTab, setActiveOutfitTab] = useState<string>("all");
  const [smartSearch, setSmartSearch] = useState<string>("");

  const hints = weather
    ? weatherToOccasionHints(weather)
    : ["casual", "formal", "party", "sport"];

  let filtered = [...outfits];
  if (activeOutfitTab !== "all") {
    filtered = filtered.filter(o => o.occasion === activeOutfitTab);
  }
  if (activeSeasons.size > 0) {
    filtered = filtered.filter(o => o.items && o.items.some(i => i.seasons && i.seasons.some(s => activeSeasons.has(s.toLowerCase()))));
  }
  if (smartSearch.length > 0) {
    const lowerSearch = smartSearch.toLowerCase();
    filtered = filtered.filter(o => 
      o.occasion.toLowerCase().includes(lowerSearch) ||
      (o.style_note && o.style_note.toLowerCase().includes(lowerSearch)) ||
      (o.items && o.items.some(i => 
          (i.name && i.name.toLowerCase().includes(lowerSearch)) || 
          (i.category && i.category.toLowerCase().includes(lowerSearch)) ||
          (i.color && i.color.toLowerCase().includes(lowerSearch)) ||
          (i.seasons && i.seasons.some(s => s.toLowerCase().includes(lowerSearch)))
      ))
    );
  }

  const sorted = filtered.sort((a, b) => {
    const ai = hints.indexOf(a.occasion);
    const bi = hints.indexOf(b.occasion);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  
  const currentOccasionLabel = activeOutfitTab === "all" ? "All" : ["casual", "formal", "party", "sport"].find(k => k === activeOutfitTab) || activeOutfitTab;
  const TABS = [
    { key: "all", label: "Best for Today" },
    { key: "casual", label: "Casual" },
    { key: "formal", label: "Office" },
    { key: "college_daily", label: "College" },
    { key: "sport", label: "Gym / Sport" },
    { key: "party", label: "Party Night" }
  ];

  return (
    <>
      {weather && <WeatherWidget weather={weather} />}

      <div style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div className="flex items-center gap-3">
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>
              {outfitsLoading
                ? "Fetching suggestions…"
                : activeOutfitTab !== "all" 
                  ? (
                      <span className="flex items-center gap-2">
                        Found <strong className="text-white bg-white/10 px-2 py-0.5 rounded text-[0.8rem] shadow-inner border border-white/10">{sorted.length}</strong> Matches for <span className="text-purple-300 font-semibold bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30 text-[0.8rem] capitalize shadow-[0_0_10px_rgba(168,85,247,0.2)]">[{currentOccasionLabel}]</span>
                      </span>
                    )
                  : weather
                    ? `${outfits.length} suggestions · ranked for ${weather.tempC}°C ${weather.description}`
                    : `${outfits.length} curated suggestions`
              }
            </p>
            {activeOutfitTab !== "all" && !outfitsLoading && (
              <button 
                onClick={() => setActiveOutfitTab("all")}
                className="text-[0.7rem] font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/80 px-2.5 py-1 rounded-full border border-red-500/20 transition-all flex items-center gap-1 cursor-pointer"
              >
                Clear Filters ✕
              </button>
            )}
          </div>
          {!outfitsLoading && (
            <button
              id="outfits-refresh"
              onClick={onRefresh}
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: 99,
                padding: "5px 14px",
                color: "var(--text-muted)",
                fontSize: "0.75rem",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              ↺ Refresh
            </button>
          )}
        </div>

        <div style={{ position: "relative", marginBottom: 16, display: "flex", gap: "12px", alignItems: "center" }}>
          <input
            type="text"
            value={smartSearch}
            onChange={(e) => setSmartSearch(e.target.value)}
            placeholder="Filter by season, occasion, or style (e.g. 'Summer', 'Party', 'Blue Jeans')..."
            style={{
              flex: 1,
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
          <button
            onClick={onOpenManualCreator}
            className="shrink-0 px-5 py-3 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/50 font-bold text-sm hover:bg-purple-500/30 hover:text-purple-300 transition-colors shadow-[0_0_15px_rgba(168,85,247,0.15)] flex items-center gap-2 cursor-pointer"
          >
            <span className="text-lg">✨</span> Custom Outfit
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-4 mb-4 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveOutfitTab(tab.key)}
              className={`shrink-0 px-5 py-2.5 rounded-full text-[0.8rem] font-bold transition-all duration-300 border cursor-pointer ${activeOutfitTab === tab.key
                ? "bg-purple-600 text-white border-purple-500 shadow-[0_0_20px_rgba(147,51,234,0.4)] scale-[1.03]"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 hover:border-slate-600 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:scale-105"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {outfitsError && (
          <div
            id="outfits-error"
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
            ⚠️ Could not load suggestions: {outfitsError}
          </div>
        )}

        <div
          id="outfits-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 20,
            contain: "layout style",
          }}
        >
          {outfitsLoading
            ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={`card p-5 flex flex-col gap-4 stagger-${i + 1}`}
              >
                <Skeleton h={20} w="50%" />
                <Skeleton h={4} />
                <Skeleton h={14} />
                <Skeleton h={14} w="80%" />
                <Skeleton h={14} w="60%" />
              </div>
            ))
            : sorted.length === 0
              ? (
                <div className="col-span-full py-20 flex flex-col items-center justify-center text-center border border-dashed border-white/10 rounded-3xl text-zinc-400 bg-zinc-900/20 backdrop-blur-sm relative overflow-hidden">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />
                  <Sparkles size={42} className="mb-4 text-zinc-600" strokeWidth={1} />
                  <h3 className="text-lg font-bold text-white mb-2">No outfits found for this vibe</h3>
                  <p className="text-[0.85rem] max-w-md mx-auto mb-6 leading-relaxed">
                    {weather ? `It's currently ${weather.tempC}°C, but we couldn't find a complete outfit for this weather and occasion in your wardrobe.` : `Your wardrobe needs a few more items for this occasion to generate a complete look.`}
                  </p>
                  <div className="flex gap-4">
                    <button
                      onClick={onScanNew}
                      className="px-6 py-2.5 rounded-full bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 text-sm font-semibold hover:bg-cyan-500/30 hover:text-cyan-300 transition-colors cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                    >
                      Scan New Clothes
                    </button>
                    <button
                      onClick={() => toast("Ignore Weather mode coming soon! 🔧", { icon: "⚠️" })}
                      className="px-6 py-2.5 rounded-full bg-white/10 border border-white/20 text-white text-sm font-semibold hover:bg-white/20 transition-colors cursor-pointer shadow-sm flex items-center gap-2"
                    >
                      <span className="opacity-70 text-xs">⚠️</span> Ignore Weather
                    </button>
                  </div>
                </div>
              )
              : sorted.map((outfit, i) => (
                <div key={outfit.id} style={{ position: "relative", height: "100%" }}>
                  {i === 0 && weather && (
                    <div
                      style={{
                        position: "absolute",
                        top: -11,
                        left: 14,
                        zIndex: 2,
                        background: "var(--accent)",
                        color: "#0c0c0f",
                        fontSize: "0.66rem",
                        fontWeight: 800,
                        letterSpacing: "0.04em",
                        padding: "3px 11px",
                        borderRadius: 99,
                        boxShadow: "0 0 10px var(--accent-glow)",
                      }}
                    >
                      ⚡ Best for {weather.tempC}°C today
                    </div>
                  )}
                  <OutfitCard outfit={outfit} index={i} allItems={items} onWearToday={onWearToday} />
                </div>
              ))
          }
        </div>
      </div>
    </>
  );
}
