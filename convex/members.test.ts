/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("bootstrapFirstAdmin promotes the given Member", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("members", {
      clerkUserId: "user_123",
      name: "Test Member",
      email: "test@example.com",
      role: "chorister",
    });
  });

  await t.mutation(internal.members.bootstrapFirstAdmin, { email: "test@example.com" });

  const member = await t.run(async (ctx) => await ctx.db.query("members").first());
  expect(member?.role).toBe("admin");
});

test("bootstrapFirstAdmin refuses once an Admin already exists", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("members", {
      clerkUserId: "existing_admin",
      name: "Existing Admin",
      email: "admin@example.com",
      role: "admin",
    });
    await ctx.db.insert("members", {
      clerkUserId: "user_456",
      name: "Another Member",
      email: "another@example.com",
      role: "chorister",
    });
  });

  await expect(
    t.mutation(internal.members.bootstrapFirstAdmin, { email: "another@example.com" }),
  ).rejects.toThrow(/already exists/);
});

test("bootstrapFirstAdmin refuses an unknown email", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(internal.members.bootstrapFirstAdmin, { email: "nobody@example.com" }),
  ).rejects.toThrow(/No Member found/);
});
