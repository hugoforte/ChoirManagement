import { Link } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { MemberGate, isAdmin } from "../lib/memberGate";

export default function Members() {
  return <MemberGate>{(viewer) => <MembersContent viewer={viewer} />}</MemberGate>;
}

function MembersContent({ viewer }: { viewer: Doc<"members"> }) {
  const members = useQuery(api.members.list);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Member Roster</h1>
        {isAdmin(viewer) && (
          <Link to="/members/manage" className="text-sm text-brand-600 underline hover:text-brand-700">
            Manage
          </Link>
        )}
      </div>

      {members === undefined ? (
        <p className="mt-4 text-gray-500">Loading…</p>
      ) : (
        <ul className="mt-4 space-y-1">
          {members.map((member) => (
            <li key={member._id} className="flex items-center justify-between">
              <span>{member.name}</span>
              <span className="text-sm capitalize text-gray-600">{member.role}</span>
            </li>
          ))}
        </ul>
      )}

      <nav className="mt-8">
        <Link to="/" className="text-sm text-gray-600 underline">
          Back to dashboard
        </Link>
      </nav>
    </div>
  );
}
