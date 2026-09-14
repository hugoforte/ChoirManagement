// The Share Link section of the Bulletin editor (#83, ADR-0004). Lives in its
// own component rather than inline in BulletinManageDetail: the editor's job
// is the Bulletin's content, and this one panel owns four mutations, a
// confirmation and a clipboard call of its own.
//
// The whole link-management surface is issue / change mode / regenerate /
// revoke. There is deliberately no per-recipient link, no expiry, and no
// history of past tokens — see ADR-0004.
import { useState } from "react";
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useTrackedMutation } from "../../lib/useTrackedMutation";
import { inputClass, labelClass, mutedLinkClass, primaryButtonClass } from "../../design/forms";

const REGENERATE_WARNING =
  "Regenerate this Share Link? The current URL stops working immediately for everyone you have sent it to.";

export function ShareLinkPanel({
  bulletinId,
  published,
}: {
  bulletinId: Id<"bulletins">;
  published: boolean;
}) {
  const shareLink = useQuery(api.bulletinShareLinks.get, { bulletinId });
  const { run: issue, pending: issuing, error: issueError } = useTrackedMutation(api.bulletinShareLinks.issue);
  const { run: setMode, pending: settingMode, error: modeError } = useTrackedMutation(
    api.bulletinShareLinks.setMode,
  );
  const { run: regenerate, pending: regenerating, error: regenerateError } = useTrackedMutation(
    api.bulletinShareLinks.regenerate,
  );
  const { run: revoke, pending: revoking, error: revokeError } = useTrackedMutation(
    api.bulletinShareLinks.revoke,
  );
  const [copied, setCopied] = useState(false);

  const busy = issuing || settingMode || regenerating || revoking;
  const error = issueError ?? modeError ?? regenerateError ?? revokeError;

  // Built from the browser's own origin rather than a configured base URL:
  // this app is self-hosted, so every deployment (and every Vercel preview)
  // serves the link it should hand out under the host it was opened on.
  const url = shareLink ? `${window.location.origin}/s/${shareLink.token}` : null;

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused (insecure origin, denied permission).
      // The URL is on screen and selectable either way, so the only thing
      // worth doing is not claiming a copy that didn't happen.
      setCopied(false);
    }
  }

  return (
    <section className="border-t border-stone-200 pt-3 dark:border-stone-800">
      <h2 className={labelClass}>Share Link</h2>

      {!published ? (
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          A draft can't be shared. Publish this Bulletin first, then issue a Share Link.
        </p>
      ) : shareLink === undefined ? (
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">Loading…</p>
      ) : shareLink === null ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-stone-500 dark:text-stone-400">
            No Share Link yet. A sign-in link is readable by any Member; a token link opens without an
            account, read-only.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => issue({ bulletinId, mode: "sign_in_required" })}
              disabled={busy}
              className={primaryButtonClass}
            >
              Create sign-in link
            </button>
            <button
              type="button"
              onClick={() => issue({ bulletinId, mode: "token" })}
              disabled={busy}
              className={primaryButtonClass}
            >
              Create token link
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={url ?? ""} aria-label="Share Link URL" className={inputClass} />
            <button type="button" onClick={handleCopy} className={primaryButtonClass}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div>
            <label htmlFor="share-link-mode" className={labelClass}>
              Who can open it
            </label>
            <select
              id="share-link-mode"
              value={shareLink.mode}
              onChange={(e) => {
                setCopied(false);
                void setMode({ bulletinId, mode: e.target.value as "sign_in_required" | "token" });
              }}
              disabled={busy}
              className={`mt-1 ${inputClass}`}
            >
              <option value="sign_in_required">Members only — sign-in required</option>
              <option value="token">Anyone with the link — read-only, no account</option>
            </select>
            {shareLink.mode === "token" && (
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                Anyone this URL is forwarded to can read this Bulletin without an account. Regenerate it to
                cut off everyone who has it.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(REGENERATE_WARNING)) return;
                setCopied(false);
                void regenerate({ bulletinId });
              }}
              disabled={busy}
              className={mutedLinkClass}
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={() => {
                setCopied(false);
                void revoke({ bulletinId });
              }}
              disabled={busy}
              className={mutedLinkClass}
            >
              Revoke
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
