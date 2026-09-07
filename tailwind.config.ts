import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        "on-primary": "var(--color-on-primary)",
        "primary-container": "var(--color-primary-container)",
        "on-primary-container": "var(--color-on-primary-container)",

        secondary: "var(--color-secondary)",
        "on-secondary": "var(--color-on-secondary)",
        "secondary-container": "var(--color-secondary-container)",
        "on-secondary-container": "var(--color-on-secondary-container)",

        tertiary: "var(--color-tertiary)",
        "on-tertiary": "var(--color-on-tertiary)",
        "tertiary-container": "var(--color-tertiary-container)",
        "on-tertiary-container": "var(--color-on-tertiary-container)",

        surface: "var(--color-surface)",
        "on-surface": "var(--color-on-surface)",
        "surface-variant": "var(--color-surface-variant)",
        "on-surface-variant": "var(--color-on-surface-variant)",
        "surface-container-highest": "var(--color-surface-container-highest)",
        "surface-container-high": "var(--color-surface-container-high)",
        "surface-container": "var(--color-surface-container)",
        "surface-container-low": "var(--color-surface-container-low)",
        "surface-container-lowest": "var(--color-surface-container-lowest)",
        "surface-tint": "var(--color-surface-tint)",
        "surface-tint-color": "var(--color-surface-tint-color)",
        "surface-bright": "var(--color-surface-bright)",
        "surface-dim": "var(--color-surface-dim)",

        "inverse-surface": "var(--color-inverse-surface)",
        "inverse-on-surface": "var(--color-inverse-on-surface)",
        "inverse-primary": "var(--color-inverse-primary)",

        outline: "var(--color-outline)",
        "outline-variant": "var(--color-outline-variant)",

        error: "var(--color-error)",
        "on-error": "var(--color-on-error)",
        "error-container": "var(--color-error-container)",
        "on-error-container": "var(--color-on-error-container)",

        background: "var(--color-background)",
        "on-background": "var(--color-on-background)",

        scrim: "var(--color-scrim)",
        shadow: "var(--color-shadow)",

        "primary-fixed": "var(--color-primary-fixed)",
        "on-primary-fixed": "var(--color-on-primary-fixed)",
        "primary-fixed-dim": "var(--color-primary-fixed-dim)",
        "on-primary-fixed-variant": "var(--color-on-primary-fixed-variant)",

        "secondary-fixed": "var(--color-secondary-fixed)",
        "on-secondary-fixed": "var(--color-on-secondary-fixed)",
        "secondary-fixed-dim": "var(--color-secondary-fixed-dim)",
        "on-secondary-fixed-variant": "var(--color-on-secondary-fixed-variant)",

        "tertiary-fixed": "var(--color-tertiary-fixed)",
        "on-tertiary-fixed": "var(--color-on-tertiary-fixed)",
        "tertiary-fixed-dim": "var(--color-tertiary-fixed-dim)",
        "on-tertiary-fixed-variant": "var(--color-on-tertiary-fixed-variant)",
      },
      spacing: {
        xs: "var(--spacing-xs)",
        sm: "var(--spacing-sm)",
        md: "var(--spacing-md)",
        base: "var(--spacing-base)",
        lg: "var(--spacing-lg)",
        xl: "var(--spacing-xl)",
        "2xl": "var(--spacing-2xl)",
      },
      maxWidth: {
        xs: "20rem",
        sm: "24rem",
        md: "28rem",
        lg: "32rem",
        xl: "36rem",
        "2xl": "42rem",
        card: "28rem", // 448px (auth card max width)
        auth: "28rem",
      },
      boxShadow: {
        hard: "var(--effect-hard-shadow)",
        medium: "var(--effect-medium-shadow)",
        soft: "var(--effect-soft-shadow)",
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "var(--font-family)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
