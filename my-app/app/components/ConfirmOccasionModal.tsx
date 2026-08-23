"use client";

import { useState } from "react";
import { type OutfitSuggestion } from "../../lib/types";
import { logOutfitWear } from "../../lib/api";
import { useSession } from "next-auth/react";
import { toast } from "react-hot-toast";

const PRESET_OCCASIONS = ["Casual", "College", "Office", "Party", "Festive"];

export default function ConfirmOccasionModal({
  outfit,
  onClose,
}: {
  outfit: OutfitSuggestion;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [isCustom, setIsCustom] = useState(false);
  const [customText, setCustomText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const topItem = outfit.items.find(i => i.category === "top") || outfit.items[0];
  const bottomItem = outfit.items.find(i => i.category === "bottom") || outfit.items[1];

  const handleConfirm = async () => {
    const finalOccasion = isCustom ? customText : selectedPreset;
    if (!finalOccasion.trim()) {
      toast.error("Please specify an occasion!");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await logOutfitWear({
        top_item_id: topItem?.id || "",
        bottom_item_id: bottomItem?.id || "",
        occasion_text: finalOccasion,
        weather_temp: 25.0, // Mock for now
        season: "Summer", // Mock for now
      }, session?.user?.id);
      onClose();
      toast.success("Outfit Logged for Today! 🎉", {
        duration: 3000,
      });
    } catch (e: any) {
      toast.error("Failed to log outfit: " + e.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.60)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card-glass"
        style={{
          width: "100%", maxWidth: 420, padding: 24,
          display: "flex", flexDirection: "column", gap: 20, position: "relative"
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>Confirm Today's Occasion</h2>
        
        <div>
          <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Quick select:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PRESET_OCCASIONS.map(preset => (
              <button
                key={preset}
                onClick={() => { setSelectedPreset(preset); setIsCustom(false); }}
                style={{
                  padding: "6px 14px", borderRadius: 99, border: "1px solid",
                  fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                  background: !isCustom && selectedPreset === preset ? "var(--accent)" : "rgba(255,255,255,0.05)",
                  color: !isCustom && selectedPreset === preset ? "#000" : "var(--text-muted)",
                  borderColor: !isCustom && selectedPreset === preset ? "var(--accent)" : "rgba(255,255,255,0.1)",
                }}
              >
                {preset}
              </button>
            ))}
            <button
              onClick={() => { setIsCustom(true); setSelectedPreset(""); }}
              style={{
                padding: "6px 14px", borderRadius: 99, border: "1px dashed",
                fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                background: isCustom ? "rgba(255,255,255,0.1)" : "transparent",
                color: isCustom ? "#fff" : "var(--text-muted)",
                borderColor: isCustom ? "var(--accent)" : "rgba(255,255,255,0.2)",
              }}
            >
              + Custom
            </button>
          </div>
        </div>

        {isCustom && (
          <div style={{ marginTop: 8 }}>
            <input
              type="text"
              autoFocus
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              placeholder="e.g. Friend's Birthday, Trekking..."
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 8,
                background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)",
                color: "#fff", fontSize: "0.9rem", outline: "none",
              }}
            />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "transparent", color: "var(--text-muted)",
              cursor: isSubmitting ? "not-allowed" : "pointer", fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || (!isCustom && !selectedPreset) || (isCustom && !customText.trim())}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: "var(--accent)", color: "#000",
              cursor: isSubmitting ? "not-allowed" : "pointer", fontWeight: 700,
              opacity: isSubmitting ? 0.6 : 1,
            }}
          >
            {isSubmitting ? "Logging..." : "Confirm & Log"}
          </button>
        </div>
      </div>
    </div>
  );
}
