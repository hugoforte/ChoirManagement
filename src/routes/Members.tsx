import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { MemberGate, isAdmin } from "../lib/memberGate";
import { AppShell, initials } from "../design/AppShell";

export default function Members() {
  return <MemberGate>{(viewer) => <MembersContent viewer={viewer} />}</MemberGate>;
}

function MembersContent({ viewer }: { viewer: Doc<"members"> }) {
  const choirSettings = useQuery(api.choirSettings.get);
  const members = useQuery(api.members.list);

  return (
    <AppShell
      choirName={choirSettings?.name ?? "ChoirManagement"}
      viewerName={viewer.name}
      showSettings={isAdmin(viewer)}
      pageTitle="Roster"
    >
      {isAdmin(viewer) && (
        <Link to="/members/manage" className="mb-4 inline-block text-sm text-teal-600 hover:underline dark:text-teal-400">
          Manage
        </Link>
      )}

      {members === undefined ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-4 py-2 font-medium">Member</th>
                <th className="px-4 py-2 font-medium">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {members.map((member) => (
                <tr key={member._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="flex items-center gap-2.5 px-4 py-2.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-100 text-[10px] font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-400">
                      {initials(member.name)}
                    </div>
                    {member.name}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                    {member.role !== "chorister" && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs capitalize dark:bg-slate-800">
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
    </AppShell>
  );
}
