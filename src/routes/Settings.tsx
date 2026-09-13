import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
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
  const update = useMutation(api.choirSettings.update);
  const generateLogoUploadUrl = useMutation(api.choirSettings.generateLogoUploadUrl);

  const [fields, setFields] = useState({ name: "", description: "", contactEmail: "" });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    try {
      await update({
        name: fields.name,
        description: fields.description || undefined,
        contactEmail: fields.contactEmail || undefined,
        logoStorageId: settings?.logoStorageId,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploadUrl = await generateLogoUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await update({
        name: fields.name,
        description: fields.description || undefined,
        contactEmail: fields.contactEmail || undefined,
        logoStorageId: storageId,
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <>
      {settings === undefined ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <div className="max-w-xl space-y-6">
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
