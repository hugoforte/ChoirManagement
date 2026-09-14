// Route shell only (#79, the foundations slice shared by #49 and #9). The
// archive, the reading view and the unread marker arrive with #82; this
// exists now so both epics have their navigation and capability gate in
// place before either starts.
import { Link } from "react-router-dom";

import { Doc } from "../../convex/_generated/dataModel";
import { can } from "../lib/roles";
import { MemberPage } from "../design/MemberPage";
import { linkClass } from "../design/forms";

export default function Bulletins() {
  return <MemberPage title="Bulletins">{(viewer) => <BulletinsContent viewer={viewer} />}</MemberPage>;
}

function BulletinsContent({ viewer }: { viewer: Doc<"members"> }) {
  return (
    <>
      {can(viewer, "manageBulletins") && (
        <Link to="/bulletins/manage" className={`mb-4 inline-block ${linkClass}`}>
          Manage
        </Link>
      )}

      <p className="text-sm text-stone-500 dark:text-stone-400">No Bulletins yet.</p>
    </>
  );
}
