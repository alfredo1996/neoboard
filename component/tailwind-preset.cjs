/**
 * Shared Tailwind CSS preset — NeoBoard Graphite & Citrine theme.
 *
 * Imported by app/tailwind.config.ts and component/tailwind.config.js
 * to avoid duplicating the theme.extend block.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  theme: {
    extend: {
      // Tailwind seeds `--tw-ring-offset-color` in its base layer from
      // `theme('ringOffsetColor.DEFAULT', '#fff')`. Left unset, every
      // `ring-offset-*` utility falls back to opaque white, which paints a
      // halo around focus rings in dark mode (#1293). Setting the default
      // here fixes every component at once and stops the defect recurring —
      // components no longer have to remember `ring-offset-background`.
      ringOffsetColor: {
        DEFAULT: "hsl(var(--background))",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        // Status tokens (defined in design-tokens.css for both themes). Exposed
        // as utilities so components use `text-success`/`bg-warning` instead of
        // raw palette classes (`emerald-*`) or arbitrary `hsl(var(--success))`.
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        brand: "hsl(var(--brand))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          // Alpha-baked citrine tint — use directly (bg-accent-soft), no
          // hsl() wrapping since the token carries its own alpha.
          soft: "var(--accent-soft)",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          2: "hsl(var(--surface-2))",
        },
        "border-strong": "hsl(var(--border-strong))",
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
          6: "hsl(var(--chart-6))",
          7: "hsl(var(--chart-7))",
          8: "hsl(var(--chart-8))",
          9: "hsl(var(--chart-9))",
          10: "hsl(var(--chart-10))",
        },
      },
      fontFamily: {
        display: "var(--font-display)",
        body: "var(--font-body)",
      },
      // Heading scale (#830): size, leading, and tracking travel together.
      // Pair with `font-display` for the Geist Sans family.
      fontSize: {
        display: [
          "2.25rem",
          { lineHeight: "2.5rem", letterSpacing: "-0.025em", fontWeight: "600" },
        ],
        h1: [
          "1.875rem",
          { lineHeight: "2.25rem", letterSpacing: "-0.02em", fontWeight: "600" },
        ],
        h2: [
          "1.5rem",
          { lineHeight: "2rem", letterSpacing: "-0.015em", fontWeight: "600" },
        ],
        h3: [
          "1.25rem",
          { lineHeight: "1.75rem", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
      },
      // Radius scale (#831): rounded-sm/md/lg map 1:1 to the tokens.
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      // Elevation scale (#823): shadow-sm/md/lg utilities emit the
      // warm-tinted token values so all existing class usage upgrades
      // without component changes.
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      // Motion vocabulary (#833): the standard ease becomes the default
      // timing function for every transition-* utility.
      transitionTimingFunction: {
        DEFAULT: "var(--ease-standard)",
        standard: "var(--ease-standard)",
        emphasized: "var(--ease-emphasized)",
      },
      transitionDuration: {
        DEFAULT: "var(--duration-normal)",
        fast: "var(--duration-fast)",
        normal: "var(--duration-normal)",
        slow: "var(--duration-slow)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        // Indeterminate Progress (#1129): a segment sliding across the track.
        "progress-indeterminate": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s var(--ease-standard)",
        "accordion-up": "accordion-up 0.2s var(--ease-standard)",
        shimmer: "shimmer 1.6s var(--ease-standard) infinite",
        "progress-indeterminate":
          "progress-indeterminate 1.4s var(--ease-standard) infinite",
      },
    },
  },
};
