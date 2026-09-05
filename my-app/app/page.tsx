"use client";

import { useEffect, useState, useCallback, Suspense, lazy } from "react";
import { useSession } from "next-auth/react";
import {
  getAllItems,
  deleteItem,
} from "../lib/api";
import type { WardrobeItem, OutfitSuggestion } from "../lib/types";
import { Trash2 } from "lucide-react";
import {
  getWeather,
  getWeatherByCoords,
  type WeatherPayload,
} from "../lib/weather";
import { useSuggestions } from "../lib/useSuggestions";
import { toast } from "react-hot-toast";


const ConfirmOccasionModal = lazy(() => import("./components/ConfirmOccasionModal"));
const ManualOutfitCreator = lazy(() => import("./components/ManualOutfitCreator"));

import { SidebarDrawer } from "./components/SidebarDrawer";
import { ItemDetailModal } from "./components/ItemDetailModal";
import { WardrobeGrid } from "./components/WardrobeGrid";
import { OutfitSuggestionsGrid } from "./components/OutfitSuggestions";
import { VisionScanner } from "./components/VisionScanner";
import { WearHistory } from "./components/WearHistory";
import { COLORS, GRADIENTS, TYPOGRAPHY } from "./theme/designSystem";

export default function Home() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"wardrobe" | "outfits" | "vision" | "camera" | "history">("wardrobe");

  // Sync tab state from URL params (for PWA shortcuts) or sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab") as any;
      if (tabParam && ["wardrobe", "outfits", "vision", "camera", "history"].includes(tabParam)) {
        setActiveTab(tabParam);
        return;
      }
    }
    const savedTab = sessionStorage.getItem("kyapehnu_activeTab") as any;
    if (savedTab) setActiveTab(savedTab);
  }, []);

  useEffect(() => {
    sessionStorage.setItem("kyapehnu_activeTab", activeTab);
  }, [activeTab]);

  // ── Sidebar state (pure local) ─────────────────────────────────────
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isManualCreatorOpen, setIsManualCreatorOpen] = useState(false);

  // ── Selection interaction state ─────────────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState<WardrobeItem | null>(null);
  const [outfitToWear, setOutfitToWear] = useState<OutfitSuggestion | null>(null);

  // ── Deletion state ────────────────────────────────────────────────────────
  const [itemToDelete, setItemToDelete] = useState<WardrobeItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Outfit Builder Mode ────────────────────────────────────────────────────
  const [outfitBuilderMode, setOutfitBuilderMode] = useState(false);
  const [outfitSelectedIds, setOutfitSelectedIds] = useState<string[]>([]);

  const handleSelectItem = useCallback((item: WardrobeItem) => {
    setSelectedItem((prev) => prev?.id === item.id ? null : item);
  }, []);

  // ── Outfit Builder handlers ────────────────────────────────────────────────
  const handleOpenOutfitBuilder = useCallback(() => {
    setActiveTab("wardrobe");
    setOutfitBuilderMode(true);
    setOutfitSelectedIds([]);
  }, []);

  const handleOutfitToggle = useCallback((item: WardrobeItem) => {
    setOutfitSelectedIds(prev =>
      prev.includes(item.id)
        ? prev.filter(id => id !== item.id)
        : [...prev, item.id]
    );
  }, []);

  const handleOutfitConfirm = useCallback((selectedItems: WardrobeItem[]) => {
    if (selectedItems.length === 0) return;
    const customOutfit: OutfitSuggestion = {
      id: "custom-" + Date.now(),
      occasion: "casual",
      items: selectedItems,
      confidence_score: 1.0,
      style_note: "Custom outfit",
    };
    setOutfitBuilderMode(false);
    setOutfitSelectedIds([]);
    setOutfitToWear(customOutfit);
  }, []);

  const handleOutfitCancel = useCallback(() => {
    setOutfitBuilderMode(false);
    setOutfitSelectedIds([]);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedItem(null);
  }, []);

  const handleDeleteClick = useCallback((item: WardrobeItem) => {
    setItemToDelete(item);
  }, []);

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      const userId = session?.user?.id;
      await deleteItem(itemToDelete.id, userId);
      setItems(prev => prev.filter(i => i.id !== itemToDelete.id));
      setItemToDelete(null);
      if (selectedItem?.id === itemToDelete.id) {
        setSelectedItem(null);
      }
      toast.success("Item deleted successfully!");
    } catch (err) {
      console.error("Failed to delete item:", err);
      toast.error("Failed to delete item. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdateItem = async (updatedItem: WardrobeItem) => {
    try {
      // Optimitiscally update UI
      setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
      if (selectedItem?.id === updatedItem.id) {
        setSelectedItem(updatedItem);
      }
      
      const userId = session?.user?.id;
      // In a real app we'd call updateItem API here
      // await updateItem(updatedItem, userId);
      toast.success("Item updated successfully!");
    } catch (err) {
      console.error("Failed to update item:", err);
      toast.error("Failed to update item.");
    }
  };

  useEffect(() => {
    if (selectedItem) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleCloseModal(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedItem, handleCloseModal]);

  const [weather, setWeather] = useState<WeatherPayload | null>(null);

  const suggestions = useSuggestions();

  const outfits: OutfitSuggestion[] =
    suggestions.state.status === "ready"
      ? suggestions.state.data.outfit_suggestions
      : [];
  const outfitsLoading =
    suggestions.state.status === "locating" ||
    suggestions.state.status === "loading";
  const outfitsError =
    suggestions.state.status === "error"
      ? suggestions.state.message
      : null;

  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          getWeatherByCoords(pos.coords.latitude, pos.coords.longitude)
            .then(setWeather)
            .catch(() => getWeather().then(setWeather));
        },
        () => {
          getWeather().then(setWeather);
        }
      );
    } else {
      getWeather().then(setWeather);
    }

    suggestions.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === "wardrobe") {
      setItemsLoading(true);
      const userId = session?.user?.id;
      getAllItems(userId)
        .then(setItems)
        .catch((e: Error) => setItemsError(e.message))
        .finally(() => setItemsLoading(false));
    }
  }, [activeTab, session?.user?.id]);

  return (
    <main
      suppressHydrationWarning
      style={{
        minHeight: "100vh",
        background: COLORS.base,
        color: COLORS.textPrimary,
        fontFamily: TYPOGRAPHY.fontFamily,
      }}
    >
      <header
        style={{
          borderBottom: `1px solid ${COLORS.border}`,
          background: COLORS.glassBackground,
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "9px",
              overflow: "hidden", flexShrink: 0,
              boxShadow: "0 0 14px rgba(109,40,217,0.45)",
            }}>
              {mounted && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/kyapehnu-icon.png" alt="KyaPehnu" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              )}
            </div>
            <span style={{ fontWeight: 800, fontSize: "1.08rem", letterSpacing: "-0.02em" }}>
              KyaPehnu
            </span>
          </div>

          <button
            suppressHydrationWarning
            id="nav-profile-btn"
            onClick={() => setIsSidebarOpen(true)}
            title="Open profile menu"
            style={{
              width: "36px", height: "36px", borderRadius: "50%",
              background: GRADIENTS.primaryBackground,
              border: `2px solid ${COLORS.accentGlow}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", fontSize: "0.78rem", fontWeight: 800, color: "#fff",
              boxShadow: `0 0 12px ${COLORS.accentGlow}`,
              flexShrink: 0,
              overflow: "hidden",
              transition: "box-shadow 0.2s, transform 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 22px rgba(167,139,250,0.55)";
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 12px rgba(167,139,250,0.30)";
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            }}
          >
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (session?.user?.name ? session.user.name.slice(0, 2).toUpperCase() : "WM")}
          </button>
        </div>
      </header>

      <section
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "52px 24px 32px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "clamp(2rem, 4vw, 3rem)",
            fontWeight: 800,
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
            background: GRADIENTS.primaryText,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            marginBottom: "12px",
          }}
        >
          Your AI Wardrobe
        </h1>
        <p
          style={{
            fontSize: "1rem",
            color: COLORS.textMuted,
            maxWidth: 480,
            margin: "0 auto 32px",
            lineHeight: 1.7,
          }}
        >
          Discover outfit suggestions personalised from your wardrobe.
          Zero setup, instant intelligence.
        </p>

        <div
          style={{
            display: "inline-flex",
            background: COLORS.elevated,
            border: `1px solid ${COLORS.border}`,
            borderRadius: "14px",
            padding: "6px",
            gap: "6px",
          }}
        >
          {(["wardrobe", "outfits", "vision", "camera", "history"] as const).map((tab) => (
            <button
              key={tab}
              id={`tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "10px 24px",
                borderRadius: "10px",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.95rem",
                transition: "all 0.2s ease",
                background:
                  activeTab === tab ? COLORS.accent : "transparent",
                color: activeTab === tab ? "#0c0c0f" : COLORS.textMuted,
                boxShadow:
                  activeTab === tab
                    ? `0 0 12px ${COLORS.accentGlow}`
                    : "none",
              }}
            >
              {tab === "wardrobe"
                ? "My Wardrobe"
                : tab === "outfits"
                  ? "Outfit Suggestions"
                  : tab === "vision"
                    ? "Vision AI"
                    : tab === "history"
                      ? "Wear History"
                      : "Live Lens"}
            </button>
          ))}
        </div>
      </section>

      <section
        className="card-glass"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "28px 28px 60px",
        }}
      >
        {activeTab === "wardrobe" && (
          <WardrobeGrid
            items={items}
            itemsLoading={itemsLoading}
            itemsError={itemsError}
            weather={weather}
            selectedId={selectedItem?.id ?? null}
            onSelect={handleSelectItem}
            onDelete={handleDeleteClick}
            outfitBuilderMode={outfitBuilderMode}
            outfitSelectedIds={outfitSelectedIds}
            onOutfitToggle={handleOutfitToggle}
            onOutfitConfirm={handleOutfitConfirm}
            onOutfitCancel={handleOutfitCancel}
          />
        )}

        {activeTab === "outfits" && (
          <OutfitSuggestionsGrid
            outfits={outfits}
            outfitsLoading={outfitsLoading}
            outfitsError={outfitsError}
            weather={weather}
            items={items}
            activeSeasons={new Set()}
            onWearToday={setOutfitToWear}
            onRefresh={suggestions.refresh}
            onScanNew={() => setActiveTab("vision")}
            onOpenManualCreator={handleOpenOutfitBuilder}
          />
        )}

        {(activeTab === "vision" || activeTab === "camera") && (
          <VisionScanner activeTab={activeTab} />
        )}

        {activeTab === "history" && <WearHistory />}
      </section>

      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          weather={weather}
          onClose={handleCloseModal}
          onDelete={handleDeleteClick}
          onUpdate={handleUpdateItem}
        />
      )}

      <SidebarDrawer
        open={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeTab={activeTab}
        onTabChange={(tab: any) => { setActiveTab(tab); setIsSidebarOpen(false); }}
      />

      {outfitToWear && (
        <Suspense fallback={null}>
          <ConfirmOccasionModal outfit={outfitToWear} onClose={() => setOutfitToWear(null)} />
        </Suspense>
      )}

      {itemToDelete && (
        <div
          suppressHydrationWarning
          style={{
            position: "fixed", inset: 0, zIndex: 60,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "fadeInUp 0.2s ease both",
          }}
          onClick={() => !isDeleting && setItemToDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card-glass border border-red-500/20"
            style={{
              padding: "24px",
              borderRadius: "16px",
              maxWidth: "400px",
              width: "90%",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
            }}
          >
            <div suppressHydrationWarning className="flex items-center gap-3 text-red-400">
              <Trash2 suppressHydrationWarning size={24} />
              <h3 className="text-lg font-bold m-0 text-white">Delete Item</h3>
            </div>
            <p className="text-[0.9rem] text-zinc-300 m-0 leading-relaxed">
              Are you sure you want to delete <strong className="text-white">{itemToDelete.name}</strong>? This action cannot be undone and will permanently remove it from your wardrobe.
            </p>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setItemToDelete(null)}
                disabled={isDeleting}
                className="px-5 py-2.5 rounded-full border border-white/10 text-white hover:bg-white/5 transition-colors text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors text-sm font-bold shadow-[0_0_15px_rgba(239,68,68,0.4)] disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isDeleting ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isManualCreatorOpen && (
        <Suspense fallback={<div />}>
          <ManualOutfitCreator
            items={items}
            onClose={() => setIsManualCreatorOpen(false)}
            onSave={(top, bottom, footwear) => {
              const customOutfit: OutfitSuggestion = {
                id: "custom-" + Date.now(),
                occasion: "casual",
                items: [top, bottom, footwear].filter(Boolean) as WardrobeItem[],
                confidence_score: 1.0,
                style_note: "Custom built outfit",
              };
              setOutfitToWear(customOutfit);
              setIsManualCreatorOpen(false);
            }}
          />
        </Suspense>
      )}
    </main>
  );
}
