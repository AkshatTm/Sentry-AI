/**
 * Dashboard — SentryOS Master Integration Route (Phase 4)
 *
 * Component tree:
 *   <PresentationModeProvider>   — keyboard override engine + corner toast
 *     <DashboardInner>           — sensor hooks + override resolution
 *       <ChameleonWrapper>       — CSS variable injection, no DOM
 *         <div root>
 *           <SecurityTopBar />   — FIXED, ALWAYS VISIBLE, outside blur
 *           [OverrideStrip]      — subtle yellow band when override is active
 *           <GlassOverlay>       — blur/grayscale filter driven by finalSecurityState
 *             <DashboardContent />
 *           </GlassOverlay>
 *           <AnimatePresence>
 *             <LockScreen />     — conditionally mounted via finalSecurityState
 *           </AnimatePresence>
 *         </div>
 *       </ChameleonWrapper>
 *     </DashboardInner>
 *   </PresentationModeProvider>
 *
 * Auth: useAuthGuard() in DashboardPage redirects to / if sessionStorage sentinel absent.
 * Override: finalSecurityState = overrideState ?? securityState  (presenter keyboard wins).
 * Hook call order: useAuthGuard → PresentationModeProvider → DashboardInner hooks.
 */

"use client";

import { memo } from "react";
import { AnimatePresence } from "framer-motion";
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
import { useSecurityState, type SecurityState } from "@/hooks/useSecurityState";
import { PresentationModeProvider, usePresentationMode } from "@/context/PresentationModeContext";
import { useAuthGuard } from "@/hooks/useAuthGuard";

// ─────────────────────────────────────────────────────────────────────────────
// Mock Enterprise Data (module-level constants — stable, never re-created)
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
  },
];

const TERMINAL_LINES = [
  { time: "09:14:20", level: "INFO",  msg: "SentryOS kernel v3.1.0 boot sequence complete" },
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

const CODE_LINES: { tokens: { t: string; v: string }[] }[] = [
  { tokens: [{ t: "comment", v: "// CONFIDENTIAL — SentryOS Zero-Trust Auth Service" }] },
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
  SECURE:  { label: "SECURE",  color: "var(--color-success)", pulse: false },
  BLURRED: { label: "BLURRED", color: "var(--color-warning)", pulse: true  },
  LOCKED:  { label: "LOCKED",  color: "var(--color-danger)",  pulse: true  },
};

function SecurityStateBadge({ state }: { state: SecurityState }) {
  const cfg = STATE_CONFIG[state];
  return (
    <div
      className="flex items-center gap-2 px-3 py-1 rounded-full"
      style={{
        background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
        border:     `1px solid color-mix(in srgb, ${cfg.color} 35%, transparent)`,
      }}
    >
      <span
        className={`w-2 h-2 rounded-full ${cfg.pulse ? "animate-pulse" : ""}`}
        style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }}
      />
      <span className="text-xs font-semibold tracking-widest" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
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
  requestPairing: () => Promise<void>;
}

const SecurityTopBar = memo(function SecurityTopBar({
  securityState, isConnected, faceCount, isDisconnected,
  deviceName, dominantColor, requestPairing,
}: SecurityTopBarProps) {
  return (
    <header
      className="fixed top-0 left-0 right-0 h-14 z-40 flex items-center justify-between px-6 gap-4"
      style={{
        background: "rgba(13,13,13,0.85)",
        borderBottom: "1px solid var(--theme-border)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {/* Wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <div
          className="flex items-center justify-center w-7 h-7 rounded"
          style={{ background: "var(--theme-glow)", border: "1px solid var(--theme-border)" }}
        >
          <Eye size={14} style={{ color: "var(--theme-primary)" }} />
        </div>
        <span
          className="text-sm font-semibold tracking-widest uppercase"
          style={{ color: "var(--color-text)", fontFamily: "monospace" }}
        >
          SentryOS
        </span>
        <span className="hidden sm:block text-xs" style={{ color: "var(--color-muted)" }}>
          Zero-Trust Terminal v3.0
        </span>
      </div>

      {/* Security state badge */}
      <SecurityStateBadge state={securityState} />

      {/* Right sensor chips */}
      <div className="flex items-center gap-2 shrink-0">
        <div
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: isConnected ? "var(--color-success)" : "var(--color-muted)",
          }}
        >
          {isConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
          <span className="ml-1">WS</span>
        </div>
        <div
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: faceCount === 1 ? "var(--color-success)" : faceCount === 0 ? "var(--color-warning)" : "var(--color-muted)",
          }}
        >
          <Eye size={11} />
          <span className="ml-1">{faceCount === null ? "—" : faceCount}</span>
        </div>
        {dominantColor && (
          <div
            className="hidden md:block w-5 h-5 rounded-full ring-1 ring-white/10 shrink-0"
            style={{ background: dominantColor }}
            title={`Dominant color: ${dominantColor}`}
          />
        )}
        {isDisconnected ? (
          <button
            onClick={requestPairing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer"
            style={{
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "var(--color-danger)",
            }}
          >
            <BluetoothOff size={11} />
            <span className="ml-1">Pair</span>
          </button>
        ) : (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
            style={{
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.25)",
              color: "var(--color-success)",
            }}
          >
            <Bluetooth size={11} />
            <span className="ml-1 max-w-[80px] truncate">{deviceName ?? "Tethered"}</span>
          </div>
        )}
      </div>
    </header>
  );
});

