import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { can } from "../lib/roles";
import { MemberPage } from "../design/MemberPage";
import { initials } from "../design/AppShell";

export default function Members() {
  return <MemberPage title="Roster">{(viewer) => <MembersContent viewer={viewer} />}</MemberPage>;
}

function MembersContent({ viewer }: { viewer: Doc<"members"> }) {
  const members = useQuery(api.members.list);

  return (
    <>
      {can(viewer, "manageRoster") && (
        <Link to="/members/manage" className="mb-4 inline-block text-sm text-brand-600 hover:underline dark:text-brand-400">
          Manage
        </Link>
      )}

      {members === undefined ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs tracking-wide text-stone-500 dark:border-stone-800 dark:text-stone-400">
                <th className="px-4 py-2 font-medium">Member</th>
                <th className="px-4 py-2 font-medium">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {members.map((member) => (
                <tr key={member._id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                  <td className="flex items-center gap-2.5 px-4 py-2.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-400">
                      {initials(member.name)}
                    </div>
                    {member.name}
                  </td>
                  <td className="px-4 py-2.5 text-stone-600 dark:text-stone-400">
                    {member.role !== "chorister" && (
                      <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs capitalize dark:bg-stone-800">
                        {member.role}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
