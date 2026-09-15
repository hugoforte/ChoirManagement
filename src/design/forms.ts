// Shared classes for the plain HTML form controls used by the admin
// "manage" screens — one definition so every form reads consistently and
// picks up dark mode instead of each screen inventing its own.
// No margin baked in — callers that put a <label> above an input add mt-1
// themselves; inputs used standalone (e.g. a search box) shouldn't get one.
export const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500";

export const labelClass = "text-sm font-medium text-stone-700 dark:text-stone-300";

export const primaryButtonClass =
  "rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50";

export const linkClass = "text-sm text-brand-600 underline hover:text-brand-700 dark:text-brand-400";

export const mutedLinkClass = "text-sm text-stone-500 underline hover:text-stone-700 dark:text-stone-400";

export const dangerLinkClass = "text-sm text-danger hover:underline";

export const cardClass = "rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900";

export const checkboxClass = "h-4 w-4 shrink-0 accent-brand-600";
