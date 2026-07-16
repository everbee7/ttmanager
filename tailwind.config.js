export default {
  darkMode: ["class"],
  content: ["./apps/desktop/renderer/index.html", "./apps/desktop/renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Segoe UI Variable", "Segoe UI", "Inter", "system-ui", "sans-serif"]
      },
      colors: {
        surface: "hsl(var(--surface))",
        panel: "hsl(var(--panel))",
        line: "hsl(var(--line))",
        ink: "hsl(var(--ink))",
        muted: "hsl(var(--muted))",
        accent: "hsl(var(--accent))",
        current: "hsl(var(--current))",
        urgent: "hsl(var(--urgent))"
      },
      boxShadow: {
        panel: "0 10px 30px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};
