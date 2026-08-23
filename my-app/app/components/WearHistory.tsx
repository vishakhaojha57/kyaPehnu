import React, { Suspense, lazy } from "react";

const WearHistoryView = lazy(() => import("./WearHistoryView"));

export function WearHistory() {
  return (
    <Suspense
      fallback={
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Loading History module…
        </div>
      }
    >
      <WearHistoryView />
    </Suspense>
  );
}
