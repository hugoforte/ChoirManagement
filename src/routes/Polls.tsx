// Route shell only (#79, the foundations slice shared by #49 and #9). The
// Poll list and closed-Poll history arrive with #88, the availability grid
// with #85. No Poll is ever reachable without signing in (#9) — which is
// why this renders through MemberPage and has no /public twin.
import { Link } from "react-router-dom";

import { Doc } from "../../convex/_generated/dataModel";
import { can } from "../lib/roles";
import { MemberPage } from "../design/MemberPage";
import { linkClass } from "../design/forms";

export default function Polls() {
  return <MemberPage title="Polls">{(viewer) => <PollsContent viewer={viewer} />}</MemberPage>;
}

function PollsContent({ viewer }: { viewer: Doc<"members"> }) {
  return (
    <>
      {can(viewer, "managePolls") && (
        <Link to="/polls/manage" className={`mb-4 inline-block ${linkClass}`}>
          Manage
        </Link>
      )}

      <p className="text-sm text-stone-500 dark:text-stone-400">No Polls yet.</p>
    </>
  );
}
