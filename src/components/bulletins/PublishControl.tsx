// Publishing a Bulletin, and the one moment the Choir can be emailed about
// it (#52). Its own component rather than another button in the editor's
// form, because publishing now carries a decision: a Bulletin publishes
// exactly once, so "email the roster" is a choice with no second chance and
// no later edit that could re-send.
//
// Checked by default — the email is the thing #49 set out to replace, so
// sending is the ordinary case and skipping is the deliberate one (a typo
// fix, a re-publish of something already announced in person).
import { useState } from "react";
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useTrackedMutation } from "../../lib/useTrackedMutation";
import { checkboxClass, primaryButtonClass } from "../../design/forms";

const mutedText = "text-xs text-stone-500 dark:text-stone-400";

export function PublishControl({ bulletinId }: { bulletinId: Id<"bulletins"> }) {
  // undefined while loading; false on a deployment with no mail provider
  // configured, which is a supported way to run this app rather than a
  // misconfiguration to nag about.
  const emailConfigured = useQuery(api.bulletinEmails.isConfigured);
  const { run: publish, pending, error } = useTrackedMutation(api.bulletins.publish);
  const [sendEmail, setSendEmail] = useState(true);

  return (
    <div className="space-y-2">
      {emailConfigured === undefined ? null : emailConfigured ? (
        <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className={checkboxClass}
          />
          Email this Bulletin to the roster
        </label>
      ) : (
        <p className={mutedText}>
          Email is not configured for this deployment. Publishing still works; nobody is emailed.
        </p>
      )}

      <button
        type="button"
        // `emailConfigured === true &&` rather than the checkbox alone: the
        // control is hidden while the query is loading, and asking to send on
        // a deployment that cannot would only manufacture failed rows.
        onClick={() => void publish({ bulletinId, sendEmail: emailConfigured === true && sendEmail })}
        disabled={pending}
        className={primaryButtonClass}
      >
        Publish
      </button>

      <p className={mutedText}>
        Publishing is permanent — there is no un-publish. Save first; publishing doesn't save the form.
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
