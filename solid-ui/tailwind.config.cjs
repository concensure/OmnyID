module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    screens: {
      'watch': { 'max': '280px' },
      'phone': { 'max': '639px' },
      'sm':    '640px',
      'md':    '768px',
      'lg':    '1024px',
      'xl':    '1280px',
    },
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
        ember: "#d96b39",
        "atelier-lime": "#cef264",
        "atelier-mint": "#a8f0c6",
        "surface-cool": "#f2f3f8",
        // Wedding theme exception: sampled from Documents/images/decisionOS response flow.png.
        // Wedding-surface components intentionally use these named tokens instead of
        // the main primary/on-surface/outline palette.
        "wedding-accent": "#A6335A",
        "wedding-accent-hover": "#8F294D",
        "wedding-accent-dark": "#241A2C",
        "wedding-cta": "#241A2C",
        "wedding-cta-hover": "#34263F",
        "wedding-surface": "#FBF6F4",
        "wedding-surface-blush": "#FCEEF1",
        "wedding-surface-muted": "#F6F0EC",
        "wedding-text": "#241A2C",
        "wedding-muted": "#6B5C70",
        "wedding-warm-note": "#FBF0DA",
        "wedding-hairline": "#E9DDE0",
        "wedding-plum": "#2B1B3A",
        "wedding-plum-light": "#4A2347",
        "wedding-plum-warm": "#7A2E57",
        "wedding-bubblegum": "#FF8FB1",
        "wedding-butter": "#FFD36E",
        "wedding-tile-budget-bg": "#E6F4EC",
        "wedding-tile-budget-pop": "#1F7A4D",
        "wedding-tile-budget-ink": "#14432B",
        "wedding-tile-guests-bg": "#E4EEFB",
        "wedding-tile-guests-pop": "#2F5FB3",
        "wedding-tile-guests-ink": "#17305E",
        "wedding-tile-seating-bg": "#F1E8FB",
        "wedding-tile-seating-pop": "#7A3FD0",
        "wedding-tile-seating-ink": "#3F1D6E",
        "wedding-tile-vendors-bg": "#FFEFD2",
        "wedding-tile-vendors-pop": "#B45A0B",
        "wedding-tile-vendors-ink": "#5E2F05",
        "wedding-status-action-bg": "#FDE3E7",
        "wedding-status-action-ink": "#9C1F3D",
        "wedding-status-track-bg": "#DDF3E6",
        "wedding-status-track-ink": "#14532D",
        "wedding-status-progress-bg": "#FFF0CC",
        "wedding-status-progress-ink": "#7A4A00",
        "wedding-status-locked-bg": "#ECE7F0",
        "wedding-status-locked-ink": "#4B3F52"
      },
      boxShadow: {
        panel:   "0 24px 80px rgba(15, 23, 42, 0.14)",
        card:    "0 2px 12px rgba(15, 23, 42, 0.06)",
        "card-hover": "0 12px 32px rgba(15, 23, 42, 0.10)",
        "wedding-cta": "0 3px 0 #A6335A",
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
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(100%)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up":    "fadeUp 0.30s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in":    "fadeIn 0.25s ease both",
        "slide-down": "slideDown 0.22s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-up":   "slideUp 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
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
