import { useTheme } from "./ThemeProvider";

const OPTIONS = [
  { value: "light" as const, label: "Light", icon: "M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5L19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5L19 5" },
  { value: "system" as const, label: "System", icon: "M4 5h16v10H4zM9 19h6M12 15v4" },
  { value: "dark" as const, label: "Dark", icon: "M20 14.5A8 8 0 119.5 4a6.5 6.5 0 0010.5 10.5z" },
];

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-lg border border-stone-200 bg-stone-50 p-0.5 dark:border-stone-700 dark:bg-stone-800 ${className}`}
      role="radiogroup"
      aria-label="Color theme"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => setTheme(option.value)}
          className={`flex h-6 w-6 items-center justify-center rounded-md ${
            theme === option.value
              ? "bg-white text-brand-700 shadow-sm dark:bg-stone-700 dark:text-brand-300"
              : "text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
            {option.value === "light" ? (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d={option.icon} strokeLinecap="round" strokeLinejoin="round" />
              </>
            ) : (
              <path d={option.icon} strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
      ))}
    </div>
  );
}
