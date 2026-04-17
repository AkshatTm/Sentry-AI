/**
 * GradientMesh — Animated 3-color gradient mesh background
 *
 * Replaces the static dot grid on login/setup pages with a slow-drifting
 * gradient mesh that feels organic and alive. Three blurred color blobs drift
 * independently on a 15–25s cycle, creating depth without looking templated.
 *
 * Uses CSS keyframe animations for performance (no JS RAF required).
 */
"use client";

import { memo } from "react";
import { motion } from "framer-motion";

interface GradientMeshProps {
  /** Optional opacity multiplier for the overall layer. Default: 1 */
  opacity?: number;
}

// ⚡ Bolt Performance Optimization:
// Memoized GradientMesh to prevent expensive re-renders on high-frequency websocket ticks.
// This is a static component and should only render once.
export const GradientMesh = memo(function GradientMesh({ opacity = 1 }: GradientMeshProps) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        opacity,
      }}
    >
      {/* Base radial shadow on the page center — theme color */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 65% 50% at 50% 35%, var(--theme-glow) 0%, transparent 70%)",
          opacity: 0.5,
          transition: "opacity 0.8s ease",
        }}
      />

      {/* Blob 1 — primary color, top-left, slow drift */}
      <motion.div
        animate={{
          x: [0, 40, -20, 30, 0],
          y: [0, -30, 20, -10, 0],
          scale: [1, 1.1, 0.95, 1.05, 1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: "easeInOut",
          times: [0, 0.25, 0.5, 0.75, 1],
        }}
        style={{
          position: "absolute",
          top: "10%",
          left: "5%",
          width: "480px",
          height: "380px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, var(--theme-primary) 0%, transparent 70%)",
          opacity: 0.08,
          filter: "blur(80px)",
        }}
      />

      {/* Blob 2 — slightly desaturated, bottom-right, medium drift */}
      <motion.div
        animate={{
          x: [0, -35, 15, -25, 0],
          y: [0, 25, -15, 20, 0],
          scale: [1, 0.9, 1.1, 0.95, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 4,
          times: [0, 0.25, 0.5, 0.75, 1],
        }}
        style={{
          position: "absolute",
          bottom: "15%",
          right: "5%",
          width: "380px",
          height: "300px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--theme-primary) 60%, #4040ff) 0%, transparent 70%)",
          opacity: 0.06,
          filter: "blur(70px)",
        }}
      />

      {/* Blob 3 — neutral warm, top-right, very slow drift */}
      <motion.div
        animate={{
          x: [0, 20, -30, 10, 0],
          y: [0, 20, 10, -20, 0],
          scale: [1, 1.05, 0.9, 1.1, 1],
        }}
        transition={{
          duration: 26,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 8,
          times: [0, 0.25, 0.5, 0.75, 1],
        }}
        style={{
          position: "absolute",
          top: "5%",
          right: "15%",
          width: "280px",
          height: "220px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--theme-primary) 40%, #ffffff) 0%, transparent 70%)",
          opacity: 0.04,
          filter: "blur(60px)",
        }}
      />

      {/* Subtle vignette to focus the center */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 40%, rgba(10,10,15,0.6) 100%)",
        }}
      />
    </div>
  );
});
