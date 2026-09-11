import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

export async function getCurrentMember(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"members"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("members")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.tokenIdentifier))
    .unique();
}

export async function requireMember(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"members">> {
  const member = await getCurrentMember(ctx);
  if (!member) {
    throw new Error("Not signed in, or no Member record yet — call members.ensureCurrentMember first");
  }
  return member;
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  roles: Array<Doc<"members">["role"]>,
): Promise<Doc<"members">> {
  const member = await requireMember(ctx);
  if (!roles.includes(member.role)) {
    throw new Error(`Requires role: ${roles.join(" or ")}`);
  }
  return member;
}
