/**
 * LockScreen — Informational Full-Screen Lock Overlay
 *
 * Redesigned per UI Enhancement Master Plan §6.9:
 * - Darker backdrop: rgba(5,5,10,0.96) — feels impenetrable
 * - Single dashed ring (15s rotation) — removed 3 nested rings (too busy)
 * - Removed: red scan sweep line (implies scanning, wrong semantics)
 * - Removed: HUD corner marks (overused across the app)
 * - "Session Locked": Satoshi Bold, 28px, color-danger
 * - "Hardware Tether Lost": Space Grotesk 16px, color-text-secondary
 * - Grace period: full-width draining progress bar (not the blinking box)
 * - ADR-02 footnote: removed from lock screen
 * - RSSI meter: moved outside card, pinned to bottom viewport
 *
 * No manual PIN required — the Bluetooth tether is the authentication factor.
 */

"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { LockKeyhole, Bluetooth, BluetoothOff, Signal } from "lucide-react";

// ── Animation Config ─────────────────────────────────────────────────────────

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 16 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -8,
    transition: { duration: 0.3, ease: "easeIn" as const },
  },
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface LockScreenProps {
  deviceName: string | null;
  rssi: number | null;
  distance: number | null;
  isSupported: boolean;
  isDisconnected: boolean;
  isGattOnly: boolean;
  isPairing: boolean;
  availableDevices: { name: string; address: string; rssi: number; type?: string }[];
  scan: () => Promise<void>;
  pair: (mac: string, name?: string, deviceType?: string) => Promise<void>;
  requestPairing: (namePrefix?: string) => Promise<void>;
  isGracePeriod?: boolean;
  remainingSeconds?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rssiToProximityLabel(rssi: number, distance: number | null): string {
  if (distance !== null) {
    if (distance < 0.5) return `Very Close (${distance.toFixed(1)} m)`;
    if (distance < 1.5) return `Near (${distance.toFixed(1)} m)`;
    if (distance < 2.5) return `Borderline (${distance.toFixed(1)} m)`;
    return `Out of Range (${distance.toFixed(1)} m)`;
  }
  if (rssi >= -55) return "Very Close (< 0.5 m)";
  if (rssi >= -65) return "Near (< 1.5 m)";
  if (rssi >= -75) return "Borderline (~2 m)";
  return "Out of Range (> 2 m)";
}

/** Renders 5 signal bars based on RSSI strength. */
// ⚡ Bolt Performance Optimization:
// Memoized SignalBars to prevent re-renders when other LockScreen props change.
const SignalBars = memo(function SignalBars({ rssi }: { rssi: number | null }) {
  const thresholds = [-55, -65, -70, -75, -85];
  const activeBars = rssi === null
    ? 0
    : thresholds.filter((t) => rssi >= t).length;

  return (
    <div className="flex items-end gap-0.5" aria-label={`Signal: ${activeBars}/5 bars`}>
      {[1, 2, 3, 4, 5].map((bar) => (
        <div
          key={bar}
          style={{ height: `${6 + bar * 4}px`, width: "5px" }}
          className={`rounded-sm transition-colors duration-300 ${
            bar <= activeBars
              ? "bg-danger"
              : "bg-[var(--color-surface-raised)]"
          }`}
        />
      ))}
    </div>
  );
});

// ── RSSI Floating Strip (outside card, bottom of viewport) ────────────────────

// ⚡ Bolt Performance Optimization:
// Memoized RssiStrip to prevent re-renders when other LockScreen props change.
const RssiStrip = memo(function RssiStrip({
  deviceName,
  rssi,
  distance,
  isGattOnly,
  isDisconnected,
}: {
  deviceName: string | null;
  rssi: number | null;
  distance: number | null;
  isGattOnly: boolean;
  isDisconnected: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ delay: 0.4, duration: 0.35 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0.625rem 1.25rem",
        borderRadius: "12px",
        background: "rgba(13, 13, 19, 0.85)",
        border: "1px solid var(--color-border)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        minWidth: "280px",
      }}
    >
      {isGattOnly && !isDisconnected ? (
        <Bluetooth size={14} style={{ color: "var(--color-warning)", flexShrink: 0 }} />
      ) : rssi !== null ? (
        <Signal size={14} style={{ color: "var(--color-danger)", flexShrink: 0 }} />
      ) : (
        <BluetoothOff size={14} style={{ color: "var(--color-danger)", flexShrink: 0 }} />
      )}
      <span
        style={{
          fontSize: "var(--fs-xs)",
          fontFamily: "var(--font-body)",
          color: "var(--color-text-secondary)",
          fontWeight: 500,
        }}
      >
        {deviceName ?? "Unknown Device"}
      </span>
      <div style={{ flexGrow: 1, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.75rem" }}>
        <SignalBars rssi={rssi} />
        <span
          style={{
            fontSize: "var(--fs-xs)",
            fontFamily: "var(--font-mono)",
            color: "var(--color-muted)",
          }}
        >
          {isGattOnly && !isDisconnected
            ? "Connected (no proximity data)"
            : rssi !== null
              ? `${rssi} dBm · ${rssiToProximityLabel(rssi, distance)}`
              : "No signal"}
        </span>
      </div>
    </motion.div>
  );
});

// ── Component ─────────────────────────────────────────────────────────────────

// ⚡ Bolt Performance Optimization:
// Memoized LockScreen to prevent re-renders on high-frequency websocket ticks.
export const LockScreen = memo(function LockScreen({
  deviceName,
  rssi,
  distance,
  isSupported,
  isDisconnected,
  isGattOnly,
  isPairing,
  availableDevices,
  scan,
  pair,
  requestPairing,
  isGracePeriod = false,
  remainingSeconds = 0,
}: LockScreenProps) {
  return (
    <motion.div
      key="lock-screen-backdrop"
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        // Darker — this is a security screen, should feel impenetrable
        backgroundColor: "rgba(5, 5, 10, 0.96)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {/* ── Center card ── */}
      <motion.div
        key="lock-screen-card"
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="relative flex flex-col items-center gap-6 rounded-2xl p-10 max-w-md w-full mx-4 text-center"
        style={{
          background: "linear-gradient(145deg, rgba(19,19,26,0.97), rgba(25,19,38,0.95))",
          border: "1px solid rgba(244,63,94,0.2)",
          boxShadow:
            "0 0 0 1px rgba(244,63,94,0.1), 0 24px 64px rgba(0,0,0,0.8), 0 0 60px rgba(244,63,94,0.06)",
        }}
      >
        {/* Danger glow from top */}
        <div
          className="absolute inset-0 rounded-2xl opacity-25 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 50% 0%, rgba(244,63,94,0.3) 0%, transparent 60%)",
          }}
        />

        {/* ── Lock icon with SINGLE dashed ring — simplified ── */}
        <div className="relative z-10 flex items-center justify-center w-20 h-20">
          {/* Single slow-rotating dashed ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full"
            style={{
              border: "1.5px dashed rgba(244,63,94,0.35)",
            }}
          />
          {/* Subtle radial pulse */}
          <motion.div
            animate={{ opacity: [0.3, 0.6, 0.3], scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            className="absolute"
            style={{
              inset: "14px",
              borderRadius: "50%",
              background: "radial-gradient(circle at 50% 50%, rgba(244,63,94,0.2) 0%, transparent 70%)",
            }}
          />
          {/* Lock icon — larger, no background circle needed */}
          <motion.div
            animate={{ scale: [1, 1.04, 1], opacity: [0.9, 1, 0.9] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="relative flex items-center justify-center"
          >
            <LockKeyhole size={36} className="text-danger" strokeWidth={1.5} />
          </motion.div>
        </div>

        {/* ── Status label ── */}
        <div className="relative z-10 flex flex-col gap-2">
          {/* Satoshi Bold, 28px — assertive but not screaming */}
          <span
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              fontFamily: "var(--font-display, 'Satoshi', sans-serif)",
              color: "var(--color-danger)",
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
            }}
          >
            Session Locked
          </span>
          {/* Space Grotesk — description, not headline */}
          <h2
            style={{
              fontSize: "1rem",
              fontWeight: 400,
              fontFamily: "var(--font-body)",
              color: "var(--color-text-secondary)",
              margin: 0,
            }}
          >
            Hardware tether lost
          </h2>

          {isGracePeriod ? (
            <div className="flex flex-col items-center gap-3 mt-2">
              <p
                style={{
                  fontSize: "var(--fs-sm)",
                  fontFamily: "var(--font-body)",
                  color: "var(--color-text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                Bring your paired device back within range.
              </p>
              {/* Full-width draining progress bar */}
              <div
                style={{
                  width: "100%",
                  height: "4px",
                  borderRadius: "2px",
                  background: "rgba(244,63,94,0.15)",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <motion.div
                  key={`bar-${remainingSeconds}`}
                  initial={{ width: "100%" }}
                  animate={{ width: `${(remainingSeconds / 8) * 100}%` }}
                  transition={{ duration: 1, ease: "linear" }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    bottom: 0,
                    background: "linear-gradient(90deg, var(--color-danger), color-mix(in srgb, var(--color-danger) 60%, var(--color-warning)))",
                    borderRadius: "2px",
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: "var(--fs-sm)",
                  fontFamily: "var(--font-body)",
                  color: "var(--color-danger)",
                  fontWeight: 500,
                }}
              >
                {remainingSeconds}s to reconnect before session ends
              </span>
            </div>
          ) : (
            <p
              style={{
                fontSize: "var(--fs-sm)",
                fontFamily: "var(--font-body)",
                color: "var(--color-text-secondary)",
                lineHeight: 1.7,
                marginTop: "0.25rem",
              }}
            >
              Your paired Bluetooth device has moved out of range.
              <br />
              This session will{" "}
              <span style={{ color: "var(--color-text)", fontWeight: 500 }}>
                automatically restore
              </span>{" "}
              when the device returns.
            </p>
          )}
        </div>
      </motion.div>

      {/* ── RSSI strip — outside card, pinned to bottom of viewport ── */}
      <RssiStrip
        deviceName={deviceName}
        rssi={rssi}
        distance={distance}
        isGattOnly={isGattOnly}
        isDisconnected={isDisconnected}
      />
    </motion.div>
  );
});
