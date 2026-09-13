/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("ensureCurrentMember creates on first login, syncs name/email on later logins", async () => {
  const t = convexTest(schema, modules);
  const identity = { subject: "user_abc", issuer: "https://example.clerk.accounts.dev" };

  const id1 = await t
    .withIdentity({ ...identity, name: "Old Name", email: "old@example.com" })
    .mutation(api.members.ensureCurrentMember, {});

  // Same underlying identity, but the JWT now carries different claims —
  // e.g. the choir added email/name claims to the JWT template after this
  // Member's first login. Should patch the existing row, not insert a
  // second one, and should never touch role.
  const id2 = await t
    .withIdentity({ ...identity, name: "New Name", email: "new@example.com" })
    .mutation(api.members.ensureCurrentMember, {});

  expect(id2).toBe(id1);
  const member = await t.run(async (ctx) => await ctx.db.get("members", id1));
  expect(member).toMatchObject({ name: "New Name", email: "new@example.com", role: "chorister" });
});

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

test("setMemberRole updates an existing Member's role", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("members", {
      clerkUserId: "user_789",
      name: "Future Director",
      email: "director@example.com",
      role: "chorister",
    });
  });

  await t.mutation(internal.members.setMemberRole, { email: "director@example.com", role: "director" });

  const member = await t.run(async (ctx) => await ctx.db.query("members").first());
  expect(member?.role).toBe("director");
});

test("setMemberRole refuses an unknown email", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(internal.members.setMemberRole, { email: "nobody@example.com", role: "admin" }),
  ).rejects.toThrow(/No Member found/);
});

const adminIdentity = { subject: "admin_1", issuer: "https://example.clerk.accounts.dev" };
const choristerIdentity = { subject: "chorister_1", issuer: "https://example.clerk.accounts.dev" };

test("list returns name + role for every Member, without email or clerkUserId", async () => {
  const t = convexTest(schema, modules);
  const adminId = await t.run(async (ctx) =>
    ctx.db.insert("members", {
      clerkUserId: `${adminIdentity.issuer}|${adminIdentity.subject}`,
      name: "Admin Member",
      email: "admin@example.com",
      role: "admin",
    }),
  );
  await t.run(async (ctx) =>
    ctx.db.insert("members", {
      clerkUserId: "other_user",
      name: "Chorister Member",
      email: "chorister@example.com",
      role: "chorister",
    }),
  );

  const roster = await t.withIdentity(adminIdentity).query(api.members.list, {});

  expect(roster).toHaveLength(2);
  expect(roster).toContainEqual({ _id: adminId, name: "Admin Member", role: "admin" });
  expect(roster.every((m) => !("email" in m) && !("clerkUserId" in m))).toBe(true);
});

test("list refuses a signed-out caller", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.members.list, {})).rejects.toThrow();
});

test("updateRole changes an existing Member's role", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) =>
    ctx.db.insert("members", {
      clerkUserId: `${adminIdentity.issuer}|${adminIdentity.subject}`,
      name: "Admin Member",
      email: "admin@example.com",
      role: "admin",
    }),
  );
  const targetId = await t.run(async (ctx) =>
    ctx.db.insert("members", {
      clerkUserId: "other_user",
      name: "Future Director",
      email: "future-director@example.com",
      role: "chorister",
    }),
  );

  await t.withIdentity(adminIdentity).mutation(api.members.updateRole, { memberId: targetId, role: "director" });

  const member = await t.run(async (ctx) => await ctx.db.get("members", targetId));
  expect(member?.role).toBe("director");
});

test("updateRole refuses a non-admin caller", async () => {
  const t = convexTest(schema, modules);
  const targetId = await t.run(async (ctx) =>
    ctx.db.insert("members", {
      clerkUserId: `${choristerIdentity.issuer}|${choristerIdentity.subject}`,
      name: "Chorister Member",
      email: "chorister@example.com",
      role: "chorister",
    }),
  );

  await expect(
    t.withIdentity(choristerIdentity).mutation(api.members.updateRole, { memberId: targetId, role: "admin" }),
  ).rejects.toThrow(/Requires capability: assignRoles/);
});
