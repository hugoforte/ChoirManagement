import { describe, expect, test } from "vitest";
import { can } from "./roles";
import { Doc } from "../../convex/_generated/dataModel";

function member(role: Doc<"members">["role"]): Doc<"members"> {
  return {
    _id: "member_1" as Doc<"members">["_id"],
    _creationTime: 0,
    clerkUserId: "issuer|subject",
    name: "Test Member",
    email: "test@example.com",
    role,
  };
}

describe("can", () => {
  test("admin holds every capability", () => {
    const admin = member("admin");
    expect(can(admin, "manageEvents")).toBe(true);
    expect(can(admin, "manageLibrary")).toBe(true);
    expect(can(admin, "manageRoster")).toBe(true);
    expect(can(admin, "assignRoles")).toBe(true);
    expect(can(admin, "manageSettings")).toBe(true);
  });

  test("director manages content and roster but not Roles or Settings", () => {
    const director = member("director");
    expect(can(director, "manageEvents")).toBe(true);
    expect(can(director, "manageRoster")).toBe(true);
    expect(can(director, "assignRoles")).toBe(false);
    expect(can(director, "manageSettings")).toBe(false);
  });

  test("chorister holds no management capability", () => {
    const chorister = member("chorister");
    expect(can(chorister, "manageEvents")).toBe(false);
    expect(can(chorister, "manageLibrary")).toBe(false);
    expect(can(chorister, "manageRoster")).toBe(false);
    expect(can(chorister, "assignRoles")).toBe(false);
    expect(can(chorister, "manageSettings")).toBe(false);
  });
});
