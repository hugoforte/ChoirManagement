import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { MemberGate, isAdmin } from "../lib/memberGate";
import { AppShell } from "../design/AppShell";
import { inputClass, mutedLinkClass, cardClass } from "../design/forms";

type Role = Doc<"members">["role"];
const ROLES: Role[] = ["admin", "director", "chorister"];

export default function MembersManage() {
  return (
    <MemberGate>
      {(viewer) => (isAdmin(viewer) ? <MembersManageContent viewer={viewer} /> : <NoAccess viewer={viewer} />)}
    </MemberGate>
  );
}

function NoAccess({ viewer }: { viewer: Doc<"members"> }) {
  const choirSettings = useQuery(api.choirSettings.get);
  return (
    <AppShell
      choirName={choirSettings?.name ?? "ChoirManagement"}
      viewerName={viewer.name}
      showSettings={isAdmin(viewer)}
      pageTitle="Roster"
    >
      <p className="text-sm text-stone-600 dark:text-stone-400">You don't have access to this page.</p>
      <Link to="/members" className={mutedLinkClass}>
        Back to Member Roster
      </Link>
    </AppShell>
  );
}

function MembersManageContent({ viewer }: { viewer: Doc<"members"> }) {
  const choirSettings = useQuery(api.choirSettings.get);
  const members = useQuery(api.members.list);
  const updateRole = useMutation(api.members.updateRole);

  async function handleRoleChange(memberId: Id<"members">, role: Role) {
    await updateRole({ memberId, role });
  }

  return (
    <AppShell
      choirName={choirSettings?.name ?? "ChoirManagement"}
      viewerName={viewer.name}
      showSettings={isAdmin(viewer)}
      pageTitle="Manage Roles"
    >
      {members === undefined ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <div className={cardClass}>
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {members.map((member) => (
              <li key={member._id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm">{member.name}</span>
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
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
