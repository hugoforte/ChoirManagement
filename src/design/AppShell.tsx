// Design direction "Warm Programme": editorial, concert-programme feel.
// Shared shell + small building blocks used by Home, Events, and Members —
// the three routes covered by this design pass. Other routes (Library,
// Settings, the manage screens) are intentionally left in the previous
// style for now; see the PR description for why the scope stops here.
import { Link, useLocation } from "react-router-dom";
import { SignOutButton } from "@clerk/clerk-react";

const NAV_ITEMS = [
  { to: "/", label: "Programme" },
  { to: "/events", label: "Events" },
  { to: "/library", label: "Library" },
  { to: "/members", label: "Personnel" },
];

export function AppShell({
  choirName,
  viewerName,
  showSettings,
  children,
}: {
  choirName: string;
  viewerName: string;
  showSettings: boolean;
  children: React.ReactNode;
}) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-stone-50 font-serif text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="border-b border-stone-200 dark:border-stone-800">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:px-6 sm:py-6">
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.2em] text-amber-700 dark:text-amber-500">
              Member area
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{choirName}</h1>
          </div>
          <div className="font-sans text-sm text-stone-500 dark:text-stone-400 sm:text-right">
            Welcome back, <span className="text-stone-800 dark:text-stone-200">{viewerName}</span>
            <span className="mx-2 text-stone-300 dark:text-stone-700 sm:hidden">·</span>
            <span className="inline sm:block sm:mt-1">
              <SignOutButton>
                <button className="underline decoration-stone-400 hover:text-stone-800 dark:hover:text-stone-200">
                  Sign out
                </button>
              </SignOutButton>
            </span>
          </div>
        </div>
        <nav className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-2 px-4 pb-4 font-sans text-sm sm:px-6">
          {NAV_ITEMS.map((item) => {
            const isActive = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={
                  isActive
                    ? "border-b-2 border-amber-700 pb-1 font-medium text-amber-800 dark:border-amber-500 dark:text-amber-400"
                    : "border-b-2 border-transparent pb-1 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
                }
              >
                {item.label}
              </Link>
            );
          })}
          {showSettings && (
            <Link
              to="/settings"
              className={
                location.pathname.startsWith("/settings")
                  ? "border-b-2 border-amber-700 pb-1 font-medium text-amber-800 dark:border-amber-500 dark:text-amber-400"
                  : "border-b-2 border-transparent pb-1 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
              }
            >
              Settings
            </Link>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}

export function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-6 flex items-baseline justify-between">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.2em] text-amber-700 dark:text-amber-500">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold">{title}</h2>
      </div>
    </div>
  );
}

export function DateBadge({ startsAt }: { startsAt: number }) {
  const d = new Date(startsAt);
  return (
    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded border border-amber-700/40 bg-amber-50 font-sans text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
      <span className="text-[10px] font-semibold uppercase leading-none">
        {d.toLocaleDateString(undefined, { month: "short" })}
      </span>
      <span className="text-lg font-bold leading-tight">{d.getDate()}</span>
    </div>
  );
}

export const RSVP_LABEL: Record<string, string> = {
  yes: "Attending",
  maybe: "Maybe",
  no: "Not attending",
  "no RSVP": "No response yet",
};

export const RSVP_DOT: Record<string, string> = {
  yes: "bg-emerald-600",
  maybe: "bg-amber-600",
  no: "bg-red-700",
  "no RSVP": "bg-stone-300 dark:bg-stone-600",
};
