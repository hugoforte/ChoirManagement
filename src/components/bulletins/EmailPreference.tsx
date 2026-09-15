// The Member's own opt-out from Bulletin email (#52).
//
// It lives on the Bulletin archive rather than in Settings or a profile
// page: Settings is the Choir's settings and is Admin-only, and this app has
// no per-Member profile surface to put it in. The archive is the page every
// Member already visits about Bulletins, which makes it the least surprising
// place to decide how Bulletins reach you.
//
// Reads the preference straight off the viewer MemberPage already resolved,
// so the toggle costs no extra subscription.
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { useTrackedMutation } from "../../lib/useTrackedMutation";
import { checkboxClass } from "../../design/forms";

const mutedText = "text-xs text-stone-500 dark:text-stone-400";

export function EmailPreference({ enabled }: { enabled: boolean }) {
  // Hidden entirely on a deployment with no mail provider: offering to turn
  // off email that nobody is sending is worse than saying nothing.
  const emailConfigured = useQuery(api.bulletinEmails.isConfigured);
  const { run: setEmailBulletins, pending, error } = useTrackedMutation(
    api.members.setEmailBulletins,
  );

  if (emailConfigured !== true) return null;

  return (
    <section className="mt-6 border-t border-stone-200 pt-3 dark:border-stone-800">
      <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => void setEmailBulletins({ enabled: e.target.checked })}
          disabled={pending}
          className={checkboxClass}
        />
        Email me published Bulletins
      </label>
      <p className={`mt-1 ${mutedText}`}>
        Turning this off doesn't hide anything — every Bulletin still appears here.
      </p>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </section>
  );
}
