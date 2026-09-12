import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { MemberGate, isAdmin } from "../lib/memberGate";
import { AppShell, SectionTitle } from "../design/AppShell";

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
    >
      <SectionTitle eyebrow="Season" title="Personnel" />
      {isAdmin(viewer) && (
        <Link
          to="/members/manage"
          className="mb-6 inline-block font-sans text-sm text-amber-800 underline hover:text-amber-900 dark:text-amber-400"
        >
          Manage
        </Link>
      )}

      {members === undefined ? (
        <p className="text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <ul className="divide-y divide-stone-200 dark:divide-stone-800">
          {members.map((member) => (
            <li key={member._id} className="flex items-center justify-between py-2.5">
              <span>{member.name}</span>
              {member.role !== "chorister" && (
                <span className="font-sans text-xs uppercase tracking-wide text-stone-400">{member.role}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
