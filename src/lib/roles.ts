// The frontend half of the Role rule. Its backend twin is requireCan
// (convex/lib/auth.ts) — both read the same table (convex/lib/capabilities.ts),
// so the two used to be able to drift is gone (see #28).
import { Doc } from "../../convex/_generated/dataModel";
import { roleCan, type Capability } from "../../convex/lib/capabilities";

export function can(viewer: Doc<"members">, capability: Capability): boolean {
  return roleCan(viewer.role, capability);
}
