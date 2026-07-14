import { readTakenAtCandidateFromFields } from "./exif";
import type { ExifTakenAtCandidate } from "@/types/photos";

interface HeicWorkerResponse {
  id: string;
  blob?: Blob;
  error?: string;
}

export async function readHeicTakenAt(file: File): Promise<ExifTakenAtCandidate | null> {
  try {
    const { parse } = await import("exifr");
    const fields = await parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "OffsetTimeOriginal", "OffsetTimeDigitized"],
      ifd1: false,
      gps: false,
      interop: false,
      makerNote: false,
      userComment: false,
      xmp: false,
      icc: false,
      iptc: false,
      jfif: false,
      ihdr: false,
      translateValues: false,
      reviveValues: false,
      sanitize: false,
    }) as Record<string, unknown> | null;
    return readTakenAtCandidateFromFields(fields);
  } catch {
    return null;
  }
}

export async function assertConvertedJpeg(blob: Blob) {
  const signature = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
  if (blob.type !== "image/jpeg" || signature[0] !== 0xff || signature[1] !== 0xd8 || signature[2] !== 0xff) {
    throw new Error("The HEIC/HEIF converter did not produce a valid JPEG image.");
  }
  return blob;
}

export function convertHeicToJpeg(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./heic-conversion.worker.ts", import.meta.url), { type: "module" });
    const id = crypto.randomUUID();
    const finish = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<HeicWorkerResponse>) => {
      if (event.data.id !== id) return;
      finish();
      if (event.data.blob?.size) {
        void assertConvertedJpeg(event.data.blob).then(resolve, reject);
      } else reject(new Error(event.data.error ?? "This HEIC/HEIF photo could not be converted."));
    };
    worker.onerror = () => {
      finish();
      reject(new Error("The HEIC/HEIF converter could not start in this browser."));
    };
    worker.postMessage({ id, blob: file });
  });
}
