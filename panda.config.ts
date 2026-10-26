import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  designSystem: "@quanttrinh/qui",
  include: ["./src/**/*.{astro,ts,tsx}"],
  exclude: [],
  outdir: "styled-system",
  optimize: {
    treeshakeDesignSystem: true,
    removeUnusedTokens: true,
    removeUnusedKeyframes: true,
  },
  globalCss: {
    ":root": {
      colorScheme: "light",
      "--md-sys-color-primary": "#b63817",
      "--md-sys-color-on-primary": "#ffffff",
      "--md-sys-color-primary-container": "#ffe3d8",
      "--md-sys-color-on-primary-container": "#5c1d10",
      "--md-sys-color-secondary": "#9a741f",
      "--md-sys-color-on-secondary": "#ffffff",
      "--md-sys-color-secondary-container": "#fbf0d4",
      "--md-sys-color-on-secondary-container": "#5c1d10",
      "--md-sys-color-tertiary": "#3f7d5a",
      "--md-sys-color-on-tertiary": "#ffffff",
      "--md-sys-color-tertiary-container": "#d8ecdf",
      "--md-sys-color-on-tertiary-container": "#1c3a29",
      "--md-sys-color-surface": "#fffaf3",
      "--md-sys-color-on-surface": "#1c1917",
      "--md-sys-color-surface-variant": "#f5eee6",
      "--md-sys-color-on-surface-variant": "#57534e",
      "--md-sys-color-outline": "#a8a29e",
      "--md-sys-color-outline-variant": "#e7e5e4",
      "--md-sys-color-surface-container-lowest": "#ffffff",
      "--md-sys-color-surface-container-low": "#fff8f0",
      "--md-sys-color-surface-container": "#fdf3e9",
      "--md-sys-color-surface-container-high": "#f8ece0",
      "--md-sys-color-surface-container-highest": "#f3e5d8",
      "--md-sys-color-surface-tint": "#b63817",
      "--md-sys-color-error": "#ba1a1a",
      "--md-sys-color-on-error": "#ffffff",
      "--md-sys-color-error-container": "#ffdad6",
      "--md-sys-color-on-error-container": "#93000a",
    },
    html: {
      scrollBehavior: "smooth",
    },
    body: {
      minHeight: "screen",
      background:
        "radial-gradient(circle at 14% -12%, color-mix(in oklab, var(--md-sys-color-primary) 14%, transparent), transparent var(--sizes-2xl)), radial-gradient(circle at 92% 0%, color-mix(in oklab, var(--md-sys-color-secondary) 12%, transparent), transparent var(--sizes-xl)), var(--md-sys-color-surface)",
      WebkitFontSmoothing: "antialiased",
    },
    "::selection": {
      background: "color-mix(in oklab, var(--md-sys-color-primary) 20%, transparent)",
    },
    "@media (prefers-reduced-motion: reduce)": {
      html: {
        scrollBehavior: "auto",
      },
    },
  },
  theme: {
    extend: {
      tokens: {
        borderWidths: {
          thin: { value: "1px" },
          thick: { value: "2px" },
        },
        sizes: {
          screen: { value: "100dvh" },
        },
        colors: {
          brand: {
            50: { value: "#fff4ef" },
            100: { value: "#ffe3d8" },
            200: { value: "#ffc6b0" },
            300: { value: "#f79b7c" },
            400: { value: "#e96a45" },
            500: { value: "#d24a24" },
            600: { value: "#b63817" },
            700: { value: "#942c13" },
            800: { value: "#772513" },
            900: { value: "#5c1d10" },
          },
          jade: {
            50: { value: "#eef7f1" },
            100: { value: "#d8ecdf" },
            200: { value: "#b4d8c1" },
            400: { value: "#579d77" },
            800: { value: "#244a34" },
            900: { value: "#1c3a29" },
          },
          gold: {
            100: { value: "#fbf0d4" },
            400: { value: "#d9ae4a" },
            700: { value: "#9a741f" },
          },
        },
        fonts: {
          display: {
            value: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
          },
        },
      },
      // Typography ramp. Each role reproduces the exact stack the app used to
      // hand-roll inside `css()`, so `prefer-text-style` keeps call sites short
      // without changing a single rendered value.
      textStyles: {
        "headline-lg": {
          value: {
            fontFamily: "display",
            fontSize: "5xl",
            lineHeight: "none",
            fontWeight: "bold",
            letterSpacing: "tight",
          },
        },
        "headline-md": {
          value: {
            fontFamily: "display",
            fontSize: "4xl",
            lineHeight: "none",
            fontWeight: "bold",
            letterSpacing: "tight",
          },
        },
        "headline-sm": {
          value: {
            fontFamily: "display",
            fontSize: "3xl",
            lineHeight: "none",
            fontWeight: "bold",
            letterSpacing: "tight",
          },
        },
        "title-lg": {
          value: {
            fontFamily: "display",
            fontSize: "xl",
            fontWeight: "bold",
            letterSpacing: "tight",
          },
        },
        "title-md": { value: { fontFamily: "display", fontSize: "xl", fontWeight: "bold" } },
        "title-sm": {
          value: {
            fontFamily: "display",
            fontSize: "lg",
            fontWeight: "bold",
            letterSpacing: "tight",
          },
        },
        "label-lg": { value: { fontFamily: "display", fontSize: "lg", fontWeight: "bold" } },
        "name-lg": { value: { fontFamily: "display", fontSize: "2xl", fontWeight: "bold" } },
        "subtitle-md": { value: { fontSize: "md", lineHeight: "snug", fontWeight: "semibold" } },
        "body-lg": { value: { fontSize: "lg", lineHeight: "relaxed" } },
        "body-md": { value: { fontSize: "sm", lineHeight: "relaxed" } },
        "body-md-strong": { value: { fontSize: "sm", fontWeight: "semibold" } },
        "body-md-medium": { value: { fontSize: "sm", fontWeight: "medium" } },
        caption: { value: { fontSize: "xs", lineHeight: "relaxed" } },
        "caption-strong": { value: { fontSize: "xs", fontWeight: "semibold" } },
        "caption-caps": {
          value: { fontSize: "xs", fontWeight: "semibold", letterSpacing: "wide" },
        },
        "label-caps": { value: { fontSize: "xs", fontWeight: "bold", letterSpacing: "widest" } },
        "label-caps-wide": { value: { fontSize: "xs", fontWeight: "bold", letterSpacing: "wide" } },
        "link-strong": { value: { fontWeight: "semibold", textDecoration: "underline" } },
        "code-md": { value: { fontFamily: "mono", fontSize: "sm" } },
        "code-sm": { value: { fontFamily: "mono", fontSize: "xs" } },
      },
    },
  },
});
