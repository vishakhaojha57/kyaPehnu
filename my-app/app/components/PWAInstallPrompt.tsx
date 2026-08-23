"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Download, Share, PlusSquare, X, Smartphone, Monitor, CheckCircle2 } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [installedSuccessfully, setInstalledSuccessfully] = useState(false);

  useEffect(() => {
    // Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[KyaPehnu] Service worker registered with scope:", reg.scope);
        })
        .catch((err) => {
          console.warn("[KyaPehnu] Service worker registration error:", err);
        });
    }

    // Check if already in standalone / PWA mode
    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(isStandaloneMode);

    // Check if device is iOS (iPhone/iPad/iPod)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Check if previously dismissed in this session
    const dismissed = sessionStorage.getItem("kyapehnu_pwa_dismissed");
    if (dismissed) {
      setIsDismissed(true);
    }

    // Capture standard PWA install prompt (Chrome / Edge / Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setInstalledSuccessfully(true);
      setTimeout(() => setInstalledSuccessfully(false), 5000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    // Listen for custom trigger from sidebar or header button
    const handleCustomTrigger = () => {
      if (deferredPrompt) {
        handleInstallClick();
      } else if (isIosDevice) {
        setShowIOSModal(true);
      } else {
        setShowIOSModal(true); // show general guidance
      }
    };
    window.addEventListener("trigger-pwa-install", handleCustomTrigger);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("trigger-pwa-install", handleCustomTrigger);
    };
  }, [deferredPrompt]);

  const handleInstallClick = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstalledSuccessfully(true);
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      setShowIOSModal(true);
    } else {
      setShowIOSModal(true);
    }
  }, [deferredPrompt, isIOS]);

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem("kyapehnu_pwa_dismissed", "true");
  };

  if (isStandalone) return null;

  return (
    <>
      {/* Floating Install Banner (Visible on mobile/desktop browsers until dismissed or installed) */}
      {!isDismissed && (deferredPrompt || isIOS) && (
        <div
          role="region"
          aria-label="Install KyaPehnu App"
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 z-50 max-w-md animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-zinc-900/90 backdrop-blur-xl border border-cyan-500/30 shadow-[0_8px_32px_rgba(0,245,255,0.15)] text-white">
            <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 border border-cyan-400/40 shadow-[0_0_12px_rgba(0,245,255,0.3)]">
              <Image
                src="/app-logo.png"
                alt="KyaPehnu Icon"
                width={44}
                height={44}
                className="object-cover w-full h-full"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-white">KyaPehnu</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                  PWA
                </span>
              </div>
              <p className="text-xs text-zinc-400 truncate">
                Install for instant full-screen AI styling
              </p>
            </div>
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500 text-white text-xs font-semibold shadow-md transition-transform active:scale-95 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install</span>
            </button>
            <button
              onClick={handleDismiss}
              aria-label="Dismiss banner"
              className="p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {installedSuccessfully && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 shadow-xl backdrop-blur-md">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span className="text-sm font-medium">KyaPehnu installed successfully!</span>
        </div>
      )}

      {/* iOS / Browser Install Instructions Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-6 text-white shadow-2xl">
            <button
              onClick={() => setShowIOSModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-zinc-800/80 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="relative w-16 h-16 rounded-2xl overflow-hidden mb-3.5 border border-cyan-400/40 shadow-[0_0_20px_rgba(0,245,255,0.25)]">
                <Image
                  src="/app-logo.png"
                  alt="KyaPehnu App Icon"
                  width={64}
                  height={64}
                  className="object-cover w-full h-full"
                />
              </div>
              <h3 className="text-lg font-bold tracking-tight">Install KyaPehnu</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-[260px]">
                Enjoy lightning-fast access, native gesture navigation, and offline intelligence.
              </p>
            </div>

            <div className="mt-5 space-y-3 text-left">
              {isIOS ? (
                <>
                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-zinc-800/50 border border-zinc-800">
                    <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 flex-shrink-0 mt-0.5">
                      <Share className="w-4 h-4" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-zinc-200">Step 1: </span>
                      Tap the <strong className="text-cyan-300">Share</strong> button in your Safari navigation bar.
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-zinc-800/50 border border-zinc-800">
                    <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400 flex-shrink-0 mt-0.5">
                      <PlusSquare className="w-4 h-4" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-zinc-200">Step 2: </span>
                      Scroll down and tap <strong className="text-violet-300">Add to Home Screen</strong>.
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-zinc-800/50 border border-zinc-800">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 flex-shrink-0 mt-0.5">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-zinc-200">Step 3: </span>
                      Tap <strong className="text-emerald-300">Add</strong> in top right. Launch KyaPehnu anytime!
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-zinc-800/50 border border-zinc-800">
                    <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 flex-shrink-0 mt-0.5">
                      <Monitor className="w-4 h-4" />
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-zinc-200">Browser Install: </span>
                      Click the <strong className="text-cyan-300">Install icon</strong> in your browser address bar or menu.
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="mt-6 w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 font-semibold text-xs text-zinc-200 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Utility function to dispatch install trigger from anywhere in the app
 */
export function triggerPWAInstall() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trigger-pwa-install"));
  }
}
