/**
 * Test Route: /test/chameleon
 *
 * Isolated test harness for the Chameleon Engine (Phase 3).
 * ─────────────────────────────────────────────────────────────────────────────
 * Purpose: Validate the full ChameleonWrapper pipeline without needing the
 * dashboard to be assembled. Use this page to:
 *
 *   1. Manually inject any color (preset swatches or free-text hex input).
 *   2. Observe the CSS variable transition in real time.
 *   3. See the Saturation Guard accept/reject decisions live.
 *   4. Toggle to "LIVE" mode to read actual dominantColor from the WebSocket.
 *
 * This page is safe to demo in isolation — it does NOT require a Bluetooth
 * device and does NOT use useProximityTether.
 */

"use client";

import { useState, useEffect } from "react";
import { Wifi, WifiOff, Palette, Eye, ChevronRight, Check, X } from "lucide-react";

import { ChameleonWrapper } from "@/components/ChameleonWrapper";
import { useSecuritySocket } from "@/hooks/useSecuritySocket";

// ─────────────────────────────────────────────────────────────────────────────
// Saturation Guard Logic (mirrored from ChameleonWrapper — source of truth)
// ─────────────────────────────────────────────────────────────────────────────

const SATURATION_THRESHOLD = 15;
const LIGHTNESS_MIN = 10;

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const match = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return null;
  const r = parseInt(match[1], 16) / 255;
  const g = parseInt(match[2], 16) / 255;
  const b = parseInt(match[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l: l * 100 };
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h: number;
  switch (max) {
    case r: h = ((g - b) / delta + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / delta + 2) / 6; break;
    default: h = ((r - g) / delta + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function evaluateColor(hex: string): {
  valid: boolean;
  hsl: { h: number; s: number; l: number } | null;
  reason: string;
} {
  if (!/^#[a-f\d]{6}$/i.test(hex)) return { valid: false, hsl: null, reason: "Malformed HEX string" };
  const hsl = hexToHsl(hex)!;
  if (hsl.s < SATURATION_THRESHOLD) return { valid: false, hsl, reason: `Saturation ${hsl.s.toFixed(1)}% < ${SATURATION_THRESHOLD}% threshold (too grey)` };
  if (hsl.l < LIGHTNESS_MIN)        return { valid: false, hsl, reason: `Lightness ${hsl.l.toFixed(1)}% < ${LIGHTNESS_MIN}% threshold (too dark)` };
  return { valid: true, hsl, reason: `S=${hsl.s.toFixed(1)}%  L=${hsl.l.toFixed(1)}%  H=${hsl.h.toFixed(0)}°` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset Palettes
// ─────────────────────────────────────────────────────────────────────────────

const VIVID_PALETTE = [
  { label: "Cyan",      hex: "#00d4ff" },
  { label: "Violet",    hex: "#8b5cf6" },
  { label: "Amber",     hex: "#f59e0b" },
  { label: "Rose",      hex: "#f43f5e" },
  { label: "Emerald",   hex: "#10b981" },
  { label: "Indigo",    hex: "#6366f1" },
  { label: "Orange",    hex: "#f97316" },
  { label: "Sky",       hex: "#0ea5e9" },
];

const GUARD_TESTS = [
  { label: "Concrete (grey wall)", hex: "#808080", expectPass: false },
  { label: "Near-black",           hex: "#0a0a0a", expectPass: false },
  { label: "Paper white",          hex: "#f0f0f0", expectPass: false },
  { label: "Vivid (passes)",       hex: "#7c3aed", expectPass: true  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SwatchButton({
  hex, label, active, onClick,
}: { hex: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 p-1 rounded-xl transition-all duration-200 cursor-pointer"
      style={{
        border: active ? `2px solid ${hex}` : "2px solid transparent",
        background: active ? `color-mix(in srgb, ${hex} 10%, transparent)` : "transparent",
        boxShadow: active ? `0 0 12px color-mix(in srgb, ${hex} 30%, transparent)` : "none",
      }}
    >
      <div
        className="w-12 h-12 rounded-lg"
        style={{
          background: hex,
          boxShadow: `0 4px 12px color-mix(in srgb, ${hex} 40%, transparent)`,
        }}
      />
      <span className="text-[10px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </span>
      <span className="text-[9px] font-mono" style={{ color: "var(--color-muted)" }}>
        {hex}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ChameleonTestPage() {
  const { sensorData, isConnected, socketStatus } = useSecuritySocket();

  const [mode, setMode] = useState<"manual" | "live">("manual");
  const [manualHex, setManualHex] = useState("#00d4ff");
  const [inputValue, setInputValue] = useState("#00d4ff");
  const [cssVarValue, setCssVarValue] = useState("—");

  // The active color feeding ChameleonWrapper
  const activeColor = mode === "live" ? (sensorData?.dominantColor ?? manualHex) : manualHex;

  // Read CSS variable value after each transition tick, for display
  // (uses a polling interval — acceptable in a test harness only)
  useEffect(() => {
    const interval = setInterval(() => {
      const v = document.documentElement.style.getPropertyValue("--theme-primary");
      setCssVarValue(v || "#00d4ff");
    }, 80);
    return () => clearInterval(interval);
  }, []);

  const evaluation = evaluateColor(activeColor);

  function handleInputCommit() {
    const val = inputValue.trim();
    if (/^#[a-f\d]{6}$/i.test(val)) {
      setManualHex(val);
      setMode("manual");
    }
  }

  return (
    <ChameleonWrapper dominantColor={activeColor}>
      <div
        className="min-h-screen p-6 space-y-6"
        style={{ background: "var(--chameleon-bg, var(--color-bg))", color: "var(--color-text)" }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Palette size={16} style={{ color: "var(--theme-primary)" }} />
              <h1 className="text-lg font-semibold tracking-tight">Chameleon Engine — Test Harness</h1>
            </div>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              Isolated test route · Phase 3 · CSS variable injection &amp; saturation guard
            </p>
          </div>
          {/* Navigation breadcrumb */}
          <a
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors duration-150"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--theme-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            <span>Dashboard</span>
            <ChevronRight size={11} />
          </a>
        </div>

        {/* ── Mode Toggle + Status Row ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex rounded-lg p-0.5 gap-0.5"
            style={{ background: "var(--color-surface)", border: "1px solid var(--theme-border)" }}
          >
            {(["manual", "live"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="px-4 py-1.5 rounded-md text-xs font-medium capitalize transition-all duration-200 cursor-pointer"
                style={
                  mode === m
                    ? { background: "var(--theme-glow)", color: "var(--theme-primary)", border: "1px solid var(--theme-border)" }
                    : { background: "transparent", color: "var(--color-muted)", border: "1px solid transparent" }
                }
              >
                {m === "live" ? "Live (WebSocket)" : "Manual"}
              </button>
            ))}
          </div>

          {/* WebSocket status */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--theme-border)",
              color: isConnected ? "var(--color-success)" : "var(--color-muted)",
            }}
          >
            {isConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
            <span>WS: {socketStatus.toUpperCase()}</span>
            {mode === "live" && sensorData?.dominantColor && (
              <span className="ml-1 font-mono" style={{ color: "var(--color-text-secondary)" }}>
                → {sensorData.dominantColor}
              </span>
            )}
          </div>

          {/* CSS variable live readout */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--theme-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            <span style={{ color: "var(--color-muted)" }}>--theme-primary:</span>
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: cssVarValue }}
            />
            <span>{cssVarValue}</span>
          </div>
        </div>

        {/* ── Manual Controls ── */}
        {mode === "manual" && (
          <section
            className="rounded-xl p-5 space-y-4"
            style={{ background: "var(--color-surface)", border: "1px solid var(--theme-border)" }}
          >
            <h2 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--color-muted)" }}>
              Manual Color Injection
            </h2>

            {/* Hex input */}
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg shrink-0"
                style={{ background: manualHex, boxShadow: `0 0 12px color-mix(in srgb, ${manualHex} 40%, transparent)` }}
              />
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInputCommit()}
                onBlur={handleInputCommit}
                placeholder="#RRGGBB"
                className="flex-1 px-3 py-2 rounded-lg text-sm font-mono outline-none transition-colors duration-200"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "var(--color-text)",
                  caretColor: "var(--theme-primary)",
                  maxWidth: "160px",
                }}
              />
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                Press Enter to apply
              </span>
            </div>

            {/* Vivid preset swatches */}
            <div>
              <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--color-muted)" }}>
                Vivid Presets
              </p>
              <div className="flex flex-wrap gap-2">
                {VIVID_PALETTE.map(({ label, hex }) => (
                  <SwatchButton
                    key={hex}
                    hex={hex}
                    label={label}
                    active={manualHex === hex}
                    onClick={() => { setManualHex(hex); setInputValue(hex); }}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Saturation Guard Test Panel ── */}
        <section
          className="rounded-xl p-5 space-y-4"
          style={{ background: "var(--color-surface)", border: "1px solid var(--theme-border)" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--color-muted)" }}>
              Saturation Guard — Live Evaluation
            </h2>
            <span className="text-[10px]" style={{ color: "var(--color-muted)" }}>
              S ≥ {SATURATION_THRESHOLD}% and L ≥ {LIGHTNESS_MIN}%
            </span>
          </div>

          {/* Current color evaluation */}
          <div
            className="flex items-center gap-4 p-4 rounded-lg"
            style={{
              background: evaluation.valid ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
              border: `1px solid ${evaluation.valid ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
            }}
          >
            <div
              className="w-10 h-10 rounded-lg shrink-0"
              style={{ background: activeColor }}
            />
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {evaluation.valid ? (
                  <Check size={13} style={{ color: "var(--color-success)" }} />
                ) : (
                  <X size={13} style={{ color: "var(--color-danger)" }} />
                )}
                <span
                  className="text-sm font-semibold"
                  style={{ color: evaluation.valid ? "var(--color-success)" : "var(--color-danger)" }}
                >
                  {evaluation.valid ? "ACCEPTED" : "REJECTED — Guard Holding Last Vivid"}
                </span>
              </div>
              <span className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>
                {activeColor} · {evaluation.reason}
              </span>
            </div>
          </div>

          {/* Guard test suite */}
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--color-muted)" }}>
              Curated Guard Test Cases — click to inject
            </p>
            <div className="grid grid-cols-2 gap-3">
              {GUARD_TESTS.map(({ label, hex, expectPass }) => {
                const result = evaluateColor(hex);
                const correct = result.valid === expectPass;
                return (
                  <button
                    key={hex}
                    onClick={() => { setManualHex(hex); setInputValue(hex); setMode("manual"); }}
                    className="flex items-center gap-3 p-3 rounded-xl text-left cursor-pointer transition-all duration-150 group"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: `1px solid ${manualHex === hex && mode === "manual" ? "var(--theme-border)" : "rgba(255,255,255,0.06)"}`,
                    }}
                  >
                    <div className="w-8 h-8 rounded-lg shrink-0" style={{ background: hex }} />
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="text-xs font-medium truncate" style={{ color: "var(--color-text)" }}>{label}</span>
                      <span className="text-[10px] font-mono" style={{ color: "var(--color-muted)" }}>{hex}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className="text-[9px] font-semibold tracking-widest px-1.5 py-0.5 rounded-full"
                        style={{
                          background: result.valid ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                          color: result.valid ? "var(--color-success)" : "var(--color-danger)",
                        }}
                      >
                        {result.valid ? "PASS" : "BLOCKED"}
                      </span>
                      {!correct && (
                        <span className="text-[8px]" style={{ color: "var(--color-warning)" }}>
                          Unexpected
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Visual Demo: CSS Variable Token Preview ── */}
        <section
          className="rounded-xl p-5 space-y-3"
          style={{ background: "var(--color-surface)", border: "1px solid var(--theme-border)" }}
        >
          <h2 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--color-muted)" }}>
            Derived Token Preview (CSS color-mix cascade)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { token: "--theme-primary", desc: "Primary", opaque: true },
              { token: "--theme-glow",    desc: "Glow (28% opacity)",   opaque: false },
              { token: "--theme-border",  desc: "Border (45% opacity)", opaque: false },
            ].map(({ token, desc, opaque }) => (
              <div
                key={token}
                className="flex items-center gap-3 p-3 rounded-lg"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg shrink-0"
                  style={{ background: `var(${token})`, border: "1px solid rgba(255,255,255,0.08)" }}
                />
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--color-text)" }}>{desc}</p>
                  <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--color-muted)" }}>var({token})</p>
                </div>
              </div>
            ))}
          </div>

          {/* Glow demo */}
          <div
            className="mt-2 p-4 rounded-xl text-center text-sm font-semibold transition-shadow duration-500"
            style={{
              background: "var(--theme-glow)",
              border: "1px solid var(--theme-border)",
              color: "var(--theme-primary)",
              boxShadow: "0 0 30px var(--theme-glow), 0 0 60px var(--theme-glow)",
            }}
          >
            <Eye size={14} className="inline mr-2" />
            Chameleon Glow — this entire card reacts to --theme-primary with zero JS
          </div>
        </section>

        {/* ── Transition Speed Demo ── */}
        <section
          className="rounded-xl p-5"
          style={{ background: "var(--color-surface)", border: "1px solid var(--theme-border)" }}
        >
          <h2 className="text-xs font-semibold tracking-wide uppercase mb-3" style={{ color: "var(--color-muted)" }}>
            Rapid-fire Color Injection — Framer Motion interpolation stress test
          </h2>
          <p className="text-xs mb-4" style={{ color: "var(--color-text-secondary)" }}>
            Click multiple vivid swatches quickly to watch Framer Motion smoothly chain interpolations
            without any jarring cuts. The animation always starts from the <em>current animated value</em>,
            not the previous target.
          </p>
          <div className="flex flex-wrap gap-2">
            {VIVID_PALETTE.map(({ label, hex }) => (
              <button
                key={hex}
                onClick={() => { setManualHex(hex); setInputValue(hex); setMode("manual"); }}
                className="px-4 py-2 rounded-lg text-xs font-medium cursor-pointer transition-transform duration-100 active:scale-95"
                style={{
                  background: hexToHsl(hex) ? `color-mix(in srgb, ${hex} 15%, transparent)` : "var(--color-surface)",
                  border: `1px solid color-mix(in srgb, ${hex} 40%, transparent)`,
                  color: hex,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </ChameleonWrapper>
  );
}
