/**
 * NumberFlip — Animated number entrance component
 *
 * When the value mounts, it slides up from below with a blur fade.
 * On prop changes, it re-animates (key change triggers remount).
 *
 * Usage:
 *   <NumberFlip value="$4,821,394" />
 */
"use client";

import { memo } from "react";
import { motion } from "framer-motion";

interface NumberFlipProps {
  value: string;
  sub?: string;
  className?: string;
  valueStyle?: React.CSSProperties;
  subStyle?: React.CSSProperties;
}

// ⚡ Bolt Performance Optimization:
// Memoized NumberFlip to prevent re-renders on high-frequency websocket ticks.
export const NumberFlip = memo(function NumberFlip({
  value,
  sub,
  className = "",
  valueStyle,
  subStyle,
}: NumberFlipProps) {
  return (
    <div className={`flex items-baseline gap-0.5 ${className}`}>
      <motion.span
        key={value}
        initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{
          duration: 0.45,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{
          fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
          fontSize: "2rem",
          fontWeight: 500,
          letterSpacing: "-0.02em",
          color: "var(--color-text)",
          ...valueStyle,
        }}
      >
        {value}
      </motion.span>
      {sub && (
        <motion.span
          key={`${value}-sub`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          style={{
            fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
            fontSize: "0.9rem",
            fontWeight: 400,
            color: "var(--color-muted)",
            ...subStyle,
          }}
        >
          {sub}
        </motion.span>
      )}
    </div>
  );
});
