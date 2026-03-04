/**
 * useProximityTether
 * ------------------
 * Manages the Web Bluetooth lifecycle to enforce a hardware proximity tether.
 *
 * Strategy:
 *  1. PRIMARY — `watchAdvertisements()` for real RSSI values (Chrome 91+).
 *  2. FALLBACK — GATT connection monitoring (binary connected / disconnected).
 *
 * Security model (ADR-02 — Fail-Closed):
 *  - `isDisconnected` defaults to `true` (LOCKED) until a device is paired
 *    and actively reporting RSSI above the threshold.
 *  - If the browser lacks `navigator.bluetooth`, the session stays LOCKED.
 *  - Set `NEXT_PUBLIC_BLE_BYPASS=true` to disable the tether for dev/demos.
 *
 * Constraints:
 *  - `requestPairing()` MUST be called from a user gesture (click / tap).
 *    The Web Bluetooth spec forbids programmatic invocation.
 *  - React 18 Strict Mode safe (isMountedRef guard on all async paths).
 *
 * @module hooks/useProximityTether
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProximityState {
  /** True when the paired device is absent / out of range — UI should LOCK (ADR-02). */
  isDisconnected: boolean;
  /** False if the browser lacks Web Bluetooth support entirely. */
  isSupported: boolean;
  /** Human-readable name of the paired device, or null if none paired. */
  deviceName: string | null;
  /** Last known RSSI value (dBm), or null if unavailable. */
  rssi: number | null;
  /** Human-readable status for debugging / HUD display. */
  statusMessage: string;
  /**
   * Trigger BLE device pairing via the browser picker.
   * **Must** be called from a user gesture (click / tap).
   * No-op if Bluetooth is unsupported.
   *
   * @param namePrefix — Optional prefix to filter devices by name
   *   (e.g. "boAt" for boAt earbuds). If provided, only devices whose
   *   advertised name starts with this string appear in the picker.
   *   If no device matches, the picker will show an error — the user
   *   can retry without a prefix by leaving the field empty.
   */
  requestPairing: (namePrefix?: string) => Promise<void>;
}

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * RSSI threshold (dBm). Values below this indicate the device is out of
 * proximity (~2 m for most BLE radios).
 */
const RSSI_THRESHOLD = -70;

/**
 * If no BLE advertisement is received within this window (ms), the device
 * is considered out of range and `isDisconnected` flips to `true`.
 */
const RSSI_STALE_MS = 10_000;

// ── Hook ───────────────────────────────────────────────────────────────────

