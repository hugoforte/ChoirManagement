import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";

// The single place that owns "is this visitor a usable Member yet." Used by
// every member-only route, not just the dashboard — ensureCurrentMember
// fires here (not just on Home) so landing directly on any gated route
// (e.g. a bookmarked /library link) still creates/syncs the Member record.
// See AGENTS.md's "Gate requireMember-backed queries behind members.viewer
// resolving to a real Member first" rule — members.viewer never throws
// (null covers both "signed out" and "signed in, but ensureCurrentMember
// hasn't finished yet"), which is why isSignedIn is checked separately
// before treating a null viewer as "still setting up."
export function MemberGate({
  children,
  redirectTo = "/public/events",
}: {
  children: (viewer: Doc<"members">) => React.ReactNode;
  redirectTo?: string;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const ensureCurrentMember = useMutation(api.members.ensureCurrentMember);
  const viewer = useQuery(api.members.viewer);

  useEffect(() => {
    if (isSignedIn) {
      void ensureCurrentMember();
    }
  }, [isSignedIn, ensureCurrentMember]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to={redirectTo} replace />;
  if (viewer === undefined) {
    return <p className="p-8 text-gray-500">Loading…</p>;
  }
  if (viewer === null) {
    return <p className="p-8 text-gray-500">Setting up your account…</p>;
  }
  return <>{children(viewer)}</>;
}

export function canManage(viewer: Doc<"members">): boolean {
  return viewer.role === "admin" || viewer.role === "director";
}
