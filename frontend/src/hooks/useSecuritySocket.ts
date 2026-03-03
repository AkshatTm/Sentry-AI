/**
 * useSecuritySocket
 * -----------------
 * Connects to the SentryOS Python backend via WebSocket and consumes the
 * ADR-01 flat JSON sensor payload at 10 Hz.
 *
 * Features:
 *  - Strict ADR-01 payload validation (runtime type guard).
 *  - React 18 Strict Mode safe (debounced connect + isMountedRef guard).
 *  - Exponential backoff reconnection (1 s → 2 s → 4 s → cap 5 s).
 *  - Clean teardown: socket close + timer clear on unmount.
 *
 * @module hooks/useSecuritySocket
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ── ADR-01 Canonical Types ─────────────────────────────────────────────────

/** Raw JSON shape emitted by the Python backend (snake_case). */
interface RawSensorPayload {
  face_count: number;
  dominant_color: string;
  system_status: string;
  timestamp: number;
}

/** Transformed payload exposed to React consumers (camelCase). */
export interface SensorPayload {
  /** -1 = camera fault, 0 = no face, 1+ = count */
  faceCount: number;
  /** 7-char HEX string, e.g. "#4A90E2" */
  dominantColor: string;
  /** "initializing" | "active" | "camera_unavailable" */
  systemStatus: string;
  /** Unix epoch seconds */
  timestamp: number;
}

export type SocketStatus = "idle" | "connecting" | "open" | "closed" | "error";

export interface UseSecuritySocketReturn {
  /** Parsed sensor data from the last valid WebSocket message, or null. */
  sensorData: SensorPayload | null;
  /** Convenience boolean — true when the WebSocket is in `open` state. */
  isConnected: boolean;
  /** Granular connection lifecycle status for debugging / HUD display. */
  socketStatus: SocketStatus;
}

// ── Constants ──────────────────────────────────────────────────────────────

const WS_URL = "ws://localhost:8000/ws";

/** Initial reconnect delay (ms). Doubles each attempt, capped at MAX. */
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 5_000;

/**
 * Debounce before the initial connection (ms).
 * Survives React 18 Strict Mode's mount → unmount → remount cycle by
 * ensuring we don't open a socket that will be immediately torn down.
 */
const CONNECT_DEBOUNCE_MS = 100;

// ── Runtime Validation ─────────────────────────────────────────────────────

/**
 * Type guard that validates an unknown parsed value against the ADR-01 schema.
 * Intentionally loose on `system_status` string literals so the backend can
 * extend the enum without a frontend redeploy.
 */
function isRawSensorPayload(data: unknown): data is RawSensorPayload {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.face_count === "number" &&
    typeof obj.dominant_color === "string" &&
    typeof obj.system_status === "string" &&
    typeof obj.timestamp === "number"
  );
}

/** Map snake_case backend payload → camelCase React-friendly shape. */
function transformPayload(raw: RawSensorPayload): SensorPayload {
  return {
    faceCount: raw.face_count,
    dominantColor: raw.dominant_color,
    systemStatus: raw.system_status,
    timestamp: raw.timestamp,
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useSecuritySocket(): UseSecuritySocketReturn {
  const [sensorData, setSensorData] = useState<SensorPayload | null>(null);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("idle");

  // ── Refs (stable across renders, immune to Strict Mode) ──────────────
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);

  // ── Helpers ──────────────────────────────────────────────────────────

  /** Clear any pending reconnect timer. */
  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  /** Clear the initial connect debounce timer. */
  const clearDebounceTimer = useCallback(() => {
    if (connectDebounceRef.current !== null) {
      clearTimeout(connectDebounceRef.current);
      connectDebounceRef.current = null;
    }
  }, []);

  // ── Core Connect Logic ───────────────────────────────────────────────

  const connect = useCallback(() => {
    // Guard: don't connect if the component has unmounted (Strict Mode cleanup).
    if (!isMountedRef.current) return;

    // Guard: don't open a duplicate socket.
    const existing = wsRef.current;
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN ||
        existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setSocketStatus("connecting");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) {
        ws.close();
        return;
      }
      reconnectAttemptRef.current = 0; // Reset backoff on success
      setSocketStatus("open");
      console.log("[useSecuritySocket] Connected to", WS_URL);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const raw: unknown = JSON.parse(event.data as string);

        if (isRawSensorPayload(raw)) {
          setSensorData(transformPayload(raw));
        } else {
          console.warn(
            "[useSecuritySocket] Payload failed ADR-01 validation:",
            raw
          );
        }
      } catch {
        console.warn(
          "[useSecuritySocket] Non-JSON message received:",
          event.data
        );
      }
    };

    ws.onerror = (err) => {
      console.error("[useSecuritySocket] WebSocket error:", err);
      setSocketStatus("error");
    };

    ws.onclose = (event: CloseEvent) => {
      wsRef.current = null;
      setSocketStatus("closed");

      // ADR-03: Backend rejected us (single-client limit).
      if (event.code === 4001) {
        console.warn(
          "[useSecuritySocket] Rejected by backend (ADR-03 single-client limit). Will retry."
        );
      }

      // Only schedule reconnect if we're still mounted.
      if (!isMountedRef.current) return;

      // Exponential backoff: 1s → 2s → 4s → cap 5s
      const attempt = reconnectAttemptRef.current;
      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, attempt),
        RECONNECT_MAX_MS
      );
      reconnectAttemptRef.current = attempt + 1;

      console.log(
        `[useSecuritySocket] Connection closed (code ${event.code}). ` +
          `Reconnecting in ${delay}ms (attempt ${attempt + 1})…`
      );

      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(connect, delay);
    };
  }, [clearReconnectTimer]);

  // ── Lifecycle ────────────────────────────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;

    // Debounce the initial connection to survive Strict Mode's
    // mount → unmount → remount cycle. The first mount's cleanup fires
    // before this timeout resolves, preventing a wasted socket.
    clearDebounceTimer();
    connectDebounceRef.current = setTimeout(() => {
      connect();
    }, CONNECT_DEBOUNCE_MS);

    return () => {
      isMountedRef.current = false;

      // 1. Cancel pending debounce (Strict Mode first unmount).
      clearDebounceTimer();

      // 2. Cancel pending reconnect timer.
      clearReconnectTimer();

      // 3. Cleanly close the WebSocket if open.
      const ws = wsRef.current;
      if (ws) {
        // Null out handlers to prevent our onclose from scheduling a reconnect
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
        wsRef.current = null;
      }

      setSocketStatus("idle");
    };
  }, [connect, clearDebounceTimer, clearReconnectTimer]);

  // ── Return ───────────────────────────────────────────────────────────

  return {
    sensorData,
    isConnected: socketStatus === "open",
    socketStatus,
  };
}
