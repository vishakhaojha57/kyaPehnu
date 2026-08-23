"use client";

import { useState } from "react";
import type { WardrobeItem } from "../../lib/types";
import { toast } from "react-hot-toast";

export default function ManualOutfitCreator({
  items,
  onClose,
  onSave,
}: {
  items: WardrobeItem[];
  onClose: () => void;
  onSave: (top: WardrobeItem, bottom: WardrobeItem, footwear: WardrobeItem | null) => void;
}) {
  const [activeTab, setActiveTab] = useState<"top" | "bottom" | "footwear">("top");
  const [selectedTop, setSelectedTop] = useState<WardrobeItem | null>(null);
  const [selectedBottom, setSelectedBottom] = useState<WardrobeItem | null>(null);
  const [selectedFootwear, setSelectedFootwear] = useState<WardrobeItem | null>(null);

  const filteredItems = items.filter((item) => {
    if (activeTab === "top") return item.category.toLowerCase() === "top";
    if (activeTab === "bottom") return item.category.toLowerCase() === "bottom";
    if (activeTab === "footwear") return item.category.toLowerCase() === "footwear";
    return false;
  });

  const handleItemSelect = (item: WardrobeItem) => {
    if (activeTab === "top") setSelectedTop(item);
    if (activeTab === "bottom") setSelectedBottom(item);
    if (activeTab === "footwear") setSelectedFootwear(item);
  };

  const handleSave = () => {
    if (!selectedTop || !selectedBottom) {
      toast.error("Please select at least a top and a bottom to save the outfit.");
      return;
    }
    onSave(selectedTop, selectedBottom, selectedFootwear);
  };

  const renderPreviewItem = (label: string, item: WardrobeItem | null, onClear: () => void) => {
    if (!item) {
      return (
        <div className="w-full h-32 rounded-xl border-2 border-dashed border-white/10 bg-zinc-900/40 flex flex-col items-center justify-center text-zinc-500">
          <span className="text-[0.7rem] uppercase tracking-widest font-bold mb-1">{label}</span>
          <span className="text-xl opacity-40">+</span>
        </div>
      );
    }
    return (
      <div className="relative w-full h-32 rounded-xl bg-zinc-800 border border-white/10 overflow-hidden group">
        <button
          onClick={onClear}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 text-xs hover:bg-red-500"
          title="Remove"
        >
          ✕
        </button>
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform" />
        ) : (
          <div className="w-full h-full" style={{ background: item.color }} />
        )}
        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
          <span className="text-[0.55rem] font-bold text-white/60 uppercase tracking-widest block mb-0.5">{label}</span>
          <p className="text-[0.7rem] font-bold text-white truncate">{item.name}</p>
        </div>
      </div>
    );
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        animation: "fadeInUp 0.22s ease both",
      }}
    >
      <div
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        className="card-glass relative w-full max-w-5xl h-[80vh] overflow-hidden flex flex-col md:flex-row"
        style={{
          background: "rgba(14,14,18,0.92)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
          borderRadius: 24,
          animation: "fadeInUp 0.25s ease both",
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-zinc-800 text-white flex items-center justify-center hover:bg-zinc-700 z-50 border border-white/10"
        >
          ✕
        </button>

        {/* Left Side: Outfit Preview */}
        <div className="w-full md:w-1/3 bg-zinc-900/50 border-r border-white/10 p-6 flex flex-col">
          <h2 className="text-xl font-extrabold text-white mb-2">Custom Outfit</h2>
          <p className="text-xs text-zinc-400 mb-6">Mix and match items to create your own unique look.</p>
          
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
            {renderPreviewItem("Top", selectedTop, () => setSelectedTop(null))}
            {renderPreviewItem("Bottom", selectedBottom, () => setSelectedBottom(null))}
            {renderPreviewItem("Footwear", selectedFootwear, () => setSelectedFootwear(null))}
          </div>

          <div className="pt-6 mt-4 border-t border-white/10">
            <button
              onClick={handleSave}
              className="w-full py-3 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold text-sm hover:bg-cyan-500/30 transition-colors flex items-center justify-center gap-2"
            >
              <span className="text-lg">✨</span> Save Custom Outfit
            </button>
          </div>
        </div>

        {/* Right Side: Wardrobe Selection */}
        <div className="w-full md:w-2/3 p-6 flex flex-col bg-zinc-950/40">
          <div className="flex gap-2 mb-6">
            {(["top", "bottom", "footwear"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-2.5 rounded-full text-[0.8rem] font-bold capitalize transition-all border ${
                  activeTab === tab
                    ? "bg-purple-600 text-white border-purple-500 shadow-[0_0_15px_rgba(147,51,234,0.3)]"
                    : "bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                {tab}s
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                <span className="text-2xl mb-2">👕</span>
                <p className="text-sm">No items found in this category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleItemSelect(item)}
                    className="relative rounded-xl border border-white/10 bg-zinc-900/60 overflow-hidden cursor-pointer group hover:border-cyan-500/50 transition-colors h-48"
                  >
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <div className="w-full h-full" style={{ background: item.color }} />
                    )}
                    <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                      <p className="text-[0.75rem] font-bold text-white truncate">{item.name}</p>
                      <p className="text-[0.6rem] text-white/60">{item.color}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
