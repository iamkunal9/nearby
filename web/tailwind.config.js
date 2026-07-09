export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        "canvas-raised": "var(--canvas-raised)",
        "canvas-deep": "var(--canvas-deep)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        "ink-faint": "var(--ink-faint)",
        accent: "var(--accent)",
        "accent-strong": "var(--accent-strong)",
        "accent-wash": "var(--accent-wash)",
        alert: "var(--alert)",
      },
      keyframes: {
        scanpulse: {
          "0%": { transform: "scale(1)", opacity: "0.5" },
          "65%": { opacity: "0.06" },
          "100%": { transform: "scale(8)", opacity: "0" },
        },
      },
      animation: {
        scanpulse: "scanpulse 3.9s ease-out infinite",
      },
    },
  },
  plugins: [],
};
