import { useEffect, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { useTrackedMutation } from "../lib/useTrackedMutation";
import { useUpload } from "../lib/useUpload";
import { MemberPage } from "../design/MemberPage";
import { inputClass, labelClass, primaryButtonClass } from "../design/forms";

export default function Settings() {
  return (
    <MemberPage title="Settings" require="manageSettings">
      {() => <SettingsContent />}
    </MemberPage>
  );
}

function SettingsContent() {
  const settings = useQuery(api.choirSettings.get);
  const { run: update, pending: saving, error: saveError } = useTrackedMutation(api.choirSettings.update);
  const { upload, uploading, error: uploadError } = useUpload(api.choirSettings.generateLogoUploadUrl);

  const [fields, setFields] = useState({ name: "", description: "", contactEmail: "" });

  const error = saveError ?? uploadError;

  // Convex's singleton settings doc loads asynchronously (starts undefined),
  // so the form fields can't just be initialized from it at useState time —
  // sync once the first real value arrives.
  useEffect(() => {
    if (settings === undefined) return;
    setFields({
      name: settings?.name ?? "",
      description: settings?.description ?? "",
      contactEmail: settings?.contactEmail ?? "",
    });
  }, [settings === undefined]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await update({
      name: fields.name,
      description: fields.description || undefined,
      contactEmail: fields.contactEmail || undefined,
      logoStorageId: settings?.logoStorageId,
    });
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const storageId = await upload(file);
    e.target.value = "";
    if (storageId === undefined) return; // upload's own error is already surfaced
    await update({
      name: fields.name,
      description: fields.description || undefined,
      contactEmail: fields.contactEmail || undefined,
      logoStorageId: storageId,
    });
  }

  return (
    <>
      {settings === undefined ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <div className="max-w-xl space-y-6">
          {error && <p className="text-sm text-danger">{error}</p>}
          <div>
            <p className={labelClass}>Logo</p>
            {settings?.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt="Choir logo"
                className="mt-2 h-24 w-24 rounded-xl object-cover"
              />
            ) : (
              <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">No logo uploaded yet.</p>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              disabled={uploading}
              className="mt-2 text-sm"
            />
          </div>

          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label htmlFor="settings-name" className={labelClass}>
                Choir name
              </label>
              <input
                id="settings-name"
                type="text"
                value={fields.name}
                onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
                required
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label htmlFor="settings-description" className={labelClass}>
                Description
              </label>
              <textarea
                id="settings-description"
                value={fields.description}
                onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label htmlFor="settings-contact-email" className={labelClass}>
                Contact email
              </label>
              <input
                id="settings-contact-email"
                type="email"
                value={fields.contactEmail}
                onChange={(e) => setFields((f) => ({ ...f, contactEmail: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <button type="submit" disabled={saving || !fields.name.trim()} className={primaryButtonClass}>
              Save
            </button>
          </form>
        </div>
      )}
    </>
  );
}
