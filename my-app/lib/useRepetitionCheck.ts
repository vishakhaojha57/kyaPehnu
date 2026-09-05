"use client";

import { useEffect, useState } from "react";
import { checkRepetition } from "./api";
import type { RepetitionCheckResponse } from "./types";

export function useRepetitionCheck(
  topId: string | undefined,
  bottomId: string | undefined,
  userId?: string
) {
  const [data, setData] = useState<RepetitionCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!topId || !bottomId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    checkRepetition(topId, bottomId, userId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [topId, bottomId, userId]);

  return { data, loading };
}
