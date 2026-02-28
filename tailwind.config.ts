import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0c111d",
        surface: "#131a2a",
        elevated: "#1a2236",
        border: "#29334d",
        text: "#e9edf8",
        muted: "#9cabcf",
        accent: "#4cc9f0",
        success: "#22c55e",
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
