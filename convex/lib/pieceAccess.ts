import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireMember } from "./auth";

// This is intentionally the one place where Piece visibility is decided.
// Every Member may currently access every Piece. Future event/setlist access
// rules can narrow this function without making callers rediscover that rule.
export async function requirePieceAccess(
  ctx: QueryCtx | MutationCtx,
  pieceId: Id<"pieces">,
): Promise<Doc<"pieces">> {
  const piece = await findPieceWithAccess(ctx, pieceId);
  if (!piece) throw new Error("Piece not found");
  return piece;
}

export async function findPieceWithAccess(
  ctx: QueryCtx | MutationCtx,
  pieceId: Id<"pieces">,
): Promise<Doc<"pieces"> | null> {
  await requireMember(ctx);
  return await ctx.db.get("pieces", pieceId);
}
