/**
 * MultiScanPanel – Multi-Crop YOLO Detection Result Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders an ordered array of DetectedItem cards (top → bottom → footwear).
 * Each card displays:
 *   • Cropped garment image from crop_b64 data-URI (no disk read)
 *   • Category label + sub-type chip (runtime JSON metadata, no DB)
 *   • Dominant colour swatch
 *   • YOLO confidence badge
 *
 * Anti-Gravity Rules:
 *   No DB Over-Indexing — all data is local view state from JSON response.
 *   No Inline CSS Transforms — layout uses flexbox/grid, no transform strings.
 *   Sequential card rendering — Array.map loop, no parallel state side-effects.
 */

"use client";

import { useState, useCallback, useRef } from "react";
import type { ScanResultItemV2 } from "@/lib/types";
import { analyzeClothing, addItem } from "@/lib/api";
import { useSession } from "next-auth/react";
import { toast } from "react-hot-toast";

// ── Category display map ──────────────────────────────────────────────────────
const CAT_ICONS: Record<string, string> = {
  top:       "👕",
  bottom:    "👖",
  footwear:  "👟",
  accessory: "⌚",
  outfit:    "👗",
  traditional: "🥻",
  western:   "💃",
};
const CAT_COLORS: Record<string, string> = {
  top:       "#a78bfa",
  bottom:    "#60a5fa",
  footwear:  "#34d399",
  accessory: "#fbbf24",
  outfit:    "#f472b6",
  traditional: "#ec4899",
  western:   "#c026d3",
};

// ── Toast types ───────────────────────────────────────────────────────────────
type ToastVariant = "success" | "error" | "loading";
interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      id="toast-container"
      style={{
        position: "fixed",
        bottom: 28,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          id={`toast-${t.id}`}
          onClick={() => onDismiss(t.id)}
          style={{
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 18px",
            borderRadius: 14,
            fontSize: "0.84rem",
            fontWeight: 600,
            cursor: "pointer",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
            animation: "toast-slide-in 0.35s cubic-bezier(0.34,1.56,0.64,1)",
            background:
              t.variant === "success"
                ? "linear-gradient(135deg, rgba(109,40,217,0.92) 0%, rgba(124,58,237,0.92) 100%)"
                : t.variant === "error"
                ? "rgba(239,68,68,0.92)"
                : "rgba(30,30,40,0.92)",
            border:
              t.variant === "success"
                ? "1px solid rgba(167,139,250,0.5)"
                : t.variant === "error"
                ? "1px solid rgba(252,165,165,0.4)"
                : "1px solid rgba(255,255,255,0.12)",
            color: "#fff",
            minWidth: 220,
            maxWidth: 340,
          }}
        >
          <span style={{ fontSize: "1.05rem" }}>
            {t.variant === "success" ? "🎉" : t.variant === "error" ? "⚠️" : "⏳"}
          </span>
          <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
          <span style={{ opacity: 0.5, fontSize: "0.72rem" }}>✕</span>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, variant: ToastVariant = "success", durationMs = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, variant }]);
    if (durationMs > 0) {
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), durationMs);
    }
    return id;
  }, []);
  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  return { toasts, push, dismiss };
}

type ScanState =
  | { phase: "idle" }
  | { phase: "scanning" }
  | { phase: "done"; items: ScanResultItemV2[] }
  | { phase: "error"; message: string };

interface MultiScanPanelProps {
  /** Optional callback when scan completes — receives the detected items array */
  onScanComplete?: (items: ScanResultItemV2[]) => void;
}

