# Design foundation (lightweight)

A small, cheap-to-set foundation — not a full component library. Full design-system work (Claude Design sync, a real component library) is deliberately deferred until more real screens exist to extract it from; see the discussion on issue tracking for context. This doc exists so the choices below don't get silently re-decided per-component as more UI gets built.

## Color

- **Brand**: violet (`brand-50`...`brand-900` in `tailwind.config.cjs`, aliasing Tailwind's own violet scale). Use for primary actions, links, and active/selected states — e.g. `text-brand-600` for links, `bg-brand-600` for primary buttons.
- **Semantic**: `success` (RSVP: Yes), `warning` (RSVP: Maybe), `danger` (RSVP: No) — defined ahead of Events (#13) being built, so RSVP UI doesn't have to invent these on the spot.
- **Neutral**: Tailwind's built-in `gray-*` scale, used directly (no alias) — `gray-900`/`gray-800` for primary text, `gray-600`/`gray-500` for secondary/meta text, `gray-200`/`gray-300` for borders.

## Type scale

Tailwind's default scale is sufficient — no override. Usage convention:

- **Page title**: `text-2xl font-bold`
- **Section heading**: `text-lg font-semibold` (or `font-medium` for a lighter touch)
- **Body**: `text-base` (Tailwind's default, often omitted)
- **Secondary/meta text** (timestamps, byline-style info): `text-sm text-gray-600` or `text-gray-500`

## Layout

- Content containers: `mx-auto max-w-2xl p-8` for single-column pages (dashboard, detail views). Wider containers (`max-w-4xl`+) are fine for list/table-heavy views once those exist.
