import type { Config } from "tailwindcss";

/** RateHawk-inspired tokens; GoTrip-style accents for transport cards */
export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        keke: {
          black: "#000000",
          ink: "#0a0a0a",
          gold: "#f5a623",
          green: "#28B463",
          muted: "#888888",
          line: "#242424",
        },
      },
      fontFamily: {
        sans: ["var(--font-keke-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "0 8px 28px rgba(0,0,0,0.45)",
      },
    },
  },
  plugins: [],
} satisfies Config;