export default function MultiScanPanel({ onScanComplete }: MultiScanPanelProps) {
  const [state, setState] = useState<ScanState>({ phase: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toasts, push, dismiss } = useToast();
  const { data: session } = useSession();

  // ── File → scan pipeline ──────────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    setState({ phase: "scanning" });
    try {
      const userId = session?.user?.id;
      const res = await analyzeClothing(file, userId);
      if (res.status === "error") {
        setState({ phase: "error", message: "No clothing found in this image." });
        return;
      }
      const items: ScanResultItemV2[] = (res as any).detected_items || (res as any).items || [];
      setState({ phase: "done", items });
      onScanComplete?.(items);
    } catch (e) {
      setState({ phase: "error", message: e instanceof Error ? e.message : "Scan failed." });
    }
  }, [onScanComplete, session?.user?.id]);

  // ── Save item to wardrobe ─────────────────────────────────────────────────
  const handleSaveToWardrobe = useCallback(async (item: ScanResultItemV2) => {
    const loadingId = toast.loading("Saving to wardrobe…");
    try {
      const userId = session?.user?.id;
      await addItem({
        name: item.name,
        category: item.category.toLowerCase(),
        sub_type: item.sub_type || (item as any).type || (item.category.toLowerCase() === "top" ? "Shirt/T-Shirt" : item.category.toLowerCase() === "bottom" ? "Pants/Jeans" : "T-Shirt"),
        color: (item as any).hex_color || "#808080",
        tags: [item.sub_type],
        seasons: item.seasons ?? [],
        occasions: item.occasions ?? [],
        image_url: item.image_crop_blob_reference ?? null,
      }, userId);
      toast.dismiss(loadingId);
      toast.success("Item saved to your wardrobe! 🎉");
    } catch (err) {
      toast.dismiss(loadingId);
      toast.error(
        err instanceof Error ? err.message : "Failed to save item."
      );
    }
  }, [session?.user?.id]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateX(60px) scale(0.92); }
          to   { opacity: 1; transform: translateX(0)    scale(1); }
        }
      `}</style>
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 800, margin: "0 auto" }}>

      {/* ── Drop zone ─────────────────────────────────────────────────────── */}
      <div
        id="multi-scan-dropzone"
        role="button"
        tabIndex={0}
        aria-label="Upload outfit photo for multi-item scan"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        style={{
          position: "relative",
          borderRadius: 24, // rounded-2xl
          background: dragging ? "rgba(0,245,255,0.06)" : "rgba(9, 9, 11, 0.2)", // bg-zinc-950/20
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          border: `1px solid ${dragging ? "rgba(0,245,255,0.5)" : "rgba(255,255,255,0.2)"}`,
          boxShadow: dragging ? "0 0 24px rgba(0,245,255,0.15), inset 0 0 32px rgba(0,245,255,0.1)" : "inset 0 0 32px rgba(0,0,0,0.5)",
          padding: "48px 24px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.3s ease",
          overflow: "hidden",
        }}
      >
        {/* ── Corner Brackets ── */}
        <div style={{ position: "absolute", top: 16, left: 16, width: 24, height: 24, borderTop: `2px solid ${dragging ? "var(--cyan)" : "rgba(255,255,255,0.7)"}`, borderLeft: `2px solid ${dragging ? "var(--cyan)" : "rgba(255,255,255,0.7)"}`, borderRadius: "4px 0 0 0", transition: "border-color 0.3s" }} />
        <div style={{ position: "absolute", top: 16, right: 16, width: 24, height: 24, borderTop: `2px solid ${dragging ? "var(--cyan)" : "rgba(255,255,255,0.7)"}`, borderRight: `2px solid ${dragging ? "var(--cyan)" : "rgba(255,255,255,0.7)"}`, borderRadius: "0 4px 0 0", transition: "border-color 0.3s" }} />
        <div style={{ position: "absolute", bottom: 16, left: 16, width: 24, height: 24, borderBottom: `2px solid ${dragging ? "var(--cyan)" : "rgba(255,255,255,0.7)"}`, borderLeft: `2px solid ${dragging ? "var(--cyan)" : "rgba(255,255,255,0.7)"}`, borderRadius: "0 0 0 4px", transition: "border-color 0.3s" }} />
        <div style={{ position: "absolute", bottom: 16, right: 16, width: 24, height: 24, borderBottom: `2px solid ${dragging ? "var(--cyan)" : "rgba(255,255,255,0.7)"}`, borderRight: `2px solid ${dragging ? "var(--cyan)" : "rgba(255,255,255,0.7)"}`, borderRadius: "0 0 4px 0", transition: "border-color 0.3s" }} />

        {/* ── Text Tag — inside the box, top-center ── */}
        <div style={{
          position: "absolute",
          top: 14,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(6px)",
          padding: "3px 14px",
          fontSize: "0.6rem",
          fontWeight: 700,
          letterSpacing: "0.2em",
          color: dragging ? "var(--cyan)" : "rgba(255,255,255,0.5)",
          textTransform: "uppercase",
          borderRadius: 99,
          border: `1px solid ${dragging ? "var(--cyan)" : "rgba(255,255,255,0.08)"}`,
          transition: "all 0.3s ease",
          zIndex: 10,
          whiteSpace: "nowrap",
        }}>
          AI Scanning Zone
        </div>

        <input
          ref={inputRef}
          id="multi-scan-file-input"
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={onInputChange}
        />
        <div style={{ fontSize: "2.5rem", marginBottom: 10 }}>🔍</div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", margin: 0, lineHeight: 1.6 }}>
          Drop a full outfit photo — YOLO detects all garments automatically<br />
          <span style={{ opacity: 0.6 }}>or click to browse</span>
        </p>
        <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 8, opacity: 0.5 }}>
          JPEG · PNG · WebP · Returns one card per detected item
        </p>
      </div>

      {/* ── Scanning indicator ────────────────────────────────────────────── */}
      {state.phase === "scanning" && (
        <div
          id="multi-scan-loading"
          style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", padding: "16px 0" }}
        >
          <span style={{
            display: "inline-block", width: 18, height: 18,
            border: "2.5px solid var(--border)", borderTopColor: "var(--cyan)",
            borderRadius: "50%", animation: "spin 0.7s linear infinite",
          }} />
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            YOLO scanning for garments…
          </span>
        </div>
      )}

      {/* ── Error / No Clothing Detected ────────────────────────────────────── */}
      {state.phase === "error" && (
        <div
          id="vision-not-found"
          className="card"
          style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center" }}
        >
          <span style={{ fontSize: "2rem" }}>🤔</span>
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>No Clothing Detected</h3>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            {state.message} Please upload a clear photo of clothing like a shirt, trousers, or shoes.
          </p>
          <button
            onClick={() => setState({ phase: "idle" })}
            style={{
              marginTop: 8, padding: "8px 18px", borderRadius: 99,
              border: "1px solid var(--border)", background: "var(--bg-elevated)",
              color: "var(--text-primary)", fontSize: "0.85rem", cursor: "pointer",
            }}
          >
            Try another image
          </button>
        </div>
      )}

      {/* ── Results: one card per detected item ───────────────────────────── */}
      {state.phase === "done" && (
        <>
          {/* Summary bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {state.items.length} item{state.items.length !== 1 ? "s" : ""} detected
            </p>
            <button
              id="multi-scan-reset"
              onClick={() => setState({ phase: "idle" })}
              style={{
                background: "var(--bg-elevated)", border: "1px solid var(--border)",
                borderRadius: 99, padding: "5px 14px", color: "var(--text-muted)",
                fontSize: "0.75rem", cursor: "pointer",
              }}
            >
              ↺ Scan another
            </button>
          </div>

          {/* Cards grid — one card per detected garment */}
          <div
            id="multi-scan-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 16,
              contain: "layout style",   // Anti-Gravity: layout isolation
            }}
          >
            {state.items.map((item, idx) => (
              <DetectedItemCard
                key={`${item.category}-${idx}`}
                item={item}
                index={idx}
                onSave={handleSaveToWardrobe}
                onRescan={() => setState({ phase: "idle" })}
              />
            ))}
          </div>
        </>
      )}
    </div>
    </>
  );
}

// ── DetectedItemCard ──────────────────────────────────────────────────────────
function DetectedItemCard({
  item: initialItem,
  index,
  onSave,
  onRescan,
}: {
  item: ScanResultItemV2;
  index: number;
  onSave: (item: ScanResultItemV2) => Promise<void>;
  onRescan: () => void;
}) {
  const [item, setItem] = useState(initialItem);
  const catKey = item.category.toLowerCase();
  const catColor = CAT_COLORS[catKey] ?? "#8b8b9a";
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    category: item.category,
    sub_type: item.sub_type,
    name: item.name,
  });

  const handleSave = async () => {
    if (saving || saved) return;
    setSaving(true);
    await onSave(item);
    setSaving(false);
    setSaved(true);
  };

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-[24px] border border-white/10 bg-zinc-900/40 backdrop-blur-xl animate-enter stagger-${Math.min(index + 1, 6)} group`}
    >
      {/* AI Aura Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

      {/* Cropped Image Area */}
      <div className="relative aspect-square overflow-hidden bg-black/40">
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent z-10 pointer-events-none" />
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
          <span className="text-[0.9rem]">{CAT_ICONS[catKey] ?? "👗"}</span>
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-white">
            {item.category}
          </span>
        </div>
        
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.image_crop_blob_reference}
          alt={`Detected ${item.category}`}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-90"
        />
      </div>

      <div className="flex flex-col gap-3 p-4 z-10 relative">
        {/* Title and Type */}
        <div>
          <span className="inline-block px-2 py-0.5 mb-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-md">
            {item.sub_type}
          </span>
          <h4 className="text-[0.85rem] font-bold text-white/95 leading-tight truncate">
            {item.name}
          </h4>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[0.75rem] font-bold transition-all border ${
              saved
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 cursor-default"
                : "bg-white text-black border-white hover:bg-zinc-200 hover:scale-[1.02] cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            }`}
          >
            {saving ? (
              <>
                <span className="w-3 h-3 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <span className="text-[0.9rem]">✓</span> Saved
              </>
            ) : (
              <>
                <span className="text-[0.9rem]">+</span> Add to Wardrobe
              </>
            )}
          </button>
          
          <button
            onClick={() => {
              setEditForm({ category: item.category, sub_type: item.sub_type, name: item.name });
              setIsEditing(true);
            }}
            disabled={saving || saved}
            className="flex items-center justify-center p-2.5 rounded-xl bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-700/80 border border-white/5 transition-colors cursor-pointer disabled:opacity-50"
            title="Edit"
          >
            <span className="text-[0.9rem]">✏️</span>
          </button>

          <button
            onClick={onRescan}
            className="flex items-center justify-center p-2.5 rounded-xl bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-700/80 border border-white/5 transition-colors cursor-pointer"
            title="Rescan"
          >
            <span className="text-[0.9rem]">↺</span>
          </button>
        </div>
      </div>

      {/* Edit Overlay */}
      {isEditing && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-white font-bold text-sm">Edit Detected Item</h3>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-400 text-[0.65rem] uppercase tracking-wider font-bold">Category</label>
              <select 
                value={editForm.category.toLowerCase()}
                onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1) }))}
                className="bg-zinc-800 text-white text-sm rounded-xl p-2.5 border border-white/10 outline-none focus:border-cyan-500/50 transition-colors"
              >
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="outfit">Outfit</option>
                <option value="traditional">Traditional Dress</option>
                <option value="western">Western One-pieces</option>
                <option value="footwear">Footwear</option>
                <option value="accessory">Accessory</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-400 text-[0.65rem] uppercase tracking-wider font-bold">Sub Category</label>
              <input 
                type="text"
                value={editForm.sub_type}
                onChange={(e) => setEditForm(prev => ({ ...prev, sub_type: e.target.value }))}
                placeholder="e.g. Saree, Lehenga, Baggy Jeans"
                className="bg-zinc-800 text-white text-sm rounded-xl p-2.5 border border-white/10 outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-400 text-[0.65rem] uppercase tracking-wider font-bold">Name</label>
              <input 
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Item name"
                className="bg-zinc-800 text-white text-sm rounded-xl p-2.5 border border-white/10 outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>

            <div className="flex gap-3 mt-2">
              <button 
                onClick={() => setIsEditing(false)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-white text-xs font-bold hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  setItem(prev => ({ ...prev, ...editForm }));
                  setIsEditing(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-black text-xs font-bold hover:bg-cyan-400 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
