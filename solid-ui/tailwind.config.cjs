module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#f9f9f7",
        "surface-container-low": "#f4f4f2",
        "surface-container-lowest": "#ffffff",
        "surface-container-high": "#e8e8e6",
        primary: "#31568e",
        "primary-fixed": "#d6e3ff",
        secondary: "#526352",
        "secondary-container": "#d4e8d3",
        "on-surface": "#1a1c1b",
        "on-surface-variant": "#434750",
        outline: "#737781",
        "outline-variant": "#c3c6d1",
        error: "#ba1a1a",
        ember: "#d96b39"
      },
      boxShadow: {
        panel:   "0 24px 80px rgba(15, 23, 42, 0.14)",
        card:    "0 2px 12px rgba(15, 23, 42, 0.06)",
        "card-hover": "0 12px 32px rgba(15, 23, 42, 0.10)",
        "nav":   "0 1px 3px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(255,255,255,0.50) inset",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
        "4xl": "1.5rem",
      },
      fontFamily: {
        display: ["Georgia", "serif"],
        body:    ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono:    ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      keyframes: {
        fadeUp: {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideDown: {
          "0%":   { opacity: "0", transform: "translateY(-6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up":    "fadeUp 0.30s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in":    "fadeIn 0.25s ease both",
        "slide-down": "slideDown 0.22s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
      },
      transitionTimingFunction: {
        "spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    }
  },
  plugins: []
};
