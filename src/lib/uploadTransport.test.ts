import { describe, expect, it, vi } from "vitest";
import { createBrowserUploadTransport } from "./uploadTransport";

type EventHandler = (event: ProgressEvent<EventTarget>) => void;

class FakeEventTarget {
  private readonly handlers = new Map<string, EventHandler[]>();

  addEventListener(type: string, handler: EventHandler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  emit(type: string, event = new ProgressEvent(type)): void {
    for (const handler of this.handlers.get(type) ?? []) handler(event);
  }
}

class FakeXhr extends FakeEventTarget {
  readonly upload = new FakeEventTarget();
  status = 200;
  responseText = JSON.stringify({ storageId: "storage-from-xhr", sha256: "abc" });
  method = "";
  url = "";
  body: BodyInit | null = null;
  headers = new Map<string, string>();

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  send(body: BodyInit): void {
    this.body = body;
    this.upload.emit("progress", {
      lengthComputable: true,
      loaded: 3,
      total: 6,
    } as ProgressEvent<EventTarget>);
    this.emit("load");
  }

  abort(): void {
    this.emit("abort");
  }
}

describe("createBrowserUploadTransport", () => {
  it("uses XHR upload progress and returns Convex storage metadata", async () => {
    const xhr = new FakeXhr();
    vi.stubGlobal("XMLHttpRequest", class extends FakeXhr {
      constructor() {
        super();
        Object.assign(this, xhr);
      }
    });
    const generateUploadUrl = vi.fn().mockResolvedValue("https://uploads.test/url");
    const progress: { loaded: number; total: number; percent: number }[] = [];
    const file = new File(["abcdef"], "score.pdf", { type: "application/pdf" });

    const result = await createBrowserUploadTransport(generateUploadUrl).upload(file, {
      signal: new AbortController().signal,
      onProgress: (value) => progress.push(value),
    });

    expect(generateUploadUrl).toHaveBeenCalledOnce();
    expect(result).toEqual({ storageId: "storage-from-xhr", serverSha256: "abc" });
    expect(progress).toEqual([{ loaded: 3, total: 6, percent: 50 }]);
  });
});
