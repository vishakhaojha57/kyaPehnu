"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[KyaPehnu] SW registered:", reg.scope);
        })
        .catch((err) => {
          console.warn("[KyaPehnu] SW registration failed:", err);
        });
    }
  }, []);

  return null;
}
