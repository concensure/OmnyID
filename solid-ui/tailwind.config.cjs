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
        panel: "0 24px 80px rgba(15, 23, 42, 0.16)"
      },
      fontFamily: {
        display: ["Georgia", "serif"],
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      }
    }
  },
  plugins: []
};
