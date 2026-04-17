/**
 * ChameleonWrapper — CSS Variable Injection Engine (v2 — Background Mode)
 *
 * Architecture: Motion Value Tunnelling (zero React re-render for color updates)
 * ─────────────────────────────────────────────────────────────────────────────
 * v2 changes vs v1:
 *   1. The backend now snaps colours to a curated 20-entry vivid palette, so
 *      the saturation guard is no longer needed — every incoming colour is
 *      guaranteed vivid.
 *   2. In addition to `--theme-primary` (accent/glow/border), we now also
 *      write `--chameleon-bg` — a darkened tint of the dominant colour that
 *      the page background uses.  Because the page background lives OUTSIDE
 *      GlassOverlay, the colour shift is visible even when the screen is
 *      blurred (no face detected).
 *   3. Transition duration increased to 0.8 s for a more dramatic effect.
 */

"use client";

import { useEffect, useRef, memo } from "react";
import { animate, useMotionValue } from "framer-motion";

// ── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_COLOR = "#00d4ff";

/** Framer Motion transition config for chameleon color changes. */
const TRANSITION = { duration: 0.8, ease: "easeInOut" } as const;

// ── Colour Utilities ──────────────────────────────────────────────────────────

/**
 * Parse a `#RRGGBB` hex string into [r, g, b] (0-255).
 */
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/**
 * Darken an RGB colour to produce a page-background-safe tint.
 * Mixes `ratio` of the colour with black, ensuring we stay in the
 * dark-theme range while still being visibly tinted.
 */
function darkenForBackground(hex: string, ratio = 0.18): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#0d0d0d";
  const r = Math.round(rgb[0] * ratio);
  const g = Math.round(rgb[1] * ratio);
  const b = Math.round(rgb[2] * ratio);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ── Component Props ───────────────────────────────────────────────────────────

export interface ChameleonWrapperProps {
  dominantColor: string | null;
  children: React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

// ⚡ Bolt Performance Optimization:
// Memoized ChameleonWrapper to prevent re-renders on high-frequency websocket ticks.
// Note: Parent components must pass stable `children` references for this optimization to be effective.
export const ChameleonWrapper = memo(function ChameleonWrapper({
  dominantColor,
  children,
}: ChameleonWrapperProps) {
  const colorMV = useMotionValue<string>(FALLBACK_COLOR);
  const bgMV = useMotionValue<string>(darkenForBackground(FALLBACK_COLOR));
  const lastColorRef = useRef<string>(FALLBACK_COLOR);

  // ── Effect 1: CSS variable writers (mount-once subscriptions) ───────────
  useEffect(() => {
    const unsub1 = colorMV.on("change", (value: string) => {
      document.documentElement.style.setProperty("--theme-primary", value);
    });
    const unsub2 = bgMV.on("change", (value: string) => {
      document.documentElement.style.setProperty("--chameleon-bg", value);
    });

    // Write initial values immediately.
    document.documentElement.style.setProperty("--theme-primary", colorMV.get());
    document.documentElement.style.setProperty("--chameleon-bg", bgMV.get());

    return () => {
      unsub1();
      unsub2();
    };
  }, [colorMV, bgMV]);

  // ── Effect 2: Chameleon color animator (~1 Hz) ───────────────────────────
  useEffect(() => {
    if (!dominantColor) return;

    // Skip if identical to last accepted color (no visual change needed).
    if (dominantColor === lastColorRef.current) return;
    lastColorRef.current = dominantColor;

    // Animate accent colour.
    animate(colorMV, dominantColor, TRANSITION);

    // Animate background to a dark tint of the new colour.
    const bgTarget = darkenForBackground(dominantColor);
    animate(bgMV, bgTarget, TRANSITION);
  }, [dominantColor, colorMV, bgMV]);

  return <>{children}</>;
});
