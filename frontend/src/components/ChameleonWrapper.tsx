/**
 * ChameleonWrapper — CSS Variable Injection Engine
 *
 * Architecture: Motion Value Tunnelling (zero React re-render for color updates)
 * ─────────────────────────────────────────────────────────────────────────────
 * The Naive approach would be: `useEffect(() => { setCssVar(color) }, [sensorData])`
 * That fires on every 10 Hz WebSocket message, even when the color hasn't changed.
 *
 * This implementation bypasses React's render cycle entirely:
 *
 * 1. `colorMV` — a Framer Motion `MotionValue<string>` seeded with the fallback color.
 * 2. `colorMV.on('change', ...)` — a subscriber that writes EVERY interpolated frame
 *    directly to `document.documentElement.style.setProperty('--theme-primary', v)`.
 *    This fires at 60 fps during a transition, but NEVER causes a React re-render.
 * 3. `animate(colorMV, target, { duration: 0.6 })` — triggered by `dominantColor` prop
 *    changes (~1 Hz from K-Means sampling). Only this outer effect depends on props.
 *
 * Derived variables (`--theme-glow`, `--theme-border`) are computed via CSS `color-mix()`
 * in globals.css referencing `var(--theme-primary)` — they update automatically through
 * the CSS cascade without any additional JS.
 *
 * Saturation Guard:
 * ─────────────────
 * K-Means on an office environment will frequently extract grey walls, white shirts, or
 * near-black backgrounds. These produce ugly, de-themed UIs. The guard converts the
 * incoming HEX to HSL and rejects it if:
 *   - Saturation < SATURATION_THRESHOLD (15 %) — too grey / achromatic
 *   - Lightness  < LIGHTNESS_MIN        (10 %) — too dark to produce visible glow
 * Rejected colors hold the last known vivid color, maintaining theme continuity.
 */

"use client";

import { useEffect, useRef } from "react";
import { animate, useMotionValue } from "framer-motion";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Initial/fallback color when no vivid color has been received yet.
 * Matches --color-accent in globals.css so the UI is never visually blank.
 */
const FALLBACK_COLOR = "#00d4ff";

/**
 * Minimum HSL saturation percentage (0–100) for a color to be considered vivid.
 * Colors below this threshold are too grey/achromatic to produce a useful theme.
 */
const SATURATION_THRESHOLD = 15;

/**
 * Minimum HSL lightness percentage (0–100) to accept a color.
 * Near-black colors produce invisible glows and muddy borders.
 */
const LIGHTNESS_MIN = 10;

/**
 * Framer Motion animation config for all chameleon color transitions.
 * 0.6 s ease-in-out matches the "premium kinetic minimalist" aesthetic.
 */
const TRANSITION = { duration: 0.6, ease: "easeInOut" } as const;

// ── Saturation Guard Utilities ────────────────────────────────────────────────

/**
 * Converts a 7-char HEX string (`#RRGGBB`) to an HSL object.
 * Returns null if the string is malformed.
 */
function hexToHsl(
  hex: string
): { h: number; s: number; l: number } | null {
  const match = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return null;

  const r = parseInt(match[1], 16) / 255;
  const g = parseInt(match[2], 16) / 255;
  const b = parseInt(match[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) {
    // Achromatic — perfectly grey, saturation is 0
    return { h: 0, s: 0, l: l * 100 };
  }

  const s =
    l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / delta + 2) / 6;
      break;
    default: // b
      h = ((r - g) / delta + 4) / 6;
      break;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Returns true if the color is vivid enough to use as a Chameleon theme.
 * False = too grey, too dark, or malformed.
 */
function isVividColor(hex: string): boolean {
  const hsl = hexToHsl(hex);
  if (!hsl) return false;
  return hsl.s >= SATURATION_THRESHOLD && hsl.l >= LIGHTNESS_MIN;
}

/**
 * Applies the saturation guard and updates the lastVivid ref.
 * Returns the color that should actually be animated to.
 *
 * @param incoming   - The new HEX string from the WebSocket
 * @param lastVivid  - The last accepted vivid color (mutable ref value)
 * @returns          - The target HEX to animate to, and whether it was accepted
 */
function guardedColor(
  incoming: string,
  lastVivid: string
): { target: string; accepted: boolean } {
  if (isVividColor(incoming)) {
    return { target: incoming, accepted: true };
  }
  // Reject: return the last known good color so the theme stays stable
  return { target: lastVivid, accepted: false };
}

// ── Component Props ───────────────────────────────────────────────────────────

export interface ChameleonWrapperProps {
  /**
   * The dominant HEX color string from `useSecurityState().dominantColor`.
   * Updates at ~1 Hz (rate-limited by K-Means on the Python backend).
   * Null until the first WebSocket message arrives.
   */
  dominantColor: string | null;
  children: React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChameleonWrapper({
  dominantColor,
  children,
}: ChameleonWrapperProps) {
  // The MotionValue holds the current (or interpolating) HEX color string.
  // It is initialized to FALLBACK_COLOR, which matches --theme-primary in globals.css,
  // so there is zero visual jump when the first real color arrives.
  const colorMV = useMotionValue<string>(FALLBACK_COLOR);

  // Stores the last accepted vivid color. Initialized to FALLBACK_COLOR.
  // Using a ref (not state) so updates never trigger re-renders.
  const lastVividRef = useRef<string>(FALLBACK_COLOR);

  // ── Effect 1: CSS variable writer (mount-once subscription) ─────────────
  // Subscribes to the MotionValue and writes every interpolated frame to the
  // CSS variable. This is the core of the "zero React re-render" architecture.
  // The subscriber fires at 60 fps during a transition, at 0 fps when idle.
  useEffect(() => {
    const unsubscribe = colorMV.on("change", (value: string) => {
      document.documentElement.style.setProperty("--theme-primary", value);
      // NOTE: --theme-glow and --theme-border are derived automatically in CSS
      // via `color-mix(in srgb, var(--theme-primary) N%, transparent)`.
      // No additional JS writes are needed for the derived tokens.
    });

    // Write the initial value immediately so the variable is set on first paint,
    // even before any dominantColor prop arrives.
    document.documentElement.style.setProperty(
      "--theme-primary",
      colorMV.get()
    );

    return unsubscribe;
  }, [colorMV]); // colorMV is stable across renders — this runs exactly once.

  // ── Effect 2: Chameleon color animator (~1 Hz) ───────────────────────────
  // Watches only `dominantColor`. Because K-Means on the backend runs at 1 Hz,
  // this fires at ~1 Hz — not the 10 Hz WebSocket rate. This is the critical
  // optimization that eliminates re-render bloat.
  useEffect(() => {
    if (!dominantColor) return;

    const { target, accepted } = guardedColor(
      dominantColor,
      lastVividRef.current
    );

    // Update the last-vivid memory only when the guard accepted the new color.
    if (accepted) {
      lastVividRef.current = dominantColor;
    }

    // Skip animation if the target is identical to the current value
    // (e.g., saturation guard fired and lastVivid hasn't changed).
    if (target === colorMV.get()) return;

    // animate() returns a cancel function. We don't need to cancel mid-transition
    // because the next animate() call will naturally override the previous one.
    animate(colorMV, target, TRANSITION);
  }, [dominantColor, colorMV]);

  // ChameleonWrapper renders no DOM of its own — it is a pure side-effect shell.
  return <>{children}</>;
}