export function useProximityTether(): ProximityState {
  /** Dev/demo bypass — disables the tether entirely. */
  const isBypassed = process.env.NEXT_PUBLIC_BLE_BYPASS === "true";

  // ── State ────────────────────────────────────────────────────────────
  const [isDisconnected, setIsDisconnected] = useState(() => !isBypassed);
  const [isSupported, setIsSupported] = useState(true); // assume true during SSR
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [rssi, setRssi] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("Initializing…");

  // ── Refs (stable across renders) ─────────────────────────────────────
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gattHandlerRef = useRef<((e: Event) => void) | null>(null);
  const isMountedRef = useRef(false);

  // ── Helpers ──────────────────────────────────────────────────────────

  /** Tear down all BLE subscriptions, timers, and GATT connections. */
  const teardownDevice = useCallback(() => {
    // 1. Abort advertisement watching (AbortController)
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // 2. Clear RSSI staleness timer
    if (staleTimerRef.current) {
      clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
    }

    // 3. Clean up the BluetoothDevice object
    const device = deviceRef.current;
    if (device) {
      // Spec-draft cleanup (may not exist on all browsers)
      device.unwatchAdvertisements?.();

      // Remove GATT disconnect listener
      if (gattHandlerRef.current) {
        device.removeEventListener(
          "gattserverdisconnected",
          gattHandlerRef.current
        );
        gattHandlerRef.current = null;
      }

      // Disconnect GATT server
      if (device.gatt?.connected) {
        device.gatt.disconnect();
      }

      deviceRef.current = null;
    }
  }, []);

  /** (Re)start the RSSI staleness timer. Marks disconnected if no advertisement arrives in time. */
  const resetStaleTimer = useCallback(() => {
    if (staleTimerRef.current) {
      clearTimeout(staleTimerRef.current);
    }
    staleTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setIsDisconnected(true);
      setRssi(null);
      setStatusMessage("BLE signal lost (no advertisement received).");
    }, RSSI_STALE_MS);
  }, []);

  // ── GATT Fallback Strategy ──────────────────────────────────────────

  /**
   * Binary connected / disconnected monitoring via GATT.
   * Used when `watchAdvertisements()` is unsupported or throws.
   */
  const startGattFallback = useCallback((device: BluetoothDevice) => {
    const disconnectHandler = () => {
      if (!isMountedRef.current) return;
      setIsDisconnected(true);
      setRssi(null);
      setStatusMessage("Device disconnected (GATT server lost).");
    };

    gattHandlerRef.current = disconnectHandler;
    device.addEventListener("gattserverdisconnected", disconnectHandler);

    if (device.gatt) {
      setStatusMessage("Connecting via GATT…");
      device.gatt
        .connect()
        .then(() => {
          if (!isMountedRef.current) return;
          setIsDisconnected(false);
          setStatusMessage("Tethered via GATT connection (no RSSI).");
        })
        .catch((err: Error) => {
          if (!isMountedRef.current) return;
          setIsDisconnected(true); // fail-closed
          setStatusMessage(`GATT connect failed: ${err.message}`);
        });
    } else {
      // Device paired but GATT unavailable — treat as present, monitor events
      setIsDisconnected(false);
      setStatusMessage("Device paired (GATT unavailable). Monitoring events.");
    }
  }, []);

  // ── Advertisement Watching (Primary Strategy) ───────────────────────

  /**
   * Uses the experimental `watchAdvertisements()` API to receive real
   * RSSI values from the paired device. Falls back to GATT on failure.
   */
  const startWatchingAds = useCallback(
    (device: BluetoothDevice) => {
      const abort = new AbortController();
      abortRef.current = abort;

      const handler = (event: Event) => {
        if (!isMountedRef.current) return;
        const advEvent = event as BluetoothAdvertisingEvent;
        const rssiValue = advEvent.rssi ?? null;
        setRssi(rssiValue);
        resetStaleTimer();

        if (rssiValue !== null) {
          const outOfRange = rssiValue < RSSI_THRESHOLD;
          setIsDisconnected(outOfRange);
          setStatusMessage(
            outOfRange
              ? `Out of range (RSSI: ${rssiValue} dBm < ${RSSI_THRESHOLD} dBm)`
              : `Tethered (RSSI: ${rssiValue} dBm)`
          );
        }
      };

      device.addEventListener("advertisementreceived", handler);

      device
        .watchAdvertisements({ signal: abort.signal })
        .then(() => {
          if (!isMountedRef.current) return;
          setIsDisconnected(false);
          setStatusMessage("Watching BLE advertisements…");
          resetStaleTimer();
        })
        .catch((err: Error) => {
          if (!isMountedRef.current) return;
          console.warn(
            "[useProximityTether] watchAdvertisements() failed, falling back to GATT:",
            err.message
          );
          // Clean up the advertisement listener before falling back
          device.removeEventListener("advertisementreceived", handler);
          startGattFallback(device);
        });
    },
    [resetStaleTimer, startGattFallback]
  );

  // ── Public API: requestPairing ──────────────────────────────────────

  const requestPairing = useCallback(async (namePrefix?: string) => {
    // Runtime support check (SSR-safe)
    if (typeof navigator === "undefined" || !("bluetooth" in navigator)) {
      setStatusMessage("Bluetooth unsupported in this browser.");
      return;
    }
    if (!isMountedRef.current) return;

    // Tear down any previously paired device
    teardownDevice();
    setRssi(null);
    setDeviceName(null);
    setIsDisconnected(true); // fail-closed during pairing flow

    try {
      const trimmed = namePrefix?.trim();
      setStatusMessage(
        trimmed
          ? `Requesting BLE device with name starting "${trimmed}"…`
          : "Requesting BLE device (all devices)…"
      );

      // When a namePrefix is provided, use filters so the browser picker
      // only lists matching devices (much easier to find your earbuds).
      const requestOptions: RequestDeviceOptions = trimmed
        ? {
            filters: [{ namePrefix: trimmed }],
            optionalServices: ["battery_service"],
          }
        : {
            acceptAllDevices: true,
            optionalServices: ["battery_service"],
          };

      const device = await navigator.bluetooth.requestDevice(requestOptions);

      if (!isMountedRef.current) return;

      deviceRef.current = device;
      setDeviceName(device.name ?? `BLE-${device.id.slice(0, 8)}`);

      // Primary strategy: watchAdvertisements for RSSI values
      if (typeof device.watchAdvertisements === "function") {
        startWatchingAds(device);
      } else {
        // Fallback: binary GATT connection monitoring
        startGattFallback(device);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const error = err as Error;

      if (error.name === "NotFoundError") {
        // User cancelled the Bluetooth picker dialog
        setStatusMessage("Device pairing cancelled by user.");
      } else {
        setStatusMessage(`BLE error: ${error.message}`);
        console.error("[useProximityTether] requestDevice failed:", error);
      }
    }
  }, [teardownDevice, startWatchingAds, startGattFallback]);

  // ── Lifecycle ────────────────────────────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;

    // Detect browser support (navigator is unavailable during SSR)
    const supported =
      typeof navigator !== "undefined" && "bluetooth" in navigator;
    setIsSupported(supported);

    if (isBypassed) {
      setIsDisconnected(false);
      setStatusMessage(
        "BLE bypass active (NEXT_PUBLIC_BLE_BYPASS=true). Tether disabled."
      );
    } else if (!supported) {
      setIsDisconnected(true);
      setStatusMessage(
        "Bluetooth unsupported — session locked (ADR-02 fail-closed)."
      );
    } else {
      // Fail-closed: locked until the user explicitly pairs a device
      setIsDisconnected(true);
      setStatusMessage(
        "Bluetooth available. Pair a device to enable proximity tether."
      );
    }

    return () => {
      isMountedRef.current = false;
      teardownDevice();
    };
  }, [isBypassed, teardownDevice]);

  // ── Return ───────────────────────────────────────────────────────────

  return {
    isDisconnected,
    isSupported,
    deviceName,
    rssi,
    statusMessage,
    requestPairing,
  };
}
