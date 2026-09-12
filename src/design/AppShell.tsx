// Design direction "Modern Choir OS": dense, utilitarian app-shell feel.
// Shared shell + small building blocks used by Home, Events, and Members —
// the three routes covered by this design pass. Other routes (Library,
// Settings, the manage screens) are intentionally left in the previous
// style for now; see the PR description for why the scope stops here.
import { Link, useLocation } from "react-router-dom";
import { SignOutButton } from "@clerk/clerk-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" },
  { to: "/events", label: "Events", icon: "M4 5h16M4 11h16M4 17h10" },
  { to: "/library", label: "Library", icon: "M5 4h10a2 2 0 012 2v14l-7-3-7 3V6a2 2 0 012-2z" },
  { to: "/members", label: "Roster", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-4 4-6 8-6s8 2 8 6" },
];

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

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-teal-600 text-xs font-bold text-white">
            {initials(choirName)}
          </div>
          <span className="truncate text-sm font-semibold">{choirName}</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV_ITEMS.map((item) => {
            const isActive = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm ${
                  isActive
                    ? "bg-teal-50 font-medium text-teal-700 dark:bg-teal-500/10 dark:text-teal-400"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d={item.icon} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {item.label}
              </Link>
            );
          })}
          {showSettings && (
            <Link
              to="/settings"
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm ${
                location.pathname.startsWith("/settings")
                  ? "bg-teal-50 font-medium text-teal-700 dark:bg-teal-500/10 dark:text-teal-400"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                <path
                  d="M10.325 4.317a1 1 0 011.35 0l.494.44a1 1 0 00.94.23l.63-.17a1 1 0 011.19.55l.3.6a1 1 0 00.74.54l.65.11a1 1 0 01.79 1.15l-.11.65a1 1 0 00.3.86l.47.46a1 1 0 010 1.42l-.47.46a1 1 0 00-.3.86l.11.65a1 1 0 01-.79 1.15l-.65.11a1 1 0 00-.74.54l-.3.6a1 1 0 01-1.19.55l-.63-.17a1 1 0 00-.94.23l-.49.44a1 1 0 01-1.35 0l-.49-.44a1 1 0 00-.94-.23l-.63.17a1 1 0 01-1.19-.55l-.3-.6a1 1 0 00-.74-.54l-.65-.11a1 1 0 01-.79-1.15l.11-.65a1 1 0 00-.3-.86l-.47-.46a1 1 0 010-1.42l.47-.46a1 1 0 00.3-.86l-.11-.65a1 1 0 01.79-1.15l.65-.11a1 1 0 00.74-.54l.3-.6a1 1 0 011.19-.55l.63.17a1 1 0 00.94-.23l.49-.44z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Settings
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            {initials(viewerName)}
          </div>
          <span className="min-w-0 flex-1 truncate text-sm text-slate-600 dark:text-slate-400">{viewerName}</span>
          <SignOutButton>
            <button className="text-xs text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-200">
              Sign out
            </button>
          </SignOutButton>
        </div>
      </aside>

      <div className="flex-1">
        <header className="flex items-center border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-base font-semibold">{pageTitle}</h1>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

export const RSVP_BADGE: Record<string, string> = {
  yes: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  maybe: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  no: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400",
  "no RSVP": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export const RSVP_LABEL: Record<string, string> = {
  yes: "Going",
  maybe: "Maybe",
  no: "Declined",
  "no RSVP": "No reply",
};

export { initials };
