// The single table naming what CONTEXT.md's Roles describe in prose. Both
// requireCan (convex/lib/auth.ts, the backend adapter) and can
// (src/lib/roles.ts, the frontend adapter) read this same table — the
// Role-to-capability rule used to be written twice, in two vocabularies, an
// inline array literal at 14 convex/ call sites and two ad hoc predicates on
// the frontend, agreeing today by luck rather than by construction (see #28).
//
// Deliberately has no Convex-runtime import (no QueryCtx/MutationCtx) — pure
// data plus a pure function, so both sides of the seam can import it. `Doc`
// is a type only, erased at build, same as every route already importing
// `Doc<"members">` from convex/_generated/dataModel.
import type { Doc } from "../_generated/dataModel";

type Role = Doc<"members">["role"];

// assignRoles is deliberately separate from manageRoster: per CONTEXT.md,
// Director manages "the Member roster" but only Admin manages "Members,
// Roles" — a Director reaches /members/manage, but only an Admin sees or
// can use the Role control within it.
export type Capability = "manageEvents" | "manageLibrary" | "manageRoster" | "assignRoles" | "manageSettings";

const CAPABILITY_ROLES: Record<Capability, readonly Role[]> = {
  manageEvents: ["admin", "director"],
  manageLibrary: ["admin", "director"],
  manageRoster: ["admin", "director"],
  assignRoles: ["admin"],
  manageSettings: ["admin"],
};

export function roleCan(role: Role, capability: Capability): boolean {
  return CAPABILITY_ROLES[capability].includes(role);
}
