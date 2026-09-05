"use client";

import { useState } from "react";
import { type OutfitSuggestion } from "../../lib/types";
import { logOutfitWear } from "../../lib/api";
import { useSession } from "next-auth/react";
import { toast } from "react-hot-toast";
import { useRepetitionCheck } from "../../lib/useRepetitionCheck";
import { AlertTriangle, RefreshCw } from "lucide-react";

const PRESET_OCCASIONS = ["Casual", "College", "Office", "Party", "Festive"];

function pluralDays(n: number) {
  if (n === 0) return "Today";
  if (n === 1) return "Yesterday";
  return `${n} days ago`;
}

export default function ConfirmOccasionModal({
  outfit,
  onClose,
}: {
  outfit: OutfitSuggestion;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const [selectedPreset, setSelectedPreset] = useState<string>(() => {
    if (outfit.occasion) {
      const match = PRESET_OCCASIONS.find(
        p => p.toLowerCase() === outfit.occasion.toLowerCase() ||
             outfit.occasion.toLowerCase().includes(p.toLowerCase()) ||
             p.toLowerCase().includes(outfit.occasion.toLowerCase())
      );
      if (match) return match;
    }
    return "Casual";
  });
  const [isCustom, setIsCustom] = useState(false);
  const [customText, setCustomText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);

  const topItem = outfit.items.find(i => i.category?.toLowerCase() === "top") || outfit.items[0];
  const bottomItem = outfit.items.find(i => i.category?.toLowerCase() === "bottom") || outfit.items[1] || outfit.items[0];

  const { data: repData, loading: repLoading } = useRepetitionCheck(
    topItem?.id,
    bottomItem?.id,
    session?.user?.id
  );

  const handleConfirm = async () => {
    const finalOccasion = isCustom ? customText.trim() : (selectedPreset || "Casual");
    if (!finalOccasion) {
      toast.error("Please specify an occasion!");
      return;
    }

    setIsSubmitting(true);
    try {
      await logOutfitWear({
        top_item_id: topItem?.id || "",
        bottom_item_id: bottomItem?.id || topItem?.id || "",
        occasion_text: finalOccasion,
        weather_temp: 25.0,
        season: "Summer",
      }, session?.user?.id);
      onClose();
      toast.success("Outfit Logged for Today! 🎉", { duration: 3000 });
    } catch (e: any) {
      toast.error("Failed to log outfit: " + e.message);
      setIsSubmitting(false);
    }
  };

  // ── Compute warning level ──────────────────────────────────────────────────
  const RECENT_THRESHOLD_DAYS = 7;
  const showWarning = !warningDismissed && repData && !repLoading;

  const comboRecentlyWorn =
    repData?.combo_worn_ago_days != null &&
    repData.combo_worn_ago_days <= RECENT_THRESHOLD_DAYS;

  const topRecentlyWorn =
    repData?.top_worn_ago_days != null &&
    repData.top_worn_ago_days <= RECENT_THRESHOLD_DAYS;

  const bottomRecentlyWorn =
    repData?.bottom_worn_ago_days != null &&
    repData.bottom_worn_ago_days <= RECENT_THRESHOLD_DAYS;

  const hasAnyWarning = comboRecentlyWorn || topRecentlyWorn || bottomRecentlyWorn;

  // ── Warning severity colours ───────────────────────────────────────────────
  const warnColor = comboRecentlyWorn
    ? { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.35)", icon: "#f87171", text: "#fca5a5" }
    : { bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.35)", icon: "#fbbf24", text: "#fde68a" };

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
          width: "100%", maxWidth: 440, padding: 24,
          display: "flex", flexDirection: "column", gap: 18, position: "relative",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>
          Confirm Today's Occasion
        </h2>

        {/* ── Repetition Warning Banner ─────────────────────────────────── */}
        {repLoading && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", borderRadius: 10,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            fontSize: "0.78rem", color: "var(--text-muted)",
          }}>
            <RefreshCw size={13} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
            Checking your wear history…
          </div>
        )}

        {showWarning && hasAnyWarning && (
          <div style={{
            padding: "12px 14px", borderRadius: 12,
            background: warnColor.bg,
            border: `1px solid ${warnColor.border}`,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <AlertTriangle size={15} style={{ color: warnColor.icon, flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: warnColor.text }}>
                  {comboRecentlyWorn ? "Outfit Repetition Detected!" : "Clothing Repetition Alert"}
                </span>
              </div>
              <button
                onClick={() => setWarningDismissed(true)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text-muted)", fontSize: "1rem", lineHeight: 1,
                  padding: "0 2px", flexShrink: 0,
                }}
                title="Dismiss"
              >
                ×
              </button>
            </div>

            {/* Detail lines */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 22 }}>
              {comboRecentlyWorn && repData?.combo_last_occasion && (
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#fca5a5", lineHeight: 1.5 }}>
                  🔁 <strong>This exact combo</strong> worn{" "}
                  <strong>{pluralDays(repData.combo_worn_ago_days!)}</strong>{" "}
                  — for <strong>{repData.combo_last_occasion}</strong>
                </p>
              )}

              {!comboRecentlyWorn && topRecentlyWorn && repData?.top_last_occasion && (
                <p style={{ margin: 0, fontSize: "0.75rem", color: warnColor.text, lineHeight: 1.5 }}>
                  👕 <strong>Top</strong> last worn{" "}
                  <strong>{pluralDays(repData.top_worn_ago_days!)}</strong>{" "}
                  — for <strong>{repData.top_last_occasion}</strong>
                </p>
              )}

              {!comboRecentlyWorn && bottomRecentlyWorn && repData?.bottom_last_occasion && (
                <p style={{ margin: 0, fontSize: "0.75rem", color: warnColor.text, lineHeight: 1.5 }}>
                  👖 <strong>Bottom</strong> last worn{" "}
                  <strong>{pluralDays(repData.bottom_worn_ago_days!)}</strong>{" "}
                  — for <strong>{repData.bottom_last_occasion}</strong>
                </p>
              )}

              {/* Monthly wear counts */}
              {repData && (repData.combo_worn_count_month > 0 || repData.top_worn_count_month > 0) && (
                <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  {repData!.combo_worn_count_month > 0
                    ? `This combo logged ${repData!.combo_worn_count_month}× this month.`
                    : `Top worn ${repData!.top_worn_count_month}× this month.`}
                  {" "}You can still log it below.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Occasion Selector ─────────────────────────────────────────── */}
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
                color: "#fff", fontSize: "0.9rem", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 4 }}>
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
            disabled={isSubmitting || (isCustom && !customText.trim())}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: "var(--accent)", color: "#000",
              cursor: (isSubmitting || (isCustom && !customText.trim())) ? "not-allowed" : "pointer", fontWeight: 700,
              opacity: (isSubmitting || (isCustom && !customText.trim())) ? 0.6 : 1,
            }}
          >
            {isSubmitting ? "Logging…" : (hasAnyWarning && !warningDismissed ? "Log Anyway" : "Confirm & Log")}
          </button>
        </div>
      </div>
    </div>
  );
}

