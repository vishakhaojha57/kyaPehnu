/**
 * useLensStream – Hardware-Stream Separation Hook
 * ─────────────────────────────────────────────────────────────────────────────
 * Binds the device camera entirely through native browser
 * navigator.mediaDevices.getUserMedia. The MediaStream instance is held in a
 * plain ref — never stored in any external state module, Redux slice, or
 * context provider — to prevent animation frame drops or hardware locking bugs.
 *
 * Contract:
 *  • streamRef   — attach to <video>.srcObject directly (no copy, no clone)
 *  • videoRef    — convenience ref for the <video> element itself
 *  • active      — boolean: true while tracks are live
 *  • error       — null | string from getUserMedia rejection
 *  • start()     — acquires camera; idempotent if already running
 *  • stop()      — stops ALL tracks and clears the ref
 */

"use client";

import { useRef, useState, useCallback } from "react";

export interface LensStreamHandle {
  streamRef: React.MutableRefObject<MediaStream | null>;
  videoRef:  React.RefObject<HTMLVideoElement | null>;
  active:    boolean;
  error:     string | null;
  start:     () => Promise<void>;
  stop:      () => void;
}

const LENS_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: "environment",    // rear cam preferred; falls back to front
    width:      { ideal: 1280 },
    height:     { ideal: 720  },
  },
  audio: false,                   // wardrobe app never needs audio
};

export function useLensStream(): LensStreamHandle {
  // Raw stream ref — deliberately NOT useState so mutations never trigger re-renders
  const streamRef = useRef<MediaStream | null>(null);
  // Video element ref — component attaches srcObject here
  const videoRef  = useRef<HTMLVideoElement | null>(null);

  const [active, setActive] = useState(false);
  const [error,  setError ] = useState<string | null>(null);

  const start = useCallback(async () => {
    // Idempotent: if tracks are already live, do nothing
    if (streamRef.current?.active) return;

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(LENS_CONSTRAINTS);
      streamRef.current = stream;

      // Attach to video element if already mounted
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setActive(true);
    } catch (err: unknown) {
      const msg =
        err instanceof DOMException
          ? `Camera denied: ${err.name} — ${err.message}`
          : err instanceof Error
          ? err.message
          : "Unknown getUserMedia error";
      setError(msg);
      setActive(false);
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setActive(false);
  }, []);

  return { streamRef, videoRef, active, error, start, stop };
}
