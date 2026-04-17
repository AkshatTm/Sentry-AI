/**
 * BLE Setup Page — A.R.T.H.U.R.
 *
 * Redesigned per UI Enhancement Master Plan §6.2:
 * - GradientMesh background (consistent with login)
 * - No HUD corners, no scan-line
 * - Segmented progress bar (2 steps, step 2 filled)
 * - Device list items with left color accent bar
 * - Space Grotesk labels, IBM Plex Mono data values
 * - Footer: single line, Space Grotesk, quieter
 *
 * Flow:
 *   1. useSetupGuard() ensures the user is logged in; redirects to / if not.
 *   2. On mount, fetch GET /bluetooth/status to check backend auto-connect.
 *   3a. If already connected → show "Continue to Dashboard →" (quick path).
 *   3b. If not connected → show scan / device-list UI.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bluetooth,
  BluetoothOff,
  ChevronRight,
  Radio,
  RefreshCw,
  ShieldCheck,
  Signal,
  Zap,
} from "lucide-react";
import { ChameleonWrapper } from "@/components/ChameleonWrapper";
import { GradientMesh } from "@/components/GradientMesh";
import { useSetupGuard, BLE_SESSION_KEY } from "@/hooks/useAuthGuard";
import { useProximityTether } from "@/hooks/useProximityTether";

const API_BASE = "http://localhost:8000";

interface BLEStatus {
  connected: boolean;
  paired_mac: string | null;
  device_name: string | null;
  rssi: number | null;
  distance_m: number | null;
  device_type: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function rssiLabel(rssi: number | null, dist: number | null): string {
  if (dist !== null) {
    if (dist < 0.5) return `Very Close · ${dist.toFixed(1)} m`;
    if (dist < 1.5) return `Near · ${dist.toFixed(1)} m`;
    if (dist < 2.5) return `Borderline · ${dist.toFixed(1)} m`;
    return `Out of Range · ${dist.toFixed(1)} m`;
  }
  if (rssi === null) return "No signal";
  if (rssi >= -55) return "Very Close";
  if (rssi >= -65) return "Near";
  if (rssi >= -75) return "Borderline";
  return "Out of Range";
}

function SignalBars({ rssi }: { rssi: number | null }) {
  const thresholds = [-55, -65, -70, -75, -85];
  const active = rssi === null ? 0 : thresholds.filter((t) => rssi >= t).length;
  return (
    <div className="flex items-end gap-[3px]">
      {[1, 2, 3, 4, 5].map((b) => (
        <div
          key={b}
          style={{ height: `${4 + b * 3}px`, width: "4px" }}
          className={`rounded-sm transition-colors duration-300 ${
            b <= active ? "bg-[var(--theme-primary)]" : "bg-white/10"
          }`}
        />
      ))}
    </div>
  );
}

// ── Segmented Progress Indicator ──────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: "1.5rem" }}>
      {Array.from({ length: total }).map((_, i) => {
        const isCompleted = i + 1 < current;
        const isActive = i + 1 === current;
        return (
          <div key={i} className="flex items-center gap-2">
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--fs-xs)",
                fontFamily: "var(--font-body)",
                fontWeight: 600,
                transition: "all 0.3s ease",
                background: isActive
                  ? "var(--theme-primary)"
                  : isCompleted
                  ? "var(--color-success)"
                  : "var(--color-border)",
                color: isActive || isCompleted ? "var(--color-bg)" : "var(--color-muted)",
                boxShadow: isActive ? `0 0 12px var(--theme-glow)` : "none",
              }}
            >
              {isCompleted ? "✓" : i + 1}
            </div>
            {i < total - 1 && (
              <div
                style={{
                  width: "48px",
                  height: "1px",
                  background: isCompleted
                    ? "var(--color-success)"
                    : "var(--color-border)",
                  transition: "background 0.4s ease",
                }}
              />
            )}
          </div>
        );
      })}
      <span
        style={{
          fontSize: "var(--fs-xs)",
          color: "var(--color-muted)",
          fontFamily: "var(--font-body)",
          marginLeft: "0.5rem",
        }}
      >
        Device pairing
      </span>
    </div>
  );
}

// ── Connected Device Card ──────────────────────────────────────────────────

function ConnectedCard({
  status,
  onContinue,
  onUseDifferent,
}: {
  status: BLEStatus;
  onContinue: () => void;
  onUseDifferent: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-5"
    >
      {/* Status badge */}
      <div className="flex items-center justify-center gap-2">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: "var(--color-success)", boxShadow: "0 0 8px var(--color-success)" }}
        />
        <span
          style={{ color: "var(--color-success)", fontFamily: "var(--font-body)", fontSize: "var(--fs-xs)", fontWeight: 600, letterSpacing: "0.06em" }}
        >
          Device connected
        </span>
      </div>

      {/* Device info strip — left green accent bar */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{
          background: "rgba(45,212,168,0.06)",
          border: "1px solid rgba(45,212,168,0.2)",
          borderLeft: "3px solid var(--color-success)",
        }}
      >
        <div className="flex items-center gap-3">
          <Bluetooth size={16} style={{ color: "var(--color-success)" }} />
          <div>
            <p style={{ fontSize: "var(--fs-sm)", fontWeight: 600, fontFamily: "var(--font-body)", color: "var(--color-text)" }}>
              {status.device_name ?? "Unknown Device"}
            </p>
            <p style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", color: "var(--color-muted)", marginTop: "0.15rem" }}>
              {status.paired_mac ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SignalBars rssi={status.rssi} />
          <div className="text-right">
            <p style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
              {status.rssi !== null ? `${status.rssi} dBm` : "—"}
            </p>
            <p style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-body)", color: "var(--color-muted)" }}>
              {rssiLabel(status.rssi, status.distance_m)}
            </p>
          </div>
        </div>
      </div>

      {/* Continue CTA */}
      <motion.button
        type="button"
        onClick={onContinue}
        whileHover={{ scale: 1.012 }}
        whileTap={{ scale: 0.988 }}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl"
        style={{
          background: "linear-gradient(135deg, var(--theme-glow), color-mix(in srgb, var(--theme-primary) 15%, transparent))",
          border: "1.5px solid var(--theme-border)",
          color: "var(--theme-primary)",
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          fontSize: "var(--fs-sm)",
          cursor: "pointer",
        }}
      >
        <ShieldCheck size={15} />
        Continue to dashboard
        <ChevronRight size={15} />
      </motion.button>

      {/* Use a different device */}
      <button
        type="button"
        aria-label="Use a different device"
        onClick={onUseDifferent}
        style={{
          color: "var(--color-muted)",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-body)",
          fontSize: "var(--fs-xs)",
          textAlign: "center",
        }}
      >
        Use a different device ↓
      </button>
    </motion.div>
  );
}

