// The frontend half of the Role rule. Its backend twin is the
// `requireRole(ctx, [...])` array literal repeated across convex/ — see #28,
// which replaces both with one named capability table.
import { Doc } from "../../convex/_generated/dataModel";

export function canManage(viewer: Doc<"members">): boolean {
  return viewer.role === "admin" || viewer.role === "director";
}

export function isAdmin(viewer: Doc<"members">): boolean {
  return viewer.role === "admin";
}
