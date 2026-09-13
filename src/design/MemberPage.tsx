// The single module every member-only route renders through. It owns the
// whole preamble those routes used to repeat by hand: resolving the visitor
// into a Member, the capability check and its denial screen, fetching the
// Choir name for the shell, and the loading states before either is known.
//
// A route that used to open with ~20 lines of gate + NoAccess twin + a
// choirSettings subscription now opens with one element and a title.
//
// See AGENTS.md's "Gate requireMember-backed queries behind members.viewer
// resolving to a real Member first" rule — members.viewer never throws (null
// covers both "signed out" and "signed in, but ensureCurrentMember hasn't
// finished yet"), which is why isSignedIn is checked separately before
// treating a null viewer as "still setting up."
import { createContext, useContext, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { isAdmin } from "../lib/roles";
import { AppShell } from "./AppShell";
import { mutedLinkClass } from "./forms";

const DEFAULT_CHOIR_NAME = "ChoirManagement";

type Gate = (viewer: Doc<"members">) => boolean;

const SetPageTitleContext = createContext<(title: string | undefined) => void>(() => {});

// For the three detail routes whose heading is the name of the thing being
// viewed, which isn't known until its own query resolves. Pass undefined
// while loading and the MemberPage's own `title` shows through.
export function usePageTitle(title: string | undefined) {
  const setPageTitle = useContext(SetPageTitleContext);
  useEffect(() => {
    setPageTitle(title);
    return () => setPageTitle(undefined);
  }, [setPageTitle, title]);
}

type MemberPageProps = {
  title: string;
  // Omitted means "any Member." When given and the viewer fails it, they get
  // the denial screen instead of `children` — the route never sees them.
  require?: Gate;
  // Where the denial screen points. Only read when `require` is given.
  backTo?: { to: string; label: string };
  children: (viewer: Doc<"members">) => React.ReactNode;
};

export function MemberPage(props: MemberPageProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const ensureCurrentMember = useMutation(api.members.ensureCurrentMember);
  const viewer = useQuery(api.members.viewer);

  // Fires here rather than only on the dashboard, so landing directly on any
  // gated route (a bookmarked /library link, say) still creates/syncs the
  // Member record.
  useEffect(() => {
    if (isSignedIn) {
      void ensureCurrentMember();
    }
  }, [isSignedIn, ensureCurrentMember]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to="/public/events" replace />;
  if (viewer === undefined) return <Interstitial>Loading…</Interstitial>;
  if (viewer === null) return <Interstitial>Setting up your account…</Interstitial>;

  return <ResolvedMemberPage viewer={viewer} {...props} />;
}

// Split from the gate deliberately, not for tidiness: `choirSettings.get` is
// requireMember-backed and throws for an anonymous caller, so it must not
// subscribe until `viewer` is a real Member. Hooks can't be conditional, so
// the subscription lives in a component that only mounts once it is.
function ResolvedMemberPage({
  viewer,
  title,
  require: gate,
  backTo,
  children,
}: MemberPageProps & { viewer: Doc<"members"> }) {
  const choirSettings = useQuery(api.choirSettings.get);
  const [dynamicTitle, setDynamicTitle] = useState<string | undefined>(undefined);

  const shell = {
    choirName: choirSettings?.name ?? DEFAULT_CHOIR_NAME,
    viewerName: viewer.name,
    showSettings: isAdmin(viewer),
  };

  if (gate && !gate(viewer)) {
    return (
      <AppShell {...shell} pageTitle={title}>
        <p className="text-sm text-stone-600 dark:text-stone-400">You don't have access to this page.</p>
        <Link to={backTo?.to ?? "/"} className={mutedLinkClass}>
          {backTo?.label ?? "Back home"}
        </Link>
      </AppShell>
    );
  }

  return (
    <SetPageTitleContext.Provider value={setDynamicTitle}>
      <AppShell {...shell} pageTitle={dynamicTitle ?? title}>
        {children(viewer)}
      </AppShell>
    </SetPageTitleContext.Provider>
  );
}

// Shown before there's a viewer to build the chrome around, so it can't live
// inside AppShell. It at least carries the app's own background and palette,
// rather than dropping to a bare paragraph on white.
function Interstitial({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 dark:bg-stone-950">
      <p className="text-sm text-stone-500 dark:text-stone-400">{children}</p>
    </div>
  );
}
