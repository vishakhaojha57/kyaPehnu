"use client";

/**
 * ServiceWorkerRegistrar — NO-OP
 * ─────────────────────────────────────────────────────────────────────────────
 * Service worker registration is now handled solely by @ducanh2912/next-pwa
 * (register: true in next.config.ts). This component previously duplicated
 * that registration (along with PWAInstallPrompt.tsx), causing /sw.js to be
 * registered 3× concurrently — contributing to instability.
 *
 * Kept as a no-op shell so existing imports in layout.tsx don't break.
 */
export function ServiceWorkerRegistrar() {
  return null;
}
