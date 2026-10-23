module.exports = {
  content: ["./*.html"],
  darkMode: "class",
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
        outline: "#5f636d",
        "outline-variant": "#c3c6d1",
        error: "#ba1a1a",
        ember: "#d96b39",
      },
      fontFamily: {
        display: ["EB Garamond", "serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: { panel: "0 24px 80px rgba(0,0,0,0.08)" },
    },
  },
};
