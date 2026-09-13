import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { can } from "../lib/roles";
import { useTrackedMutation } from "../lib/useTrackedMutation";
import { MemberPage } from "../design/MemberPage";
import { inputClass, cardClass } from "../design/forms";

type Role = Doc<"members">["role"];
const ROLES: Role[] = ["admin", "director", "chorister"];

export default function MembersManage() {
  return (
    <MemberPage
      title="Manage Roles"
      require="manageRoster"
      backTo={{ to: "/members", label: "Back to Member Roster" }}
    >
      {(viewer) => <MembersManageContent viewer={viewer} />}
    </MemberPage>
  );
}

// Director+ reaches this page (manageRoster), but the Role control itself
// stays Admin-only (assignRoles) — per CONTEXT.md, Director manages "the
// Member roster" while only Admin manages "Members, Roles". A Director sees
// each Member's Role as plain text, not an editable <select>; the backend
// mutation enforces the same split independently (members.ts's updateRole).
function MembersManageContent({ viewer }: { viewer: Doc<"members"> }) {
  const members = useQuery(api.members.list);
  const { run: updateRole, error } = useTrackedMutation(api.members.updateRole);
  const canAssignRoles = can(viewer, "assignRoles");

  async function handleRoleChange(memberId: Id<"members">, role: Role) {
    await updateRole({ memberId, role });
  }

  return (
    <>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      {members === undefined ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <div className={cardClass}>
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {members.map((member) => (
              <li key={member._id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm">{member.name}</span>
                {canAssignRoles ? (
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member._id, e.target.value as Role)}
                    className={`${inputClass} w-auto capitalize`}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm capitalize text-stone-600 dark:text-stone-400">{member.role}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
