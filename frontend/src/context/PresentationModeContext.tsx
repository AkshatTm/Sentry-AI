/**
 * PresentationModeContext — Keyboard Override Engine
 *
 * Allows the presenter to manually force any SecurityState during a live demo,
 * bypassing the live BLE + camera sensor pipeline.
 *
 * Keyboard Shortcuts (global, no focus required):
 *   Ctrl + Shift + L  →  Force LOCKED
 *   Ctrl + Shift + B  →  Force BLURRED
 *   Ctrl + Shift + S  →  Force SECURE
 *   Ctrl + Shift + 0  →  Release override (sensors resume control)
 *
 * Toast Design: Subtle, bottom-right corner, presenter-only cue.
 * The audience should focus on the UI transitions, not text popups.
 *
 * Strict Mode Safe: Single `addEventListener` registered per effect lifecycle.
 * The cleanup function removes the exact same handler reference on unmount.
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { SecurityState } from "@/hooks/useSecurityState";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PresentationModeContextValue {
  /** The presenter's manual override, or null when sensors are in control. */
  overrideState: SecurityState | null;
  /** Force a specific security state, bypassing the sensor pipeline. */
  setOverride: (state: SecurityState) => void;
  /** Release the override and return control to the sensors. */
  clearOverride: () => void;
  /** True when an override is currently active. */
  isOverrideActive: boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const PresentationModeContext =
  createContext<PresentationModeContextValue | null>(null);

// ─── Toast ────────────────────────────────────────────────────────────────────

const STATE_LABELS: Record<SecurityState, string> = {
  SECURE: "SECURE",
  BLURRED: "BLURRED",
  LOCKED: "LOCKED",
};

const STATE_COLORS: Record<SecurityState, string> = {
  SECURE: "#22c55e",
  BLURRED: "#f59e0b",
  LOCKED: "#ef4444",
};

interface ToastMessage {
  id: number;
  text: string;
  color: string;
}

let _toastIdCounter = 0;
const TOAST_DURATION_MS = 2500;

function PresentationToast({ messages }: { messages: ToastMessage[] }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "1rem",
        right: "1rem",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column-reverse",
        gap: "0.375rem",
        alignItems: "flex-end",
        pointerEvents: "none",
      }}
    >
      <AnimatePresence>
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, x: 16, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 16, scale: 0.94 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            style={{
              background: "rgba(0, 0, 0, 0.78)",
              border: `1px solid ${msg.color}55`,
              borderRadius: "5px",
              padding: "0.25rem 0.625rem",
              fontSize: "0.625rem",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.1em",
              color: msg.color,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              whiteSpace: "nowrap",
            }}
          >
            ⌨ {msg.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PresentationModeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [overrideState, setOverrideState] = useState<SecurityState | null>(
    null
  );
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((text: string, color: string) => {
    const id = ++_toastIdCounter;
    setToasts((prev) => [...prev, { id, text, color }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  const setOverride = useCallback(
    (state: SecurityState) => {
      setOverrideState(state);
      pushToast(`OVERRIDE → ${STATE_LABELS[state]}`, STATE_COLORS[state]);
    },
    [pushToast]
  );

  const clearOverride = useCallback(() => {
    setOverrideState(null);
    pushToast("SENSORS RESTORED", "#64748b");
  }, [pushToast]);

  // Keyboard bindings — Strict Mode safe
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;

      switch (e.key.toUpperCase()) {
        case "L":
          e.preventDefault();
          setOverride("LOCKED");
          break;
        case "B":
          e.preventDefault();
          setOverride("BLURRED");
          break;
        case "S":
          e.preventDefault();
          setOverride("SECURE");
          break;
        case "0":
          e.preventDefault();
          clearOverride();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setOverride, clearOverride]);

  const value: PresentationModeContextValue = {
    overrideState,
    setOverride,
    clearOverride,
    isOverrideActive: overrideState !== null,
  };

  return (
    <PresentationModeContext.Provider value={value}>
      {children}
      <PresentationToast messages={toasts} />
    </PresentationModeContext.Provider>
  );
}

// ─── Consumer Hook ────────────────────────────────────────────────────────────

export function usePresentationMode(): PresentationModeContextValue {
  const ctx = useContext(PresentationModeContext);
  if (!ctx) {
    throw new Error(
      "usePresentationMode must be called inside <PresentationModeProvider>. " +
        "Wrap your dashboard page (or layout) with that provider."
    );
  }
  return ctx;
}
