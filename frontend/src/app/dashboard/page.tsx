/**
 * Dashboard — A.R.T.H.U.R. Master Integration Route (Phase 4)
 *
 * UI Redesign per Enhancement Master Plan:
 * - TopBar: h-12 (48px), "S" lettermark, Satoshi wordmark, simplified badge (dot + text),
 *   status cluster (3 dots with tooltips), icon-only sign out button
 * - MetricCards: TiltCard 3D hover, no HUD corners, no shimmer, hero-only accent line,
 *   icon directly on card (no box), IBM Plex Mono values via NumberFlip
 * - Terminal: tabs decoration, warmer bg #0c0e14, alternating rows, removed "LIVE" text
 * - Code Panel: static red dot for RESTRICTED, Catppuccin-inspired token colors
 * - Security Events: no blinking badge, striped rows, static red dot for Active status
 * - Server Health: horizontal bar layout, 4px gradient bars, region inline, only degraded pulses
 * - Removed: ScanLineOverlay, HudCorners component, all shimmer classes
 *
 * Component tree:
 *   <PresentationModeProvider>
 *     <DashboardInner>
 *       <ChameleonWrapper>
 *         <div root>
 *           <SecurityTopBar /> — FIXED, ALWAYS VISIBLE, outside blur
 *           [OverrideStrip]   — subtle yellow band when override is active
 *           <GlassOverlay>
 *             <DashboardContent />
 *           </GlassOverlay>
 *           <AnimatePresence>
 *             <LockScreen />  — conditionally mounted
 *           </AnimatePresence>
 *         </div>
 *       </ChameleonWrapper>
 *     </DashboardInner>
 *   </PresentationModeProvider>
 */

"use client";

