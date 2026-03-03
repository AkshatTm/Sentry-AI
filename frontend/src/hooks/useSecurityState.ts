/**
 * useSecurityState — SentryOS Security State Machine
 *
 * This is the single source of truth for UI security state. It consolidates
 * both sensor hooks and applies the full Priority Matrix from DESIGN.md §5.
 *
 * Truth Table (in priority order):
 * ┌────────────────────────┬──────────────────────┬───────────────┐
 * │ BLE (isDisconnected)   │ Camera (faceCount)   │ UI State      │
 * ├────────────────────────┼──────────────────────┼───────────────┤
 * │ true  (Away/LOCKED)    │ ANY                  │ LOCKED        │
 * │ false (Present)        │ null / WS offline    │ BLURRED       │
 * │ false (Present)        │ -1  (Camera fault)   │ BLURRED       │
 * │ false (Present)        │ 0   (User away)      │ BLURRED       │
 * │ false (Present)        │ > 1 (Shoulder surf)  │ BLURRED       │
 * │ false (Present)        │ 1   (Secure)         │ SECURE        │
 * └────────────────────────┴──────────────────────┴───────────────┘
 *
 * ADR-02 Fail-Closed: isDisconnected defaults to true until a BLE device is
 * explicitly paired, so the initial state is always LOCKED (not BLURRED).
 */

"use client";

import { useMemo } from "react";
import { useSecuritySocket } from "@/hooks/useSecuritySocket";
import { useProximityTether } from "@/hooks/useProximityTether";
import type { SocketStatus } from "@/hooks/useSecuritySocket";

// ── Security State Enum ─────────────────────────────────────────────────────

export type SecurityState = "SECURE" | "BLURRED" | "LOCKED";

// ── Hook Return Shape ───────────────────────────────────────────────────────

export interface SecurityStateResult {
  /** Derived UI security state — the single value all UI components consume. */
  securityState: SecurityState;

  // ── Camera / WebSocket data ────────────────────────────────────────────────
  /** Raw face count from MediaPipe. null = WS not yet connected. */
  faceCount: number | null;
  /** Current dominant colour HEX string from K-Means. null if no data yet. */
  dominantColor: string | null;
  /** WebSocket connection state string. */
  socketStatus: SocketStatus;
  /** True when the WebSocket handshake is complete and data is flowing. */
  isConnected: boolean;

  // ── Bluetooth / Proximity data ─────────────────────────────────────────────
  /** True = LOCKED (ADR-02 Fail-Closed — defaults true until paired). */
  isDisconnected: boolean;
  /** False if navigator.bluetooth is unavailable in this browser. */
  isSupported: boolean;
  /** Human-readable BLE status for display in the UI. */
  statusMessage: string;
  /** Paired BLE device name, or null if not paired. */
  deviceName: string | null;
  /** Last RSSI reading in dBm, or null. */
  rssi: number | null;
  /**
   * Triggers navigator.bluetooth.requestDevice(). MUST be called from a
   * user-gesture handler (e.g., onClick) — Web Bluetooth specification
   * requirement; cannot be auto-invoked on mount.
   */
  requestPairing: () => Promise<void>;
}

// ── State Derivation Logic ──────────────────────────────────────────────────

/**
 * Derives the SecurityState from the current sensor readings.
 * Extracted as a pure function for easy unit testing.
 */
export function deriveSecurityState(
  isDisconnected: boolean,
  faceCount: number | null,
  isConnected: boolean
): SecurityState {
  // Priority 1 — Absolute Override: BLE tether broken or no device paired.
  if (isDisconnected) {
    return "LOCKED";
  }

  // Priority 2a — WebSocket offline: no camera data to trust.
  // Per DESIGN.md §7: "lose connection to Python backend → default to BLURRED."
  if (!isConnected || faceCount === null) {
    return "BLURRED";
  }

  // Priority 2b — Camera fault (-1): treat as environmental security failure.
  if (faceCount === -1) {
    return "BLURRED";
  }

  // Priority 3 — No face detected: user has stepped away.
  // Bluetooth on desk ≠ user at desk. Blur is the conservative response.
  if (faceCount === 0) {
    return "BLURRED";
  }

  // Priority 4 — Multiple faces: shoulder-surfer detected.
  if (faceCount > 1) {
    return "BLURRED";
  }

  // Priority 5 — Exactly one face with hardware present: fully secure.
  return "SECURE";
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useSecurityState(): SecurityStateResult {
  // Consume both sensor hooks. All complex lifecycle logic is encapsulated
  // inside each hook — this layer only reads their outputs.
  const { sensorData, isConnected, socketStatus } = useSecuritySocket();
  const {
    isDisconnected,
    isSupported,
    deviceName,
    rssi,
    statusMessage,
    requestPairing,
  } = useProximityTether();

  // Derive faceCount and dominantColor from sensorData (null-safe).
  const faceCount = sensorData?.faceCount ?? null;
  const dominantColor = sensorData?.dominantColor ?? null;

  // useMemo ensures the state derivation only re-runs when the three inputs
  // that feed the truth table actually change — not on every render tick.
  const securityState = useMemo<SecurityState>(
    () => deriveSecurityState(isDisconnected, faceCount, isConnected),
    [isDisconnected, faceCount, isConnected]
  );

  return {
    securityState,
    faceCount,
    dominantColor,
    socketStatus,
    isConnected,
    isDisconnected,
    isSupported,
    statusMessage,
    deviceName,
    rssi,
    requestPairing,
  };
}
