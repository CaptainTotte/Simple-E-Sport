import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0D1117",
        surface: "#161B22",
        elevated: "#1C212B",
        border: "#2B3240",
        text: "#E6EDF3",
        muted: "#9AA4B2",
        accent: "#5865F2",
        accentSecondary: "#7C3AED",
        highlight: "#22D3EE",
        success: "#22c55e",
        warning: "#F59E0B",
        danger: "#ef4444"
      },
      boxShadow: {
        panel: "0 20px 40px rgba(0, 0, 0, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