import { memo, useCallback, useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  BluetoothOff,
  CheckCircle2,
  Clock,
  Code2,
  DollarSign,
  Eye,
  Globe,
  LogOut,
  Radio,
  Server,
  Shield,
  ShieldAlert,
  Terminal,
  TrendingDown,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";

import { ChameleonWrapper } from "@/components/ChameleonWrapper";
import { GlassOverlay } from "@/components/GlassOverlay";
import { LockScreen } from "@/components/LockScreen";
import { TiltCard } from "@/components/TiltCard";
import { NumberFlip } from "@/components/NumberFlip";
import { useSecurityState, type SecurityState } from "@/hooks/useSecurityState";
import { PresentationModeProvider, usePresentationMode } from "@/context/PresentationModeContext";
import { useAuthGuard, logout } from "@/hooks/useAuthGuard";
import { useBleAutoLogout } from "@/hooks/useBleAutoLogout";
import { useRouter } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────────
// Mock Enterprise Data
// ─────────────────────────────────────────────────────────────────────────────

const METRICS = [
  {
    id: "revenue",
    label: "Revenue YTD",
    value: "$4,821,394",
    sub: ".22",
    delta: "+12.4%",
    trend: "up" as const,
    icon: DollarSign,
    note: "vs Q1-2025",
    isHero: true,
  },
  {
    id: "sessions",
    label: "Active Sessions",
    value: "1,247",
    sub: "",
    delta: "+3 new",
    trend: "up" as const,
    icon: Users,
    note: "across 14 regions",
    isHero: false,
  },
  {
    id: "latency",
    label: "API P99 Latency",
    value: "42",
    sub: "ms",
    delta: "−8ms",
    trend: "down" as const,
    icon: Zap,
    note: "Frankfurt edge node",
    isHero: false,
  },
  {
    id: "threat",
    label: "Threat Score",
    value: "2",
    sub: " / 100",
    delta: "LOW RISK",
    trend: "neutral" as const,
    icon: Shield,
    note: "Last scan 4 min ago",
    isHero: false,
  },
];

const TERMINAL_LINES = [
  { time: "09:14:20", level: "INFO",  msg: "A.R.T.H.U.R. kernel v3.1.0 boot sequence complete" },
  { time: "09:14:21", level: "INFO",  msg: "JWT auth middleware loaded — RS256 / 15m TTL" },
  { time: "09:14:22", level: "INFO",  msg: "DB connection pool established: 10/50 active" },
  { time: "09:14:22", level: "INFO",  msg: "Vault secret rotation acknowledged — 0 stale refs" },
  { time: "09:14:23", level: "WARN",  msg: "Unusual login attempt: IP 185.234.19.44 (RU/AS197695)" },
  { time: "09:14:23", level: "INFO",  msg: "2FA challenge issued → akshat@corp.io [WebAuthn]" },
  { time: "09:14:24", level: "INFO",  msg: "Session established: usr_7f3a29bc [clearance: L4]" },
  { time: "09:14:24", level: "INFO",  msg: "Physical presence verified — biometric hash OK" },
  { time: "09:14:25", level: "INFO",  msg: "Stripe webhook: charge.succeeded $8,400.00" },
  { time: "09:14:25", level: "INFO",  msg: "K8s health: 12/12 pods running — sentry-prod-eu" },
  { time: "09:14:26", level: "WARN",  msg: "Rate limit threshold 80% hit — /api/v2/ingest" },
  { time: "09:14:27", level: "ERROR", msg: "Worker sentry-proc-03 OOM — restarting (attempt 1/3)" },
  { time: "09:14:28", level: "INFO",  msg: "Worker sentry-proc-03 recovered — memory freed" },
  { time: "09:14:29", level: "INFO",  msg: "CDN cache purge complete — 2,841 assets invalidated" },
];

const SECURITY_EVENTS = [
  { id: "EVT-2291", timestamp: "09:14:23", event: "Anomalous Login Attempt",     severity: "HIGH",     actor: "185.234.19.44",     resolved: false },
  { id: "EVT-2290", timestamp: "09:12:05", event: "Privilege Escalation Blocked", severity: "CRITICAL", actor: "usr_3b1fee01",       resolved: true  },
  { id: "EVT-2289", timestamp: "09:08:41", event: "MFA Bypass Attempt",           severity: "HIGH",     actor: "usr_9a44c812",       resolved: true  },
  { id: "EVT-2288", timestamp: "08:59:17", event: "API Key Rotation Overdue",     severity: "MEDIUM",   actor: "svc_data-pipeline",  resolved: false },
  { id: "EVT-2287", timestamp: "08:44:00", event: "Scheduled Cert Renewal",       severity: "INFO",     actor: "cert-bot@corp.io",   resolved: true  },
];

// Catppuccin Mocha-inspired token colors — warmer, more cohesive
const CODE_LINES: { tokens: { t: string; v: string }[] }[] = [
  { tokens: [{ t: "comment", v: "// CONFIDENTIAL — A.R.T.H.U.R. Zero-Trust Auth Service" }] },
  { tokens: [{ t: "comment", v: "// access_level: RESTRICTED | clearance: L4+" }] },
  { tokens: [] },
  { tokens: [{ t: "keyword", v: "export async function " }, { t: "fn", v: "validatePhysicalPresence" }, { t: "plain", v: "(" }] },
  { tokens: [{ t: "plain", v: "  sessionToken: " }, { t: "type", v: "string" }, { t: "plain", v: "," }] },
  { tokens: [{ t: "plain", v: "  biometricHash: " }, { t: "type", v: "string" }] },
  { tokens: [{ t: "plain", v: "): " }, { t: "type", v: "Promise" }, { t: "plain", v: "<" }, { t: "type", v: "AuthClearance" }, { t: "plain", v: "> {" }] },
  { tokens: [{ t: "keyword", v: "  const " }, { t: "plain", v: "[session, biometric] = " }, { t: "keyword", v: "await " }, { t: "type", v: "Promise" }, { t: "plain", v: ".all([" }] },
  { tokens: [{ t: "plain", v: "    vault." }, { t: "fn", v: "getSession" }, { t: "plain", v: "(sessionToken)," }] },
  { tokens: [{ t: "plain", v: "    biochain." }, { t: "fn", v: "verify" }, { t: "plain", v: "(biometricHash)," }] },
  { tokens: [{ t: "plain", v: "  ]);" }] },
  { tokens: [] },
  { tokens: [{ t: "keyword", v: "  if " }, { t: "plain", v: "(!biometric.faceCount || biometric.faceCount !== " }, { t: "num", v: "1" }, { t: "plain", v: ") {" }] },
  { tokens: [{ t: "keyword", v: "    await " }, { t: "plain", v: "audit." }, { t: "fn", v: "log" }, { t: "plain", v: "({ event: " }, { t: "str", v: '"PRESENCE_FAIL"' }, { t: "plain", v: " });" }] },
  { tokens: [{ t: "keyword", v: "    throw new " }, { t: "type", v: "SecurityError" }, { t: "plain", v: "(" }, { t: "str", v: '"Physical presence verification failed"' }, { t: "plain", v: ");" }] },
  { tokens: [{ t: "plain", v: "  }" }] },
  { tokens: [] },
  { tokens: [{ t: "keyword", v: "  return " }, { t: "plain", v: "{" }] },
  { tokens: [{ t: "plain", v: "    clearanceLevel: session.role.clearance," }] },
  { tokens: [{ t: "plain", v: "    expiresAt: " }, { t: "type", v: "Date" }, { t: "plain", v: ".now() + SESSION_TTL," }] },
  { tokens: [{ t: "plain", v: "    hardwareTether: biometric.bleRssi," }] },
  { tokens: [{ t: "plain", v: "  };" }] },
  { tokens: [{ t: "plain", v: "}" }] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Components
// ─────────────────────────────────────────────────────────────────────────────

const STATE_CONFIG: Record<SecurityState, { label: string; color: string; pulse: boolean }> = {
  SECURE:  { label: "Secure",  color: "var(--color-success)", pulse: false },
  BLURRED: { label: "Blurred", color: "var(--color-warning)", pulse: true  },
  LOCKED:  { label: "Locked",  color: "var(--color-danger)",  pulse: true  },
};

// ── Live Clock ────────────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = time.getHours().toString().padStart(2, "0");
  const mm = time.getMinutes().toString().padStart(2, "0");
  const ss = time.getSeconds().toString().padStart(2, "0");
  return (
    <div
      className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono tabular-nums select-none"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)",
        color: "var(--color-text-secondary)",
        letterSpacing: "0.05em",
      }}
    >
      <Clock size={10} style={{ color: "var(--theme-primary)", flexShrink: 0 }} />
      <span style={{ color: "var(--color-text)" }}>{hh}:{mm}</span>
      <motion.span
        key={ss}
        initial={{ opacity: 0.3 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        style={{ color: "var(--color-muted)" }}
      >
        :{ss}
      </motion.span>
    </div>
  );
}

// ── Security State Badge — simplified: dot + text, no pill bg ────────────────
function SecurityStateBadge({ state }: { state: SecurityState }) {
  const cfg = STATE_CONFIG[state];
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-1.5 h-1.5 rounded-full ${cfg.pulse ? "animate-pulse" : ""}`}
        style={{ background: cfg.color, boxShadow: `0 0 5px ${cfg.color}`, flexShrink: 0 }}
      />
      <span
        style={{
          fontSize: "var(--fs-xs)",
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          color: cfg.color,
          letterSpacing: "0.02em",
        }}
      >
        {cfg.label}
      </span>
    </div>
  );
}

// ── Sensor Status Dot — for the status cluster ────────────────────────────────
function SensorDot({
  color,
  tooltip,
  icon: Icon,
  iconSize = 10,
}: {
  color: string;
  tooltip: string;
  icon: React.ElementType;
  iconSize?: number;
}) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      onFocus={() => setShowTip(true)}
      onBlur={() => setShowTip(false)}
      tabIndex={0}
      role="button"
      aria-label={tooltip}
    >
      <Icon size={iconSize} style={{ color }} />
      <AnimatePresence>
        {showTip && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: "50%",
              transform: "translateX(-50%)",
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              padding: "3px 8px",
              fontSize: "10px",
              fontFamily: "var(--font-body)",
              color: "var(--color-text-secondary)",
              whiteSpace: "nowrap",
              zIndex: 100,
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            }}
          >
            {tooltip}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SecurityTopBarProps {
  securityState: SecurityState;
  isConnected: boolean;
  faceCount: number | null;
  isDisconnected: boolean;
  deviceName: string | null;
  dominantColor: string | null;
  requestPairing: (namePrefix?: string) => Promise<void>;
  onLogout: () => void;
}

// ── Security Top Bar — h-12, "S" lettermark, simplified ─────────────────────
const SecurityTopBar = memo(function SecurityTopBar({
  securityState, isConnected, faceCount, isDisconnected,
  deviceName, dominantColor, requestPairing, onLogout,
}: SecurityTopBarProps) {
  const [showLogoutText, setShowLogoutText] = useState(false);

  return (
    <motion.header
      initial={{ y: -48, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 gap-4"
      style={{
        height: "48px",
        // Gradient bottom border instead of solid
        background: "rgba(10,10,15,0.90)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid transparent",
        backgroundImage: "linear-gradient(rgba(10,10,15,0.90), rgba(10,10,15,0.90)), linear-gradient(90deg, transparent, var(--color-border), transparent)",
        backgroundOrigin: "border-box",
        backgroundClip: "padding-box, border-box",
        boxShadow: "0 1px 0 0 var(--color-border-subtle)",
      }}
    >
      {/* "S" lettermark + Wordmark */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* "S" in display font — subtle pulse, no rotate */}
        <motion.div
          animate={{ opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          style={{
            width: "24px",
            height: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display, 'Satoshi', sans-serif)",
            fontWeight: 900,
            fontSize: "1rem",
            color: "var(--theme-primary)",
            letterSpacing: "-0.05em",
            lineHeight: 1,
          }}
        >
          S
        </motion.div>
        {/* Satoshi Bold, mixed case — no version number */}
        <span
          style={{
            fontSize: "var(--fs-sm)",
            fontWeight: 700,
            fontFamily: "var(--font-display, 'Satoshi', sans-serif)",
            color: "var(--color-text)",
            letterSpacing: "-0.01em",
          }}
        >
          A.R.T.H.U.R.
        </span>
      </div>

      {/* Security state badge — simplified (dot + text only) */}
      <SecurityStateBadge state={securityState} />

      {/* Right cluster */}
      <div className="flex items-center gap-3 shrink-0">
        <LiveClock />

        {/* Status cluster — 3 colored dots with tooltips */}
        <div
          className="hidden md:flex items-center gap-2.5 px-2.5 py-1 rounded-md"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <SensorDot
            icon={isConnected ? Wifi : WifiOff}
            color={isConnected ? "var(--color-success)" : "var(--color-muted)"}
            tooltip={isConnected ? "WebSocket: Live" : "WebSocket: Offline"}
          />
          <SensorDot
            icon={Eye}
            color={
              faceCount === 1
                ? "var(--color-success)"
                : faceCount === 0
                ? "var(--color-warning)"
                : "var(--color-muted)"
            }
            tooltip={
              faceCount === null
                ? "Face detection: —"
                : `${faceCount} face${faceCount !== 1 ? "s" : ""} detected`
            }
          />
          <SensorDot
            icon={isDisconnected ? BluetoothOff : Bluetooth}
            color={isDisconnected ? "var(--color-danger)" : "var(--color-success)"}
            tooltip={isDisconnected ? "BLE: Disconnected" : `BLE: ${deviceName ?? "Tethered"}`}
          />
        </div>

        {/* Sign Out — icon-only by default, text slides in on hover */}
        <motion.button
          type="button"
          aria-label="Sign Out"
          onClick={onLogout}
          onMouseEnter={() => setShowLogoutText(true)}
          onMouseLeave={() => setShowLogoutText(false)}
          onFocus={() => setShowLogoutText(true)}
          onBlur={() => setShowLogoutText(false)}
          title="Sign Out"
          aria-label="Sign Out"
          className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition-all duration-200"
          whileHover={{
            backgroundColor: "rgba(244,63,94,0.10)",
            borderColor: "rgba(244,63,94,0.3)",
          }}
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "var(--color-muted)",
          }}
        >
          <LogOut size={11} />
          <AnimatePresence>
            {showLogoutText && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18 }}
                style={{
                  fontSize: "var(--fs-xs)",
                  fontFamily: "var(--font-body)",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  color: "var(--color-danger)",
                }}
              >
                Sign out
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </motion.header>
  );
});

// ── Metric Card — 3D tilt, no HUD corners, no shimmer, hero-only accent line ──
const MetricCard = memo(function MetricCard({
  label, value, sub, delta, trend, icon: Icon, note, index = 0, isHero = false,
}: (typeof METRICS)[number] & { index?: number }) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Activity;
  const trendColor =
    trend === "up" ? "var(--color-success)"
    : trend === "down" ? "var(--color-warning)"
    : "var(--color-muted)";

  return (
    <TiltCard
      className="relative flex flex-col gap-3 p-5 rounded-xl overflow-hidden"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        transition: "border-color 0.3s ease",
      }}
    >
      {/* Top accent line — ONLY on the hero metric card */}
      {isHero && (
        <div
          className="absolute top-0 left-0 right-0 h-[1px]"
          style={{
            background: "linear-gradient(90deg, transparent, var(--theme-primary), transparent)",
            opacity: 0.6,
          }}
        />
      )}

      {/* Row: icon + delta badge */}
      <div className="relative flex items-start justify-between" style={{ zIndex: 2 }}>
        {/* Icon directly on card, no box, text-secondary color */}
        <Icon size={20} style={{ color: "var(--color-text-secondary)", flexShrink: 0, marginTop: "1px" }} />
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{
            background: `color-mix(in srgb, ${trendColor} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${trendColor} 25%, transparent)`,
            color: trendColor,
          }}
        >
          <TrendIcon size={9} />
          <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--fs-xs)" }}>{delta}</span>
        </div>
      </div>

      {/* Value + label */}
      <div className="relative" style={{ zIndex: 2 }}>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.08 + 0.18, duration: 0.4 }}
        >
          <NumberFlip value={value} sub={sub} />
        </motion.div>
        <p className="text-xs font-medium mt-0.5" style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-body)" }}>{label}</p>
        <p className="text-[10px] mt-1" style={{ color: "var(--color-muted)", fontFamily: "var(--font-body)" }}>{note}</p>
      </div>
    </TiltCard>
  );
});

// ── Terminal Panel ─────────────────────────────────────────────────────────────
const LEVEL_COLORS: Record<string, string> = {
  INFO:  "var(--color-success)",
  WARN:  "var(--color-warning)",
  ERROR: "var(--color-danger)",
};

const TerminalPanel = memo(function TerminalPanel({ isConnected }: { isConnected: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"system" | "network">("system");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.35 }}
      className="flex flex-col rounded-xl overflow-hidden h-full"
      // Slightly warmer terminal bg
      style={{ background: "#0c0e14", border: "1px solid var(--color-border)" }}
    >
      {/* Title bar with traffic lights + tabs */}
      <div className="flex items-center gap-2 px-4 py-2.5 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {/* Traffic lights — non-interactive */}
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: "var(--color-danger)", opacity: 0.8 }} />
          <span className="w-3 h-3 rounded-full" style={{ background: "var(--color-warning)", opacity: 0.8 }} />
          <span className="w-3 h-3 rounded-full" style={{ background: "var(--color-success)", opacity: 0.8 }} />
        </div>

        {/* Log filter tabs */}
        <div className="ml-3 flex items-center gap-1">
          {(["system", "network"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              aria-label={`${tab} log tab`}
              onClick={() => setActiveTab(tab)}
              style={{
                background: activeTab === tab ? "rgba(255,255,255,0.06)" : "transparent",
                border: "none",
                borderRadius: "4px",
                padding: "2px 8px",
                cursor: "pointer",
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                color: activeTab === tab ? "var(--color-text-secondary)" : "var(--color-muted)",
                transition: "all 0.15s ease",
              }}
            >
              {tab}.log
            </button>
          ))}
        </div>

        {/* Live indicator — just the pulsing dot, no "LIVE" text */}
        <div className="ml-auto flex items-center gap-1.5">
          {isConnected && (
            <motion.span
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--color-success)" }}
            />
          )}
          {!isConnected && (
            <span className="text-[10px] font-mono" style={{ color: "var(--color-muted)" }}>
              ○ OFFLINE
            </span>
          )}
        </div>
      </div>

      {/* Log lines — with alternating row backgrounds + scanlines texture */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto terminal-scanlines"
        style={{ scrollBehavior: "smooth" }}
      >
        {TERMINAL_LINES.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.4 + i * 0.045 }}
            className="flex gap-2 font-mono text-[11px] leading-relaxed px-3 py-0.5"
            style={{
              background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
              // ERROR lines get a subtle left-border accent
              borderLeft: line.level === "ERROR" ? "2px solid var(--color-danger)" : "2px solid transparent",
            }}
          >
            <span style={{ color: "var(--color-muted)", userSelect: "none", flexShrink: 0 }}>[{line.time}]</span>
            <span
              className="font-semibold shrink-0"
              style={{ color: LEVEL_COLORS[line.level] ?? "var(--color-muted)", width: "38px", textAlign: "left" }}
            >
              {line.level}
            </span>
            <span style={{
              color: line.level === "ERROR"
                ? "var(--color-danger)"
                : line.level === "WARN"
                ? "var(--color-warning)"
                : "var(--color-text-secondary)"
            }}>
              {line.msg}
            </span>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 + TERMINAL_LINES.length * 0.045 + 0.2 }}
          className="flex gap-2 font-mono text-[11px] leading-relaxed mt-1 px-3 py-0.5"
        >
          <span style={{ color: "var(--theme-primary)", opacity: 0.6 }}>root@sentry-node-07</span>
          <span style={{ color: "var(--color-muted)" }}>~</span>
          <span style={{ color: "var(--color-text-secondary)" }}>%</span>
          <span className="animate-blink-cursor ml-0.5" style={{ color: "var(--theme-primary)" }}>▊</span>
        </motion.div>
      </div>
    </motion.div>
  );
});

// Catppuccin Mocha-inspired token colors — warmer, more cohesive
const TOKEN_COLORS: Record<string, string> = {
  comment: "#585b70",  // surface2 — quiet
  keyword: "#cba6f7",  // mauve
  fn:      "#89b4fa",  // blue
  type:    "#f9e2af",  // yellow
  str:     "#a6e3a1",  // green
  num:     "#fab387",  // peach
  plain:   "#cdd6f4",  // text
};

// ── Code Panel ──────────────────────────────────────────────────────────────
const CodePanel = memo(function CodePanel() {
  return (
    <div className="flex flex-col rounded-xl overflow-hidden h-full" style={{ background: "#0c0e14", border: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-2 px-4 py-2.5 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <Code2 size={12} style={{ color: "var(--color-muted)" }} />
        <span className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>auth/validatePresence.ts</span>
        {/* Static red dot — not flashing */}
        <div className="ml-auto flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--color-danger)" }}
          />
          <span
            className="text-[9px] font-semibold tracking-widest"
            style={{ color: "var(--color-danger)", fontFamily: "var(--font-body)" }}
          >
            RESTRICTED L4+
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto terminal-scanlines" style={{ background: "#0c0e14" }}>
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <tbody>
            {CODE_LINES.map((line, i) => (
              <tr
                key={i}
                // Static highlight on the security check line (line 12 = index 11)
                style={{
                  background: i === 11
                    ? `color-mix(in srgb, var(--theme-primary) 4%, transparent)`
                    : "transparent",
                }}
              >
                <td
                  className="pl-3 pr-4 text-right select-none"
                  style={{
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    // 35% opacity line numbers
                    color: "rgba(88, 91, 112, 0.55)",
                    verticalAlign: "top",
                    paddingTop: "1px",
                    width: "32px",
                    minWidth: "32px",
                  }}
                >
                  {i + 1}
                </td>
                <td className="pr-4 py-px">
                  <span className="font-mono text-[11px] leading-relaxed">
                    {line.tokens.map((tok, j) => (
                      <span key={j} style={{ color: TOKEN_COLORS[tok.t] ?? "#cdd6f4" }}>{tok.v}</span>
                    ))}
                    {line.tokens.length === 0 && <>&nbsp;</>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

// ── Security Events Table ──────────────────────────────────────────────────
const SEVERITY_STYLE: Record<string, { bg: string; color: string; size?: string }> = {
  CRITICAL: { bg: "rgba(244,63,94,0.15)",  color: "var(--color-danger)",  size: "11px" },
  HIGH:     { bg: "rgba(245,166,35,0.18)", color: "var(--color-warning)", size: "10px" },
  MEDIUM:   { bg: "rgba(0,212,255,0.12)",  color: "var(--color-accent)",  size: "10px" },
  INFO:     { bg: "rgba(90,90,110,0.15)",  color: "var(--color-muted)",   size: "9px"  },
};

const UNRESOLVED_COUNT = SECURITY_EVENTS.filter(e => !e.resolved).length;

const SecurityEventsTable = memo(function SecurityEventsTable() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.55 }}
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* Header — title only, unresolved count moved to filter row */}
      <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert size={13} style={{ color: "var(--theme-primary)" }} />
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, fontFamily: "var(--font-body)", color: "var(--color-text)" }}>
            Security Event Log
          </span>
        </div>
        {/* Filter/tab row with unresolved count */}
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 rounded text-[10px] font-medium"
            style={{
              background: "rgba(244,63,94,0.1)",
              color: "var(--color-danger)",
              border: "1px solid rgba(244,63,94,0.2)",
              fontFamily: "var(--font-body)",
            }}
          >
            {UNRESOLVED_COUNT} unresolved
          </span>
          <span
            className="px-2 py-0.5 rounded text-[10px] font-medium"
            style={{
              background: "rgba(255,255,255,0.04)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-body)",
            }}
          >
            All events
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs table-striped">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
              {["ID", "Time", "Event", "Severity", "Actor", "Status"].map((h) => (
                <th
                  key={h}
                  className="px-5 py-2.5 text-left font-medium uppercase"
                  style={{ fontSize: "var(--fs-xs)", color: "var(--color-muted)", fontFamily: "var(--font-body)", letterSpacing: "0.06em" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECURITY_EVENTS.map((evt, i) => {
              const sev = SEVERITY_STYLE[evt.severity] ?? SEVERITY_STYLE.INFO;
              return (
                <motion.tr
                  key={evt.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.6 + i * 0.07 }}
                  whileHover={{ backgroundColor: "rgba(255,255,255,0.025)" }}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                >
                  <td className="px-5 py-3 font-mono" style={{ color: "var(--color-muted)", fontSize: "var(--fs-xs)" }}>{evt.id}</td>
                  <td className="px-5 py-3 font-mono whitespace-nowrap" style={{ color: "var(--color-text-secondary)", fontSize: "var(--fs-xs)" }}>
                    <Clock size={10} className="inline mr-1.5 opacity-50" />{evt.timestamp}
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--color-text)", fontFamily: "var(--font-body)", fontSize: "var(--fs-xs)" }}>{evt.event}</td>
                  <td className="px-5 py-3">
                    <span
                      className="font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: sev.bg,
                        color: sev.color,
                        fontSize: sev.size ?? "10px",
                        fontFamily: "var(--font-body)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {evt.severity}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono" style={{ color: "var(--color-text-secondary)", fontSize: "var(--fs-xs)" }}>{evt.actor}</td>
                  <td className="px-5 py-3">
                    {evt.resolved ? (
                      // Green check only — text on tooltip
                      <span title="Resolved" style={{ color: "var(--color-success)", cursor: "default" }}>
                        <CheckCircle2 size={13} />
                      </span>
                    ) : (
                      // Static red dot + "Active" — no blinking
                      <span className="flex items-center gap-1.5" style={{ color: "var(--color-danger)" }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--color-danger)" }} />
                        <span style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-body)", fontWeight: 500 }}>Active</span>
                      </span>
                    )}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
});

// ── Server Health — horizontal bar chart layout ───────────────────────────────
const SERVER_NODES = [
  { name: "sentry-eu-01",   region: "Frankfurt",  health: 100, latency: "18ms" },
  { name: "sentry-us-01",   region: "Virginia",   health: 98,  latency: "42ms" },
  { name: "sentry-ap-01",   region: "Singapore",  health: 95,  latency: "91ms" },
  { name: "sentry-proc-03", region: "AI Node",    health: 72,  latency: "8ms"  },
];

const ServerHealthRow = memo(function ServerHealthRow() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.7 }}
      className="rounded-xl px-5 py-4"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Server size={12} style={{ color: "var(--theme-primary)" }} />
          <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600, fontFamily: "var(--font-body)", color: "var(--color-text-secondary)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Infrastructure
          </span>
        </div>
        <div className="flex items-center gap-1.5" style={{ color: "var(--color-muted)" }}>
          <motion.div
            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Radio size={10} style={{ color: "var(--theme-primary)" }} />
          </motion.div>
          <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>LIVE</span>
        </div>
      </div>

      {/* Horizontal bar chart layout */}
      <div className="flex flex-col gap-3">
        {SERVER_NODES.map((node, i) => {
          const color =
            node.health >= 95 ? "var(--color-success)"
            : node.health >= 80 ? "var(--color-warning)"
            : "var(--color-danger)";
          const isDegraded = node.health < 80;

          return (
            <motion.div
              key={node.name}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.75 + i * 0.06, duration: 0.3 }}
              className="flex items-center gap-4"
            >
              {/* Server name + region inline */}
              <div style={{ minWidth: "160px" }}>
                <div className="flex items-center gap-1.5">
                  {/* Only pulsing dot on degraded server */}
                  {isDegraded ? (
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: color }}
                    />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  )}
                  <span style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", fontWeight: 500 }}>
                    {node.name}
                  </span>
                  <span style={{ fontSize: "9px", color: "var(--color-muted)", fontFamily: "var(--font-body)" }}>
                    · {node.region}
                  </span>
                </div>
              </div>

              {/* 4px gradient health bar */}
              <div
                className="flex-1 relative rounded-full overflow-hidden"
                style={{ height: "4px", background: "rgba(255,255,255,0.07)" }}
              >
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${node.health}%` }}
                  transition={{ duration: 1.1, delay: 0.8 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 70%, var(--color-success)))`,
                  }}
                />
              </div>

              {/* Health % + latency */}
              <div className="flex items-center gap-2.5" style={{ minWidth: "80px", justifyContent: "flex-end" }}>
                <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600, fontFamily: "var(--font-body)", color }}>{node.health}%</span>
                <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--color-muted)" }}>{node.latency}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
});

interface DashboardContentProps {
  isConnected: boolean;
  securityState: SecurityState;
}

const DashboardContent = memo(function DashboardContent({ isConnected, securityState }: DashboardContentProps) {
  return (
    <div className="p-6 space-y-5 min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1
            style={{
              fontSize: "var(--fs-lg)",
              fontWeight: 700,
              fontFamily: "var(--font-display, 'Satoshi', sans-serif)",
              color: "var(--color-text)",
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            Operations Desk
          </h1>
          <p style={{ fontSize: "var(--fs-xs)", marginTop: "0.2rem", color: "var(--color-muted)", fontFamily: "var(--font-body)" }}>
            <Globe size={9} className="inline mr-1" />
            A.R.T.H.U.R. Enterprise Terminal · Cluster: EU-PROD-07 · Zone: fra1
          </p>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.35 }}
          className="hidden sm:flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)", fontFamily: "var(--font-body)" }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          >
            <Activity size={11} style={{ color: "var(--theme-primary)" }} />
          </motion.div>
          <span>State: </span>
          <span className="font-semibold" style={{ color: STATE_CONFIG[securityState].color }}>{securityState}</span>
        </motion.div>
      </motion.div>

      {/* Metric cards — staggered, with 3D tilt */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {METRICS.map((m, i) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, delay: i * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <MetricCard {...m} index={i} />
          </motion.div>
        ))}
      </div>

      {/* Terminal + Code panels */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.3 }}
        className="grid grid-cols-1 lg:grid-cols-5 gap-4"
        style={{ minHeight: "300px" }}
      >
        <div className="lg:col-span-3"><TerminalPanel isConnected={isConnected} /></div>
        <div className="lg:col-span-2"><CodePanel /></div>
      </motion.div>

      <SecurityEventsTable />
      <ServerHealthRow />
      <div className="h-4" />
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Inner — rendered inside PresentationModeProvider
// ─────────────────────────────────────────────────────────────────────────────

function DashboardInner() {
  const { overrideState, isOverrideActive } = usePresentationMode();
  const router = useRouter();

  const {
    securityState, faceCount, dominantColor, isConnected,
    isDisconnected, isSupported, deviceName, rssi, distance,
    isGattOnly, isPairing, availableDevices,
    scan, pair, unpair, requestPairing,
  } = useSecurityState();

  const finalSecurityState = overrideState ?? securityState;

  const bleConnected = !isDisconnected;
  const handleLogout = useCallback(() => {
    fetch("http://localhost:8000/bluetooth/unpair", { method: "POST" }).catch(() => {});
    logout(router);
  }, [router]);

  const { isGracePeriod, remainingSeconds } = useBleAutoLogout(bleConnected, handleLogout);

  return (
    <ChameleonWrapper dominantColor={dominantColor}>
      <div
        className="relative min-h-screen"
        style={{ background: "var(--chameleon-bg, var(--color-bg))", transition: "background-color 0.8s ease-in-out" }}
      >
        {/* ── Always-visible security header (z-40, outside blur zone) ── */}
        <SecurityTopBar
          securityState={finalSecurityState}
          isConnected={isConnected}
          faceCount={faceCount}
          isDisconnected={isDisconnected}
          deviceName={deviceName}
          dominantColor={dominantColor}
          requestPairing={requestPairing}
          onLogout={handleLogout}
        />

        {/* ── Presentation Mode indicator strip ── */}
        {isOverrideActive && (
          <div
            className="fixed top-12 left-0 right-0 z-40 flex items-center justify-center py-1"
            style={{
              background: "rgba(234,179,8,0.07)",
              borderBottom: "1px solid rgba(234,179,8,0.22)",
              color: "rgba(234,179,8,0.65)",
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.12em",
            }}
          >
            ⌨ PRESENTATION MODE — Ctrl+Shift+0 to restore sensors
          </div>
        )}

        {/* ── Protected content canvas ── */}
        <div className={isOverrideActive ? "pt-[3.25rem]" : "pt-12"}>
          <GlassOverlay securityState={finalSecurityState}>
            <DashboardContent isConnected={isConnected} securityState={finalSecurityState} />
          </GlassOverlay>
        </div>

        {/* ── Lock screen (z-50, outside blur zone) ── */}
        <AnimatePresence>
          {finalSecurityState === "LOCKED" && (
            <LockScreen
              deviceName={deviceName}
              rssi={rssi}
              distance={distance}
              isSupported={isSupported}
              isDisconnected={isDisconnected}
              isGattOnly={isGattOnly}
              isPairing={isPairing}
              availableDevices={availableDevices}
              scan={scan}
              pair={pair}
              requestPairing={requestPairing}
              isGracePeriod={isGracePeriod}
              remainingSeconds={remainingSeconds}
            />
          )}
        </AnimatePresence>
      </div>
    </ChameleonWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — auth guard fires here, provider wraps everything below
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  useAuthGuard();

  return (
    <PresentationModeProvider>
      <DashboardInner />
    </PresentationModeProvider>
  );
}
