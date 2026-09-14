/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://example.clerk.accounts.dev";
const memberIdentity = { subject: "member_1", issuer };

test("Members list only active voice parts in configured order", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("members", {
      clerkUserId: `${issuer}|member_1`,
      name: "Morgan Member",
      email: "morgan@example.com",
      role: "chorister",
    });
    await ctx.db.insert("voiceParts", {
      name: "Bass",
      normalizedName: "bass",
      displayOrder: 4,
      status: "active",
      isAll: false,
      defaultKey: "bass",
      updatedAt: 1,
    });
    await ctx.db.insert("voiceParts", {
      name: "All",
      normalizedName: "all",
      displayOrder: 0,
      status: "active",
      isAll: true,
      defaultKey: "all",
      updatedAt: 1,
    });
    await ctx.db.insert("voiceParts", {
      name: "Archived",
      normalizedName: "archived",
      displayOrder: 1,
      status: "archived",
      isAll: false,
      updatedAt: 1,
    });
  });

  await expect(t.query(api.voiceParts.listActive, {})).rejects.toThrow(
    /Not signed in/,
  );
  const parts = await t
    .withIdentity(memberIdentity)
    .query(api.voiceParts.listActive, {});
  expect(parts.map((part) => part.name)).toEqual(["All", "Bass"]);
});
