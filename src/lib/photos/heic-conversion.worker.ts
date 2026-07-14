/// <reference lib="webworker" />

interface HeicWorkerRequest {
  id: string;
  blob: Blob;
}

interface HeicWorkerResponse {
  id: string;
  blob?: Blob;
  error?: string;
}

self.onmessage = async (event: MessageEvent<HeicWorkerRequest>) => {
  const { id, blob } = event.data;
  try {
    const { heicTo } = await import("heic-to/next");
    const converted = await heicTo({ blob, type: "image/jpeg", quality: 0.9 });
    self.postMessage({ id, blob: converted } satisfies HeicWorkerResponse);
  } catch {
    self.postMessage({
      id,
      error: "This HEIC/HEIF photo could not be converted. It may be damaged or use an unsupported variant.",
    } satisfies HeicWorkerResponse);
  }
};

export {};
