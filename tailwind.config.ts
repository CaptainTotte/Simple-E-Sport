import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0E0F12",
        surface: "#181A1F",
        elevated: "#202329",
        border: "#2A2F36",
        text: "#E5E7EB",
        secondary: "#A1A1AA",
        muted: "#71717A",
        accent: "#6D5DFC",
        accentSecondary: "#7C6EFF",
        highlight: "#2DD4BF",
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
