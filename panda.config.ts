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
      },
      fonts: {
        display: {
          value: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
        },
      },
    },
  },
});
