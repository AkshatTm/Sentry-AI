/**
 * GlassOverlay — Security State Content Filter
 *
 * Architecture: CSS `filter` on a containing motion.div (NOT backdrop-filter).
 * ─────────────────────────────────────────────────────────────────────────────
 * Chosen over backdrop-filter for three reasons:
 *   1. CSS filter on a container consistently animates in Framer Motion via
 *      the `animate` prop without requiring opacity hacks.
 *   2. The lock screen (<LockScreen />) lives OUTSIDE this component in the
 *      parent tree, keeping it unblurred and fully interactive.
 *   3. `filter: grayscale()` desaturates the entire content zone uniformly,
 *      reinforcing "session inactive" semantics beyond just blur.
 *
 * Variants:
 * ┌─────────┬──────────────────────────────────────────┬──────────────────┐
 * │ State   │ CSS Filter                               │ Meaning          │
 * ├─────────┼──────────────────────────────────────────┼──────────────────┤
 * │ SECURE  │ blur(0)  grayscale(0)                    │ Full clarity     │
 * │ BLURRED │ blur(24px) grayscale(80%)                │ Data hidden      │
 * │ LOCKED  │ blur(40px) grayscale(100%) brightness(40%)│ Maximally opaque│
 * └─────────┴──────────────────────────────────────────┴──────────────────┘
 *
 * The LOCKED variant is intentionally aggressive — the <LockScreen /> overlay
 * will be rendered on top of it in the parent, so the content never needs to
 * be legible while locked.
 *
 * Transition: 400 ms ease-in-out. Fast enough to feel responsive to a physical
 * trigger (second face entering frame), slow enough to feel premium.
 */

"use client";

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
    filter: "blur(24px) grayscale(0.8) brightness(0.7)",
    opacity: 0.85,
    scale: 1.01, // Subtle micro-scale makes the blur look intentional, not broken
  },
  LOCKED: {
    filter: "blur(40px) grayscale(1) brightness(0.4)",
    opacity: 0.5,
    scale: 1.02,
  },
} as const;

const overlayTransition: Transition = {
  duration: 0.4,
  ease: "easeInOut",
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

export function GlassOverlay({
  securityState,
  children,
  className = "",
}: GlassOverlayProps) {
  return (
    <motion.div
      // Framer Motion reads `animate` as either a variant name or an inline object.
      // Passing the variant name allows Framer to interpolate between named states.
      animate={securityState}
      variants={overlayVariants}
      transition={overlayTransition}
      // `transformOrigin: center` ensures the micro-scale variant looks natural
      className={`w-full origin-center ${className}`}
      // Disable pointer events when blurred — prevents users from accidentally
      // clicking on obscured elements and reveals content positions via hover.
      style={{
        pointerEvents: securityState === "SECURE" ? "auto" : "none",
        willChange: "filter, opacity, transform",
      }}
    >
      {children}
    </motion.div>
  );
}
