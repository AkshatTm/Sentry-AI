/**
 * Login Page — A.R.T.H.U.R.
 *
 * Redesigned per UI Enhancement Master Plan §6.1:
 * - GradientMesh background (replaces dot grid)
 * - No scan-line animation, no HUD corners
 * - Single top-edge accent gradient line on card
 * - Satoshi Bold title, Space Grotesk subtitle (normal case)
 * - IBM Plex Mono input values, Space Grotesk labels
 * - Sentence-case button: "Authenticate →"
 * - Floating shield icon (no box), breathing scale
 * - System status strip removed
 * - Keyboard shortcut hint added
 * - Magnetic button effect on CTA
 */
"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useSpring } from "framer-motion";
import { ShieldCheck, Eye, EyeOff, AlertCircle } from "lucide-react";
import { ChameleonWrapper } from "@/components/ChameleonWrapper";
import { GradientMesh } from "@/components/GradientMesh";
import { AUTH_SESSION_KEY } from "@/hooks/useAuthGuard";

// ─── Magnetic Button Wrapper ──────────────────────────────────────────────────
// Lerps toward the cursor when it enters a 60px radius

function MagneticButton({
  children,
  className,
  style,
  disabled,
  type,
  onClick,
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useSpring(0, { stiffness: 200, damping: 20 });
  const y = useSpring(0, { stiffness: 200, damping: 20 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!ref.current || disabled) return;
      const rect = ref.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      x.set(dx * 0.18);
      y.set(dy * 0.18);
    },
    [disabled, x, y]
  );

  const handleMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.button
      ref={ref}
      type={type}
      className={className}
      style={{ ...style, x, y }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      disabled={disabled}
      whileTap={!disabled ? { scale: 0.97 } : {}}
      transition={{ type: "spring", stiffness: 300, damping: 18 }}
    >
      {children}
    </motion.button>
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
  autoFocus?: boolean;
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
  autoFocus,
  suffix,
  inputRef,
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = hasError
    ? "var(--color-danger)"
    : focused
    ? "var(--theme-primary)"
    : "var(--color-border)";

  return (
    <div>
      <label
        htmlFor={id}
        style={{
          display: "block",
          fontSize: "var(--fs-xs)",
          fontFamily: "var(--font-body)",
          color: focused ? "var(--color-text-secondary)" : "var(--color-muted)",
          letterSpacing: "0.02em",
          marginBottom: "0.5rem",
          transition: "color 0.2s",
          fontWeight: 500,
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
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${borderColor}`,
            borderRadius: "10px",
            padding: suffix
              ? "0.75rem 2.75rem 0.75rem 0.875rem"
              : "0.75rem 0.875rem",
            minHeight: "44px",
            fontSize: "var(--fs-sm)",
            color: "var(--color-text)",
            // Mono only for actual data input values
            fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
            outline: "none",
            transition: "border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease",
            boxSizing: "border-box",
            opacity: disabled ? 0.5 : 1,
            boxShadow: focused ? `0 0 0 3px color-mix(in srgb, var(--theme-primary) 10%, transparent)` : "none",
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
  const [email, setEmail] = useState("akshat.tomar@arthur.corp");
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

    if (password !== "1234") {
      setErrorMsg("Invalid passphrase.");
      setPhase("error");
      passwordRef.current?.focus();
      return;
    }

    setPhase("authenticating");
    await new Promise<void>((r) => setTimeout(r, 800));
    sessionStorage.setItem(AUTH_SESSION_KEY, "1");
    setPhase("success");
    await new Promise<void>((r) => setTimeout(r, 380));
    router.push("/setup");
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
        {/* Animated gradient mesh background — replaces dot grid */}
        <GradientMesh />

        {/* ── Auth Card ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            duration: 0.55,
            ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
          }}
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            maxWidth: "400px",
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
          {/* Top-edge accent gradient line — single, restrained focal point */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "10%",
              right: "10%",
              height: "1px",
              background: "linear-gradient(90deg, transparent, var(--theme-primary), transparent)",
              opacity: 0.7,
            }}
          />

          {/* ── Wordmark ─────────────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginBottom: "2.25rem",
              gap: "1rem",
            }}
          >
            {/* Floating shield icon — no box, breathing scale */}
            <motion.div
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--theme-primary)",
                filter: "drop-shadow(0 0 12px var(--theme-primary))",
              }}
            >
              <ShieldCheck size={40} strokeWidth={1.5} />
            </motion.div>

            <div style={{ textAlign: "center" }}>
              <h1
                style={{
                  fontSize: "2rem",
                  fontWeight: 700,
                  fontFamily: "var(--font-display, 'Satoshi', sans-serif)",
                  color: "var(--color-text)",
                  letterSpacing: "-0.03em",
                  margin: 0,
                  lineHeight: 1.15,
                }}
              >
                A.R.T.H.U.R.
              </h1>
              {/* Normal case, quieter subtitle — Space Grotesk, not mono */}
              <p
                style={{
                  fontSize: "var(--fs-sm)",
                  color: "var(--color-muted)",
                  fontFamily: "var(--font-body)",
                  margin: "0.4rem 0 0",
                  fontWeight: 400,
                  opacity: 0.7,
                }}
              >
                Zero-trust workspace terminal
              </p>
            </div>
          </div>

          {/* ── Form ─────────────────────────────────────────────────── */}
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "1.125rem" }}
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
                    fontSize: "var(--fs-sm)",
                    color: "var(--color-danger)",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  <AlertCircle size={12} />
                  {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit button — sentence case, gradient background, magnetic */}
            <MagneticButton
              type="submit"
              disabled={isLoading}
              aria-label="Authenticate"
              style={{
                marginTop: "0.25rem",
                width: "100%",
                padding: "0.8rem",
                borderRadius: "10px",
                background:
                  phase === "success"
                    ? "rgba(45,212,168,0.12)"
                    : "linear-gradient(135deg, var(--theme-glow), color-mix(in srgb, var(--theme-primary) 15%, transparent))",
                border: `1.5px solid ${phase === "success" ? "var(--color-success)" : "var(--theme-border)"}`,
                color: phase === "success" ? "var(--color-success)" : "var(--theme-primary)",
                fontSize: "var(--fs-sm)",
                fontWeight: 600,
                fontFamily: "var(--font-body)",
                letterSpacing: "0.01em",
                cursor: isLoading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                transition: "border-color 0.25s, background 0.25s, color 0.25s",
                position: "relative",
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
                    Authenticate →
                  </motion.span>
                ) : phase === "authenticating" ? (
                  <motion.span
                    key="auth"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                  >
                    <motion.span
                      animate={{ opacity: [1, 0.25, 1] }}
                      transition={{ duration: 0.9, repeat: Infinity }}
                    >
                      ◈
                    </motion.span>
                    Authenticating…
                  </motion.span>
                ) : (
                  <motion.span
                    key="success"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 320, damping: 22 }}
                  >
                    ✓ Access granted
                  </motion.span>
                )}
              </AnimatePresence>
            </MagneticButton>

            {/* Keyboard shortcut hint */}
            <p
              style={{
                textAlign: "center",
                fontSize: "var(--fs-xs)",
                color: "var(--color-muted)",
                fontFamily: "var(--font-body)",
                opacity: 0.55,
                marginTop: "-0.25rem",
                letterSpacing: "0.01em",
              }}
            >
              Press Enter to authenticate
            </p>
          </form>

          {/* ── Footer note ──────────────────────────────────────────── */}
          <p
            style={{
              marginTop: "1.75rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid var(--color-border-subtle)",
              fontSize: "var(--fs-xs)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-body)",
              letterSpacing: "0.01em",
              lineHeight: 1.6,
              textAlign: "center",
              opacity: 0.6,
            }}
          >
            Protected by real-time BLE proximity tether and multi-face AI detection.
          </p>

          {/* Version footnote */}
          <p
            style={{
              textAlign: "center",
              fontSize: "var(--fs-xs)",
              color: "var(--color-muted)",
              fontFamily: "var(--font-mono)",
              opacity: 0.3,
              marginTop: "0.5rem",
            }}
          >
            v4.0.0
          </p>
        </motion.div>
      </div>
    </ChameleonWrapper>
  );
}
