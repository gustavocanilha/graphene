import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f6f5f4",
        surface: "#ffffff",
        hairline: "#e6e6e6",
        ink: "#000000",
        "ink-2": "#31302e",
        muted: "#6b6a67",
        wash: "#efeeec",
        primary: "#0075de",
        "primary-press": "#005bab",
        danger: "#d92d20",
        warn: "#b54708",
        ok: "#22c55e",
        "ok-text": "#15803d",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        xl: "12px",
        md: "8px",
      },
      boxShadow: {
        micro: "0 1px 2px rgba(0,0,0,0.02), 0 4px 16px rgba(0,0,0,0.02)",
        pop: "0 8px 32px rgba(0,0,0,0.08)",
      },
      letterSpacing: {
        tightest: "-0.02em",
      },
    },
  },
  plugins: [],
};
export default config;
