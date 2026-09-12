// App-wide shell: fixed sidebar on desktop (md+), bottom tab bar on phones.
// Warm neutrals (stone) + the app's existing brand violet accent (see
// tailwind.config.cjs) — friendlier than this direction's original cool
// slate/teal, while keeping the same dense, structured layout everywhere.
import { Link, useLocation } from "react-router-dom";
import { SignOutButton } from "@clerk/clerk-react";
import { ThemeToggle } from "./ThemeToggle";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" },
  { to: "/events", label: "Events", icon: "M4 5h16M4 11h16M4 17h10" },
  { to: "/library", label: "Library", icon: "M5 4h10a2 2 0 012 2v14l-7-3-7 3V6a2 2 0 012-2z" },
  { to: "/members", label: "Roster", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-4 4-6 8-6s8 2 8 6" },
];

const SETTINGS_ITEM = {
  to: "/settings",
  label: "Settings",
  icon: "M10.325 4.317a1 1 0 011.35 0l.494.44a1 1 0 00.94.23l.63-.17a1 1 0 011.19.55l.3.6a1 1 0 00.74.54l.65.11a1 1 0 01.79 1.15l-.11.65a1 1 0 00.3.86l.47.46a1 1 0 010 1.42l-.47.46a1 1 0 00-.3.86l.11.65a1 1 0 01-.79 1.15l-.65.11a1 1 0 00-.74.54l-.3.6a1 1 0 01-1.19.55l-.63-.17a1 1 0 00-.94.23l-.49.44a1 1 0 01-1.35 0l-.49-.44a1 1 0 00-.94-.23l-.63.17a1 1 0 01-1.19-.55l-.3-.6a1 1 0 00-.74-.54l-.65-.11a1 1 0 01-.79-1.15l.11-.65a1 1 0 00-.3-.86l-.47-.46a1 1 0 010-1.42l.47-.46a1 1 0 00.3-.86l-.11-.65a1 1 0 01.79-1.15l.65-.11a1 1 0 00.74-.54l.3-.6a1 1 0 011.19-.55l.63.17a1 1 0 00.94-.23l.49-.44z",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AppShell({
  choirName,
  viewerName,
  showSettings,
  pageTitle,
  children,
}: {
  choirName: string;
  viewerName: string;
  showSettings: boolean;
  pageTitle: string;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const allNavItems = showSettings ? [...NAV_ITEMS, SETTINGS_ITEM] : NAV_ITEMS;

  return (
    <div className="flex min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      {/* Desktop sidebar — becomes a bottom tab bar below md, since a fixed
          w-56 rail has no room on a phone-width viewport. */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 md:flex">
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-4 dark:border-stone-800">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
            {initials(choirName)}
          </div>
          <span className="truncate text-sm font-semibold">{choirName}</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {allNavItems.map((item) => {
            const isActive = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${
                  isActive
                    ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                    : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d={item.icon} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-stone-200 p-3 dark:border-stone-800">
          <ThemeToggle className="w-full justify-center" />
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700 dark:bg-stone-700 dark:text-stone-200">
              {initials(viewerName)}
            </div>
            <span className="min-w-0 flex-1 truncate text-sm text-stone-600 dark:text-stone-400">{viewerName}</span>
            <SignOutButton>
              <button className="text-xs text-stone-400 underline hover:text-stone-600 dark:hover:text-stone-200">
                Sign out
              </button>
            </SignOutButton>
          </div>
        </div>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900 md:px-6">
          <h1 className="text-base font-semibold">{pageTitle}</h1>
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <SignOutButton>
              <button
                aria-label="Sign out"
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path
                    d="M15 17l5-5-5-5M20 12H9M12 19H6a2 2 0 01-2-2V7a2 2 0 012-2h6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </SignOutButton>
          </div>
        </header>
        <main className="p-4 pb-24 md:p-6 md:pb-6">{children}</main>
      </div>

      {/* Mobile bottom tab bar — hidden from md up, where the sidebar takes over. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-stone-800 dark:bg-stone-900 md:hidden"
        aria-label="Primary"
      >
        {allNavItems.map((item) => {
          const isActive = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
                isActive ? "text-brand-700 dark:text-brand-400" : "text-stone-500 dark:text-stone-400"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d={item.icon} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export const RSVP_BADGE: Record<string, string> = {
  yes: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  maybe: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  no: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400",
  "no RSVP": "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
};

export const RSVP_LABEL: Record<string, string> = {
  yes: "Going",
  maybe: "Maybe",
  no: "Declined",
  "no RSVP": "No reply",
};

export { initials };