const MetricCard = memo(function MetricCard({ label, value, sub, delta, trend, icon: Icon, note }: (typeof METRICS)[number]) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Activity;
  const trendColor = trend === "up" ? "var(--color-success)" : trend === "down" ? "var(--color-warning)" : "var(--color-muted)";
  return (
    <div
      className="relative flex flex-col gap-3 p-5 rounded-xl overflow-hidden"
      style={{ background: "var(--color-surface)", border: "1px solid var(--theme-border)" }}
    >
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "var(--theme-primary)", opacity: 0.6 }} />
      <div className="flex items-start justify-between">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg"
          style={{ background: "var(--theme-glow)", border: "1px solid var(--theme-border)" }}
        >
          <Icon size={15} style={{ color: "var(--theme-primary)" }} />
        </div>
        <div className="flex items-center gap-1 text-xs font-medium" style={{ color: trendColor }}>
          <TrendIcon size={11} />
          <span>{delta}</span>
        </div>
      </div>
      <div>
        <div className="flex items-baseline gap-0.5">
          <span className="text-2xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>{value}</span>
          <span className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>{sub}</span>
        </div>
        <p className="text-xs font-medium mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{label}</p>
        <p className="text-[10px] mt-1" style={{ color: "var(--color-muted)" }}>{note}</p>
      </div>
    </div>
  );
});

const LEVEL_COLORS: Record<string, string> = {
  INFO:  "var(--color-success)",
  WARN:  "var(--color-warning)",
  ERROR: "var(--color-danger)",
};

