/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand: violet — calm, a little formal, reads well for a choir app
        // without being corporate. Tailwind's own violet scale (already
        // contrast-vetted), given an alias so intent is clear in JSX
        // (`bg-brand-600` vs. an arbitrary `bg-violet-600`).
        brand: {
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95",
        },
        // Semantic aliases for RSVP status and general state — defined now
        // (cheap) even though Events isn't built yet, so the color doesn't
        // get re-decided ad hoc per component later.
        success: "#16a34a", // RSVP: Yes
        warning: "#d97706", // RSVP: Maybe
        danger: "#dc2626", // RSVP: No
      },
    },
  },
  plugins: [],
};
