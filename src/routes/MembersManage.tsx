import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { MemberGate, isAdmin } from "../lib/memberGate";

type Role = Doc<"members">["role"];
const ROLES: Role[] = ["admin", "director", "chorister"];

export default function MembersManage() {
  return (
    <MemberGate>
      {(viewer) =>
        isAdmin(viewer) ? (
          <MembersManageContent />
        ) : (
          <div className="mx-auto max-w-2xl p-8">
            <p>You don't have access to this page.</p>
            <Link to="/members" className="text-brand-600 underline hover:text-brand-700">
              Back to Member Roster
            </Link>
          </div>
        )
      }
    </MemberGate>
  );
}

function MembersManageContent() {
  const members = useQuery(api.members.list);
  const updateRole = useMutation(api.members.updateRole);

  async function handleRoleChange(memberId: Id<"members">, role: Role) {
    await updateRole({ memberId, role });
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Manage Member Roles</h1>

      {members === undefined ? (
        <p className="mt-4 text-gray-500">Loading…</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {members.map((member) => (
            <li key={member._id} className="flex items-center justify-between">
              <span>{member.name}</span>
              <select
                value={member.role}
                onChange={(e) => handleRoleChange(member._id, e.target.value as Role)}
                className="rounded border border-gray-300 px-2 py-1 text-sm capitalize"
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}

      <nav className="mt-8">
        <Link to="/members" className="text-sm text-gray-600 underline">
          Back to Member Roster
        </Link>
      </nav>
    </div>
  );
}