const TerminalPanel = memo(function TerminalPanel({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="flex flex-col rounded-xl overflow-hidden h-full" style={{ background: "#080b10", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center gap-2 px-4 py-2.5 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-danger opacity-80" />
          <span className="w-3 h-3 rounded-full bg-warning opacity-80" />
          <span className="w-3 h-3 rounded-full bg-success opacity-80" />
        </div>
        <Terminal size={12} className="ml-2" style={{ color: "var(--color-muted)" }} />
        <span className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>sentry-node-07 — system.log</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "animate-pulse" : ""}`}
            style={{ background: isConnected ? "var(--color-success)" : "var(--color-muted)" }} />
          <span className="text-[10px] font-mono" style={{ color: "var(--color-muted)" }}>{isConnected ? "LIVE" : "OFFLINE"}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-0.5" style={{ maxHeight: "260px" }}>
        {TERMINAL_LINES.map((line, i) => (
          <div key={i} className="flex gap-2 font-mono text-[11px] leading-relaxed">
            <span style={{ color: "var(--color-muted)", userSelect: "none" }}>[{line.time}]</span>
            <span className="font-semibold w-10 shrink-0 text-right" style={{ color: LEVEL_COLORS[line.level] ?? "var(--color-muted)" }}>{line.level}</span>
            <span style={{ color: "var(--color-text-secondary)" }}>{line.msg}</span>
          </div>
        ))}
        <div className="flex gap-2 font-mono text-[11px] leading-relaxed">
          <span style={{ color: "var(--color-muted)" }}>root@sentry-node-07 ~ %&nbsp;</span>
          <span className="animate-pulse" style={{ color: "var(--theme-primary)" }}>▊</span>
        </div>
      </div>
    </div>
  );
});

const TOKEN_COLORS: Record<string, string> = {
  comment: "#6b7280", keyword: "#c792ea", fn: "#82aaff",
  type: "#ffcb6b", str: "#c3e88d", num: "#f78c6c", plain: "#e0e0e0",
};

const CodePanel = memo(function CodePanel() {
  return (
    <div className="flex flex-col rounded-xl overflow-hidden h-full" style={{ background: "#080b10", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center gap-2 px-4 py-2.5 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <Code2 size={12} style={{ color: "var(--color-muted)" }} />
        <span className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>auth/validatePresence.ts</span>
        <span className="ml-auto text-[9px] font-semibold tracking-widest px-1.5 py-0.5 rounded"
          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", color: "var(--color-danger)" }}>
          RESTRICTED L4+
        </span>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: "260px" }}>
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <tbody>
            {CODE_LINES.map((line, i) => (
              <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                <td className="pl-3 pr-4 text-right text-[10px] font-mono select-none w-8 shrink-0"
                  style={{ color: "rgba(107,114,128,0.5)", verticalAlign: "top", paddingTop: "1px" }}>
                  {i + 1}
                </td>
                <td className="pr-4 py-px">
                  <span className="font-mono text-[11px] leading-relaxed">
                    {line.tokens.map((tok, j) => (
                      <span key={j} style={{ color: TOKEN_COLORS[tok.t] ?? "#e0e0e0" }}>{tok.v}</span>
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

const SEVERITY_STYLE: Record<string, { bg: string; color: string }> = {
  CRITICAL: { bg: "rgba(239,68,68,0.15)",  color: "var(--color-danger)"  },
  HIGH:     { bg: "rgba(245,158,11,0.18)", color: "var(--color-warning)" },
  MEDIUM:   { bg: "rgba(0,212,255,0.12)",  color: "var(--color-accent)"  },
  INFO:     { bg: "rgba(107,114,128,0.15)",color: "var(--color-muted)"   },
};

const SecurityEventsTable = memo(function SecurityEventsTable() {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface)", border: "1px solid var(--theme-border)" }}>
      <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <ShieldAlert size={13} style={{ color: "var(--theme-primary)" }} />
        <span className="text-xs font-semibold tracking-wide" style={{ color: "var(--color-text)" }}>Security Event Log</span>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full"
          style={{ background: "rgba(239,68,68,0.12)", color: "var(--color-danger)", border: "1px solid rgba(239,68,68,0.25)" }}>
          2 UNRESOLVED
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              {["ID", "Time", "Event", "Severity", "Actor", "Status"].map((h) => (
                <th key={h} className="px-5 py-2.5 text-left font-medium tracking-wide text-[10px] uppercase"
                  style={{ color: "var(--color-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECURITY_EVENTS.map((evt) => {
              const sev = SEVERITY_STYLE[evt.severity] ?? SEVERITY_STYLE.INFO;
              return (
                <tr key={evt.id} className="transition-colors duration-150 hover:bg-white/[0.025]"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <td className="px-5 py-3 font-mono" style={{ color: "var(--color-muted)" }}>{evt.id}</td>
                  <td className="px-5 py-3 font-mono whitespace-nowrap" style={{ color: "var(--color-text-secondary)" }}>
                    <Clock size={10} className="inline mr-1.5 opacity-50" />{evt.timestamp}
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--color-text)" }}>{evt.event}</td>
                  <td className="px-5 py-3">
                    <span className="text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full"
                      style={{ background: sev.bg, color: sev.color }}>{evt.severity}</span>
                  </td>
                  <td className="px-5 py-3 font-mono" style={{ color: "var(--color-text-secondary)" }}>{evt.actor}</td>
                  <td className="px-5 py-3">
                    {evt.resolved ? (
                      <span className="flex items-center gap-1.5" style={{ color: "var(--color-success)" }}>
                        <CheckCircle2 size={11} /><span className="text-[10px]">Resolved</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 animate-pulse" style={{ color: "var(--color-danger)" }}>
                        <AlertTriangle size={11} /><span className="text-[10px]">Active</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

const SERVER_NODES = [
  { name: "sentry-eu-01",   region: "Frankfurt",  health: 100, latency: "18ms" },
  { name: "sentry-us-01",   region: "Virginia",   health: 98,  latency: "42ms" },
  { name: "sentry-ap-01",   region: "Singapore",  health: 95,  latency: "91ms" },
  { name: "sentry-proc-03", region: "AI Node",    health: 72,  latency: "8ms"  },
];

const ServerHealthRow = memo(function ServerHealthRow() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl px-5 py-3"
      style={{ background: "var(--color-surface)", border: "1px solid var(--theme-border)" }}>
      <div className="flex items-center gap-2 mr-2">
        <Server size={12} style={{ color: "var(--theme-primary)" }} />
        <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--color-text-secondary)" }}>
          Infrastructure
        </span>
      </div>
      {SERVER_NODES.map((node) => (
        <div key={node.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{
            background: node.health >= 95 ? "var(--color-success)" : node.health >= 80 ? "var(--color-warning)" : "var(--color-danger)",
            boxShadow: node.health >= 95 ? "0 0 5px var(--color-success)" : "0 0 5px var(--color-warning)",
          }} />
          <span className="text-[10px] font-mono" style={{ color: "var(--color-text-secondary)" }}>{node.name}</span>
          <span className="text-[10px]" style={{ color: "var(--color-muted)" }}>{node.health}% · {node.latency}</span>
          <span className="text-[10px]" style={{ color: "rgba(107,114,128,0.4)" }}>{node.region}</span>
        </div>
      ))}
      <div className="ml-auto flex items-center gap-1.5" style={{ color: "var(--color-muted)" }}>
        <Radio size={10} className="animate-pulse" />
        <span className="text-[9px] font-mono tracking-wide">LIVE TELEMETRY</span>
      </div>
    </div>
  );
});

interface DashboardContentProps {
  isConnected: boolean;
  securityState: SecurityState;
}

const DashboardContent = memo(function DashboardContent({ isConnected, securityState }: DashboardContentProps) {
  return (
    <div className="p-6 space-y-5 min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-text)" }}>Operations Desk</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            <Globe size={9} className="inline mr-1" />
            SentryOS Enterprise Terminal · Cluster: EU-PROD-07 · Zone: fra1
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg"
          style={{ background: "var(--color-surface)", border: "1px solid var(--theme-border)", color: "var(--color-text-secondary)" }}>
          <Activity size={11} style={{ color: "var(--theme-primary)" }} />
          <span>State: </span>
          <span className="font-semibold" style={{ color: STATE_CONFIG[securityState].color }}>{securityState}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {METRICS.map((m) => <MetricCard key={m.id} {...m} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ minHeight: "300px" }}>
        <div className="lg:col-span-3"><TerminalPanel isConnected={isConnected} /></div>
        <div className="lg:col-span-2"><CodePanel /></div>
      </div>
      <SecurityEventsTable />
      <ServerHealthRow />
      <div className="h-4" />
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Inner — rendered inside PresentationModeProvider
// ─────────────────────────────────────────────────────────────────────────────

// ⚡ Bolt: Wrapped static/heavy components in React.memo() to prevent
// unnecessary re-renders when the 10Hz WebSocket pushes new timestamp data.
function DashboardInner() {
  // Presentation override (null = sensors in control)
  const { overrideState, isOverrideActive } = usePresentationMode();

  // Live sensor pipeline
  const {
    securityState, faceCount, dominantColor, isConnected,
    isDisconnected, isSupported, deviceName, rssi, requestPairing,
  } = useSecurityState();

  // Override wins when set by presenter keyboard shortcut; sensors resume on Ctrl+Shift+0
  const finalSecurityState = overrideState ?? securityState;

  return (
    <ChameleonWrapper dominantColor={dominantColor}>
      <div className="relative min-h-screen" style={{ background: "var(--color-bg)" }}>

        {/* ── Always-visible security header (z-40, outside blur zone) ── */}
        <SecurityTopBar
          securityState={finalSecurityState}
          isConnected={isConnected}
          faceCount={faceCount}
          isDisconnected={isDisconnected}
          deviceName={deviceName}
          dominantColor={dominantColor}
          requestPairing={requestPairing}
        />

        {/* ── Presentation Mode indicator strip ── */}
        {isOverrideActive && (
          <div
            className="fixed top-14 left-0 right-0 z-40 flex items-center justify-center py-1"
            style={{
              background: "rgba(234,179,8,0.07)",
              borderBottom: "1px solid rgba(234,179,8,0.22)",
              color: "rgba(234,179,8,0.65)",
              fontSize: "9px",
              fontFamily: "monospace",
              letterSpacing: "0.12em",
            }}
          >
            ⌨ PRESENTATION MODE — Ctrl+Shift+0 to restore sensors
          </div>
        )}

        {/* ── Protected content canvas (shifts down when override strip is visible) ── */}
        <div className={isOverrideActive ? "pt-[3.25rem]" : "pt-14"}>
          <GlassOverlay securityState={finalSecurityState}>
            <DashboardContent isConnected={isConnected} securityState={finalSecurityState} />
          </GlassOverlay>
        </div>

        {/* ── Lock screen (z-50, outside blur zone, auto-heals on BLE return) ── */}
        <AnimatePresence>
          {finalSecurityState === "LOCKED" && (
            <LockScreen
              deviceName={deviceName}
              rssi={rssi}
              isSupported={isSupported}
              requestPairing={requestPairing}
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
  // Redirect to / immediately if sessionStorage sentinel is absent.
  // Must be the first hook call — fires before any render output.
  useAuthGuard();

  return (
    <PresentationModeProvider>
      <DashboardInner />
    </PresentationModeProvider>
  );
}
