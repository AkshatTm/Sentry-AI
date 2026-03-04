/**
 * Login Page — SentryOS
 *
 * The entry point for the demo. Presents a premium enterprise authentication
 * screen with a glassmorphism card, pre-filled identity, and a smooth auth
 * animation before redirecting to /dashboard.
 *
 * Auth flow:
 *   1. User enters passphrase (email is pre-filled).
 *   2. 800ms "Authenticating…" animation (simulates network round-trip).
 *   3. sessionStorage.setItem('sentry_auth', '1').
 *   4. router.push('/dashboard') — ChameleonWrapper stays live through transition.
 *
 * sessionStorage is intentionally used so the session clears automatically
 * when the presenter closes the tab between demo runs.
 */
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Eye, EyeOff, AlertCircle } from "lucide-react";
import { ChameleonWrapper } from "@/components/ChameleonWrapper";
import { AUTH_SESSION_KEY } from "@/hooks/useAuthGuard";

// ─── Animated background ──────────────────────────────────────────────────────

function GridBackground() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {/* Chameleon radial glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 65% 55% at 50% 38%, var(--theme-glow) 0%, transparent 72%)",
          opacity: 0.45,
          transition: "opacity 0.6s",
        }}
      />
      {/* Dot grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
    </div>
  );
}

// ─── System status strip ──────────────────────────────────────────────────────

function SystemStatus() {
  const items = [
    { label: "NODE", value: "SGX-PROD-07" },
    { label: "REGION", value: "IN-MUM-1" },
    { label: "TLS", value: "1.3 / ECDSA" },
    { label: "BUILD", value: "v4.0.0" },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: "1.5rem",
        flexWrap: "wrap",
        justifyContent: "center",
        fontSize: "0.625rem",
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.08em",
      }}
    >
      {items.map(({ label, value }) => (
        <span key={label}>
          <span style={{ color: "var(--color-muted)" }}>{label}: </span>
          <span style={{ color: "var(--theme-primary)" }}>{value}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Input field ──────────────────────────────────────────────────────────────

interface FieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder?: string;
  autoComplete?: string;
  hasError?: boolean;
  suffix?: React.ReactNode;
  inputRef?: React.RefObject<HTMLInputElement>;
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  disabled,
  placeholder,
  autoComplete,
  hasError,
  suffix,
  inputRef,
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = hasError
    ? "#ef4444"
    : focused
    ? "var(--theme-primary)"
    : "rgba(255,255,255,0.1)";

  return (
    <div>
      <label
        htmlFor={id}
        style={{
          display: "block",
          fontSize: "0.625rem",
          fontFamily: "'JetBrains Mono', monospace",
          color: "var(--color-muted)",
          letterSpacing: "0.12em",
          marginBottom: "0.375rem",
          textTransform: "uppercase",
        }}
      >
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          ref={inputRef}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${borderColor}`,
            borderRadius: "8px",
            padding: suffix
              ? "0.625rem 2.75rem 0.625rem 0.875rem"
              : "0.625rem 0.875rem",
            fontSize: "0.875rem",
            color: "var(--color-text)",
            fontFamily:
              type === "password"
                ? "monospace"
                : "'JetBrains Mono', monospace",
            outline: "none",
            transition: "border-color 0.2s, background 0.2s",
            boxSizing: "border-box",
            opacity: disabled ? 0.55 : 1,
          }}
        />
        {suffix && (
          <div
            style={{
              position: "absolute",
              right: "0.75rem",
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              color: "var(--color-muted)",
            }}
          >
            {suffix}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Auth phases ──────────────────────────────────────────────────────────────

type AuthPhase = "idle" | "authenticating" | "success" | "error";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("akshat.tomar@sentryos.corp");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phase, setPhase] = useState<AuthPhase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);

  const isLoading = phase === "authenticating" || phase === "success";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!password.trim()) {
      setErrorMsg("Passphrase is required.");
      setPhase("error");
      passwordRef.current?.focus();
      return;
    }

    setPhase("authenticating");

    // Simulated auth round-trip — 800ms to sell the narrative
    await new Promise<void>((r) => setTimeout(r, 800));

    sessionStorage.setItem(AUTH_SESSION_KEY, "1");
    setPhase("success");

    // Brief success flash, then navigate
    await new Promise<void>((r) => setTimeout(r, 380));
    router.push("/dashboard");
  };

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
        <GridBackground />

        {/* ── Auth Card ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            duration: 0.55,
            ease: [0.25, 0.46, 0.45, 0.94] as [
              number,
              number,
              number,
              number
            ],
          }}
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            maxWidth: "400px",
            background: "rgba(255, 255, 255, 0.035)",
            border: "1px solid var(--theme-border)",
            borderRadius: "16px",
            padding: "2.5rem",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow:
              "0 0 64px var(--theme-glow), 0 32px 64px rgba(0,0,0,0.45)",
          }}
        >
          {/* ── Wordmark ─────────────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginBottom: "2.25rem",
              gap: "0.75rem",
            }}
          >
            <motion.div
              animate={{
                boxShadow: [
                  "0 0 0px var(--theme-glow)",
                  "0 0 24px var(--theme-glow)",
                  "0 0 0px var(--theme-glow)",
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "52px",
                height: "52px",
                borderRadius: "14px",
                background: "var(--theme-glow)",
                border: "1.5px solid var(--theme-border)",
              }}
            >
              <ShieldCheck
                size={26}
                color="var(--theme-primary)"
                strokeWidth={1.75}
              />
            </motion.div>

            <div style={{ textAlign: "center" }}>
              <h1
                style={{
                  fontSize: "1.375rem",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  letterSpacing: "-0.02em",
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                SentryOS
              </h1>
              <p
                style={{
                  fontSize: "0.625rem",
                  color: "var(--color-muted)",
                  letterSpacing: "0.16em",
                  fontFamily: "'JetBrains Mono', monospace",
                  margin: "0.3rem 0 0",
                  textTransform: "uppercase",
                }}
              >
                Zero-Trust Workspace Terminal
              </p>
            </div>
          </div>

          {/* ── Form ─────────────────────────────────────────────────── */}
          <form
            onSubmit={handleSubmit}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <Field
              id="email"
              label="Identity"
              type="email"
              value={email}
              onChange={setEmail}
              disabled={isLoading}
              autoComplete="username"
            />

            <Field
              id="password"
              label="Passphrase"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(v) => {
                setPassword(v);
                if (phase === "error") {
                  setPhase("idle");
                  setErrorMsg("");
                }
              }}
              disabled={isLoading}
              placeholder="••••••••"
              autoComplete="current-password"
              hasError={!!errorMsg}
              inputRef={passwordRef}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide passphrase" : "Show passphrase"}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                    color: "var(--color-muted)",
                    borderRadius: "4px",
                    outline: "none",
                  }}
                  className="focus-visible:ring-1 focus-visible:ring-[var(--theme-primary)]"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
            />

            {/* Inline error */}
            <AnimatePresence>
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: -8 }}
                  animate={{ opacity: 1, height: "auto", marginTop: -4 }}
                  exit={{ opacity: 0, height: 0, marginTop: -8 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    fontSize: "0.75rem",
                    color: "#ef4444",
                  }}
                >
                  <AlertCircle size={12} />
                  {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit button */}
            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={!isLoading ? { scale: 1.012 } : {}}
              whileTap={!isLoading ? { scale: 0.988 } : {}}
              style={{
                marginTop: "0.25rem",
                width: "100%",
                padding: "0.75rem",
                borderRadius: "8px",
                background:
                  phase === "success"
                    ? "rgba(34,197,94,0.12)"
                    : "var(--theme-glow)",
                border: `1.5px solid ${
                  phase === "success" ? "#22c55e" : "var(--theme-border)"
                }`,
                color:
                  phase === "success" ? "#22c55e" : "var(--theme-primary)",
                fontSize: "0.75rem",
                fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.12em",
                cursor: isLoading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                transition: "border-color 0.25s, background 0.25s, color 0.25s",
              }}
            >
              <AnimatePresence mode="wait">
                {phase === "idle" || phase === "error" ? (
                  <motion.span
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                  >
                    AUTHENTICATE →
                  </motion.span>
                ) : phase === "authenticating" ? (
                  <motion.span
                    key="auth"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <motion.span
                      animate={{ opacity: [1, 0.25, 1] }}
                      transition={{
                        duration: 0.9,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    >
                      ◈
                    </motion.span>
                    AUTHENTICATING…
                  </motion.span>
                ) : (
                  <motion.span
                    key="success"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 320, damping: 22 }}
                  >
                    ✓ ACCESS GRANTED
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </form>

          {/* ── Footer note ──────────────────────────────────────────── */}
          <p
            style={{
              marginTop: "1.75rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              fontSize: "0.625rem",
              color: "var(--color-muted)",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.04em",
              lineHeight: 1.7,
              textAlign: "center",
            }}
          >
            Protected by real-time BLE proximity tether
            <br />
            and multi-face AI detection. Sessions expire on tab close.
          </p>
        </motion.div>

        {/* ── System status ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.65, duration: 0.5 }}
          style={{ position: "relative", zIndex: 1, marginTop: "2rem" }}
        >
          <SystemStatus />
        </motion.div>
      </div>
    </ChameleonWrapper>
  );
}
