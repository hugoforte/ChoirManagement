import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { MemberGate, isAdmin } from "../lib/memberGate";

export default function Settings() {
  return (
    <MemberGate>
      {(viewer) =>
        isAdmin(viewer) ? (
          <SettingsContent />
        ) : (
          <div className="mx-auto max-w-2xl p-8">
            <p>You don't have access to this page.</p>
            <Link to="/" className="text-brand-600 underline hover:text-brand-700">
              Back home
            </Link>
          </div>
        )
      }
    </MemberGate>
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

  if (settings === undefined) {
    return <p className="p-8 text-gray-500">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Choir Settings</h1>

      <div className="mt-6">
        <p className="text-sm font-medium">Logo</p>
        {settings?.logoUrl ? (
          <img src={settings.logoUrl} alt="Choir logo" className="mt-2 h-24 w-24 rounded object-cover" />
        ) : (
          <p className="mt-2 text-sm text-gray-500">No logo uploaded yet.</p>
        )}
        <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploading} className="mt-2 text-sm" />
      </div>

      <form onSubmit={handleSave} className="mt-6 space-y-3">
        <div>
          <label htmlFor="settings-name" className="text-sm font-medium">
            Choir name
          </label>
          <input
            id="settings-name"
            type="text"
            value={fields.name}
            onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
            required
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="settings-description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="settings-description"
            value={fields.description}
            onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="settings-contact-email" className="text-sm font-medium">
            Contact email
          </label>
          <input
            id="settings-contact-email"
            type="email"
            value={fields.contactEmail}
            onChange={(e) => setFields((f) => ({ ...f, contactEmail: e.target.value }))}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saving || !fields.name.trim()}
          className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Save
        </button>
      </form>

      <nav className="mt-8">
        <Link to="/" className="text-sm text-gray-600 underline">
          Back home
        </Link>
      </nav>
    </div>
  );
}
