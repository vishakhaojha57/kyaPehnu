// Centralized Design System Constants
// This file extracts hardcoded style values from the frontend components.

export const COLORS = {
  // Base Backgrounds
  base: "var(--bg-base)",        // #09090b
  surface: "var(--bg-surface)",  // #18181b
  elevated: "var(--bg-elevated)",// #27272a
  glassBackground: "rgba(12,12,15,0.85)",
  glassCard: "rgba(24, 24, 28, 0.40)",
  
  // Borders
  border: "var(--border)",       // rgba(255, 255, 255, 0.08)
  borderHover: "rgba(167, 139, 250, 0.3)",
  borderSubtle: "rgba(255,255,255,0.10)",
  borderLight: "rgba(255,255,255,0.12)",

  // Text
  textPrimary: "var(--text-primary)", // #f4f4f6
  textMuted: "var(--text-muted)",     // #8b8b9a / #9ca3af / #6b7280

  // Accents & Semantics
  accent: "var(--accent)",            // #a78bfa
  accentBlue: "#60a5fa",              // secondary accent color used in gradients
  success: "var(--success)",          // #34d399
  danger: "var(--danger)",            // #f87171
  warning: "var(--warning)",          // #fbbf24
  cyan: "var(--cyan)",                // #00f5ff

  // Glows / Shadows
  accentGlow: "var(--accent-glow)",   // rgba(167, 139, 250, 0.25)
  cyanGlow: "var(--cyan-glow)",       // rgba(0, 245, 255, 0.22)
  cyanBorder: "var(--cyan-border)",   // rgba(0, 245, 255, 0.40)
  shadowBase: "rgba(0,0,0,0.4)",
};

export const GRADIENTS = {
  primaryText: "linear-gradient(135deg, #f4f4f6 30%, #a78bfa 70%, #60a5fa 100%)",
  primaryBackground: "linear-gradient(135deg, #a78bfa 0%, #60a5fa 100%)",
  glassOverlay: "linear-gradient(135deg, rgba(0,245,255,0.06) 0%, rgba(167,139,250,0.06) 100%)",
};

export const TYPOGRAPHY = {
  fontFamily: "var(--font-geist-sans)",
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  }
};
