/**
 * GlassOverlay — Security State Content Filter
 *
 * Redesigned per UI Enhancement Master Plan §6.10:
 *   BLURRED: blur(20px) grayscale(0.6) brightness(0.75) — more "frosted", less aggressive
 *   LOCKED: blur(32px) grayscale(0.9) brightness(0.35) scale(0.985) — slight zoom-out for depth
 *   Transition: 500ms with cubic-bezier(0.33, 1, 0.68, 1) — faster start, soft land
 *
 * Architecture: CSS `filter` on a containing motion.div (NOT backdrop-filter).
 * The lock screen (<LockScreen />) lives OUTSIDE this component in the parent tree,
 * keeping it unblurred and fully interactive.
 */

"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import type { Transition } from "framer-motion";
import type { SecurityState } from "@/hooks/useSecurityState";

// ── Framer Motion Variants ───────────────────────────────────────────────────

const overlayVariants = {
  SECURE: {
    filter: "blur(0px) grayscale(0) brightness(1)",
    opacity: 1,
    scale: 1,
  },
  BLURRED: {
    // Refined: slightly less aggressive, more "frosted glass" feeling
    filter: "blur(20px) grayscale(0.6) brightness(0.75)",
    opacity: 0.9,
    scale: 1.005,
  },
  LOCKED: {
    // Slightly zoom-out adds physical depth perception
    filter: "blur(32px) grayscale(0.9) brightness(0.35)",
    opacity: 0.5,
    scale: 0.985,
  },
} as const;

// Faster start, soft landing — feels responsive to the physical trigger
const overlayTransition: Transition = {
  duration: 0.5,
  ease: [0.33, 1, 0.68, 1],
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface GlassOverlayProps {
  /** Current system security state — drives which Framer Motion variant is active. */
  securityState: SecurityState;
  children: React.ReactNode;
  /** Optional additional className applied to the inner wrapper. */
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

// ⚡ Bolt Performance Optimization:
// Memoized GlassOverlay to prevent re-renders on high-frequency websocket ticks.
// Note: Parent components must pass stable `children` references for this optimization to be effective.
export const GlassOverlay = memo(function GlassOverlay({
  securityState,
  children,
  className = "",
}: GlassOverlayProps) {
  return (
    <motion.div
      animate={securityState}
      variants={overlayVariants}
      transition={overlayTransition}
      className={`w-full origin-center ${className}`}
      style={{
        pointerEvents: securityState === "SECURE" ? "auto" : "none",
        willChange: "filter, opacity, transform",
      }}
    >
      {children}
    </motion.div>
  );
});
