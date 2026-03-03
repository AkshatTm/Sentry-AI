import type { Config } from "tailwindcss";

/**
 * SentryOS — Tailwind CSS v3 Configuration
 *
 * Design decisions:
 * - Chameleon variables (--theme-primary, --theme-glow, --theme-border) are wired
 *   to Tailwind color tokens so that Tailwind utilities (bg-theme-primary, etc.)
 *   automatically pick up runtime JS changes injected by <ChameleonWrapper />.
 * - Static palette variables (--color-*) are also exposed as named tokens so the
 *   codebase only ever references semantic names, never raw hex values.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ── CSS-variable-backed color tokens ────────────────────────────────────
      colors: {
        // Dynamic Chameleon tokens — values injected at runtime by ChameleonWrapper
        "theme-primary": "var(--theme-primary)",
        "theme-glow": "var(--theme-glow)",
        "theme-border": "var(--theme-border)",
        // Static SentryOS palette tokens
        surface: "var(--color-surface)",
        "sentry-bg": "var(--color-bg)",
        accent: "var(--color-accent)",
        muted: "var(--color-muted)",
        danger: "var(--color-danger)",
        success: "var(--color-success)",
      },

      // ── Typography ───────────────────────────────────────────────────────────
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },

      // ── Extended blur values for glass-morphism ──────────────────────────────
      backdropBlur: {
        xs: "2px",
        "4xl": "72px",
      },
      blur: {
        "4xl": "72px",
      },

      // ── Animation curves matching the kinetic-minimalist aesthetic ───────────
      transitionTimingFunction: {
        "premium-ease": "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        "lock-snap": "cubic-bezier(0.55, 0, 1, 0.45)",
      },

      // ── Box shadow for glow effects ──────────────────────────────────────────
      boxShadow: {
        "glow-sm": "0 0 8px var(--theme-glow)",
        "glow-md": "0 0 20px var(--theme-glow)",
        "glow-lg": "0 0 40px var(--theme-glow)",
      },
    },
  },
  plugins: [],
};

export default config;