// ── Scan UI ────────────────────────────────────────────────────────────────

function ScanUI({
  isPairing,
  availableDevices,
  lastMac,
  onScan,
  onPair,
}: {
  isPairing: boolean;
  availableDevices: { name: string; address: string; rssi: number; type?: string }[];
  lastMac: string | null;
  onScan: () => void;
  onPair: (mac: string, name: string, type?: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-4"
    >
      <p
        style={{
          color: "var(--color-text-secondary)",
          fontFamily: "var(--font-body)",
          fontSize: "var(--fs-sm)",
          textAlign: "center",
          lineHeight: 1.6,
        }}
      >
        Scan for nearby Bluetooth devices to establish the proximity tether.
      </p>

      {/* Scan button — gradient border during scanning */}
      <motion.button
        type="button"
        onClick={onScan}
        disabled={isPairing}
        whileHover={!isPairing ? { scale: 1.01 } : {}}
        whileTap={!isPairing ? { scale: 0.99 } : {}}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl ${isPairing ? "gradient-border" : ""}`}
        style={{
          background: isPairing ? "rgba(255,255,255,0.03)" : "linear-gradient(135deg, var(--theme-glow), color-mix(in srgb, var(--theme-primary) 15%, transparent))",
          border: isPairing ? "1.5px solid var(--theme-border)" : "1.5px solid var(--theme-border)",
          color: isPairing ? "var(--color-muted)" : "var(--theme-primary)",
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          fontSize: "var(--fs-sm)",
          cursor: isPairing ? "wait" : "pointer",
          opacity: isPairing ? 0.65 : 1,
        }}
      >
        {isPairing ? (
          <>
            <Radio size={14} className="animate-spin" style={{ animationDuration: "1.5s" }} />
            Scanning…
          </>
        ) : (
          <>
            <RefreshCw size={14} />
            Scan for devices
          </>
        )}
      </motion.button>

      {/* Device list */}
      <AnimatePresence>
        {availableDevices.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--color-border)", background: "rgba(255,255,255,0.02)" }}
          >
            {availableDevices.map((dev) => {
              const isLast = dev.address === lastMac;
              return (
                <motion.button
                  key={dev.address}
                  type="button"
                  aria-label={`Connect to ${dev.name}`}
                  onClick={() => onPair(dev.address, dev.name, dev.type)}
                  disabled={isPairing}
                  whileHover={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                  style={{
                    borderBottom: "1px solid var(--color-border-subtle)",
                    cursor: isPairing ? "wait" : "pointer",
                    borderLeft: isLast ? "3px solid var(--theme-primary)" : "3px solid transparent",
                    transition: "border-color 0.2s ease",
                    background: "transparent",
                    border: "none",
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <Bluetooth
                      size={13}
                      style={{ color: isLast ? "var(--theme-primary)" : "var(--color-text-secondary)" }}
                    />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, fontFamily: "var(--font-body)", color: "var(--color-text)" }}>
                          {dev.name}
                        </span>
                        {isLast && (
                          <span
                            style={{
                              fontSize: "9px",
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              background: "rgba(0,212,255,0.12)",
                              color: "var(--theme-primary)",
                              border: "1px solid rgba(0,212,255,0.25)",
                              fontFamily: "var(--font-body)",
                            }}
                          >
                            Quick reconnect
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", color: "var(--color-muted)", marginTop: "0.1rem" }}>
                        {dev.address}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <SignalBars rssi={dev.rssi} />
                    <span style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", color: "var(--color-muted)" }}>
                      {dev.rssi} dBm
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SetupPage() {
  useSetupGuard();

  const router = useRouter();
  const { scan, pair, isPairing, availableDevices } = useProximityTether();

  const [bleStatus, setBleStatus] = useState<BLEStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showScanUI, setShowScanUI] = useState(false);
  const [pairingSuccess, setPairingSuccess] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/bluetooth/status`);
        if (res.ok) {
          const data: BLEStatus = await res.json();
          setBleStatus(data);
          if (!data.connected) setShowScanUI(true);
        }
      } catch {
        setShowScanUI(true);
      } finally {
        setLoading(false);
      }
    };
    check();
  }, []);

  const handleContinue = useCallback(() => {
    sessionStorage.setItem(BLE_SESSION_KEY, "1");
    router.push("/dashboard");
  }, [router]);

  const handlePair = useCallback(
    async (mac: string, name: string, type?: string) => {
      await pair(mac, name, type);
      setPairingSuccess(true);
      setTimeout(() => {
        sessionStorage.setItem(BLE_SESSION_KEY, "1");
        router.push("/dashboard");
      }, 600);
    },
    [pair, router]
  );

  return (
    <ChameleonWrapper dominantColor="#00d4ff">
      <div
        style={{
          minHeight: "100dvh",
          background: "var(--color-bg)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          position: "relative",
        }}
      >
        {/* Animated gradient mesh — same as login for consistent flow */}
        <GradientMesh />

        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            duration: 0.5,
            ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
          }}
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            maxWidth: "460px",
            background: "rgba(19, 19, 26, 0.75)",
            border: "1px solid var(--color-border)",
            borderRadius: "16px",
            padding: "2.5rem",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow: "0 32px 64px rgba(0,0,0,0.5)",
            overflow: "hidden",
          }}
        >
          {/* Top-edge accent line */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "10%",
              right: "10%",
              height: "1px",
              background: "linear-gradient(90deg, transparent, var(--theme-primary), transparent)",
              opacity: 0.6,
            }}
          />

          {/* ── Header ─────────────────────────────────────────────── */}
          <div className="flex flex-col items-center gap-3 mb-6">
            {/* Step progress indicator */}
            <StepIndicator current={2} total={2} />

            {/* Floating icon — no box */}
            <motion.div
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{
                display: "inline-flex",
                color: "var(--theme-primary)",
                filter: "drop-shadow(0 0 10px var(--theme-primary))",
              }}
            >
              <Bluetooth size={36} strokeWidth={1.5} />
            </motion.div>

            <div className="text-center">
              <h1
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  fontFamily: "var(--font-display, 'Satoshi', sans-serif)",
                  color: "var(--color-text)",
                  letterSpacing: "-0.025em",
                }}
              >
                BLE tether setup
              </h1>
              <p
                style={{
                  fontSize: "var(--fs-sm)",
                  color: "var(--color-muted)",
                  fontFamily: "var(--font-body)",
                  marginTop: "0.3rem",
                  opacity: 0.7,
                }}
              >
                Establish your hardware security tether
              </p>
            </div>
          </div>

          {/* ── Content ─────────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3 py-6"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                >
                  <Radio size={22} style={{ color: "var(--theme-primary)" }} />
                </motion.div>
                <p style={{ fontSize: "var(--fs-xs)", color: "var(--color-muted)", fontFamily: "var(--font-body)" }}>
                  Checking backend…
                </p>
              </motion.div>
            ) : pairingSuccess ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className="flex flex-col items-center gap-3 py-6"
              >
                <Zap size={32} style={{ color: "var(--color-success)" }} />
                <p style={{ fontSize: "var(--fs-sm)", fontWeight: 600, fontFamily: "var(--font-body)", color: "var(--color-success)" }}>
                  Tether established
                </p>
              </motion.div>
            ) : bleStatus?.connected && !showScanUI ? (
              <ConnectedCard
                key="connected"
                status={bleStatus}
                onContinue={handleContinue}
                onUseDifferent={() => setShowScanUI(true)}
              />
            ) : (
              <ScanUI
                key="scan"
                isPairing={isPairing}
                availableDevices={availableDevices}
                lastMac={bleStatus?.paired_mac ?? null}
                onScan={scan}
                onPair={handlePair}
              />
            )}
          </AnimatePresence>

          {/* ── Footer ────────────────────────────────────────────── */}
          <p
            style={{
              marginTop: "2rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid var(--color-border-subtle)",
              fontSize: "var(--fs-xs)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-body)",
              lineHeight: 1.6,
              textAlign: "center",
              opacity: 0.6,
            }}
          >
            A paired device is required to unlock the dashboard. The session ends automatically if the tether is lost.
          </p>
        </motion.div>
      </div>
    </ChameleonWrapper>
  );
}
