/**
 * Downloads a Convex storage URL under a standardized filename.
 *
 * Convex storage URLs are cross-origin, so a plain `<a download>` is ignored
 * by browsers and the file saves under the storage UUID instead of the
 * standardized name. Fetching the bytes and downloading a same-origin Blob
 * URL lets the `download` attribute take effect. If the fetch fails (CORS,
 * network, or a non-OK response), fall back to opening the original URL in
 * a new tab so the Member can still get to the file.
 */
export async function downloadAttachment(url: string, filename: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    window.open(url, "_blank", "noopener");
  }
}
