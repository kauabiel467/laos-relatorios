import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: "#080a0e",
        card: "#141720",
        border: "#1e2230",
        text: "#e2e8f0",
        muted: "#64748b",
        panel: "#111520",
        blue: "#3b82f6",
        green: "#22c55e",
        red: "#ef4444",
        orange: "#f97316",
        yellow: "#eab308",
        cyan: "#06b6d4",
        purple: "#a855f7"
      },
      boxShadow: {
        panel: "0 20px 40px rgba(0,0,0,0.28)"
      },
      borderRadius: {
        xl2: "1rem"
      }
    }
  },
  plugins: []
};

export default config;
